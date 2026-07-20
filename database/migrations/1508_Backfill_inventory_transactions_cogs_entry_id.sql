-- Migration 1508: Backfill inventory_transactions.cogs_entry_id on refunds
--
-- ROOT CAUSE (documented in v10.0 report, Part 3):
-- Migration 1504 correctly reordered inventory reversal (Step 1) to run
-- BEFORE journal entry creation (Step 4), so the journal entry's COGS sum
-- is correct. But nothing was added afterward to link the inventory_transactions
-- rows back to the journal entry they informed. cogs_entry_id has been NULL
-- on every refund's inventory_transactions row since 1504, even though the
-- journal entry itself is correct and balanced.
--
-- IMPACT: Cosmetic / audit-trail only. Does not affect financial correctness
-- (confirmed in prior review — the journal entry and GL are right either way).
-- Only affects anyone trying to trace an inventory_transactions row forward
-- to its journal entry via this column specifically.
--
-- FIX: Add one UPDATE after journal entry creation (Step 4), matching on the
-- same reference_type/reference_id pair reverse_inventory_on_refund() uses
-- when it writes inventory_transactions rows in Step 1. No other logic in
-- the trigger is touched.

CREATE OR REPLACE FUNCTION public.process_refund_accounting()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_je_result RECORD;
    v_inv_result RECORD;
    v_disc_result RECORD;
    v_tax_result RECORD;
    v_updated_status TEXT;
    v_refund_items_count INTEGER;
    v_period_check RECORD;
BEGIN
    IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status != 'APPROVED') THEN

        -- CHECK PERIOD CLOSING FIRST (unchanged)
        SELECT * INTO v_period_check
        FROM check_period_open_for_refund(NEW.original_transaction_id, NEW.original_transaction_type);

        IF NOT v_period_check.is_open THEN
            RAISE EXCEPTION 'Cannot process refund: Accounting period % is closed (closed on %)',
                v_period_check.period_name, v_period_check.closed_date;
        END IF;

        RAISE NOTICE '🔄 Processing refund accounting for: %', NEW.refund_number;

        -- ---------------------------------------------------------------
        -- STEP 1 (moved up, was step 4): inventory reversal FIRST, so the
        -- inventory_transactions rows it inserts exist before the journal
        -- entry sums them for the COGS/Inventory lines. Result is now
        -- captured and checked instead of PERFORM-discarded.
        -- ---------------------------------------------------------------
        SELECT COUNT(*) INTO v_refund_items_count FROM refund_items WHERE refund_id = NEW.id;

        IF v_refund_items_count > 0 THEN
            SELECT * INTO v_inv_result FROM reverse_inventory_on_refund(NEW.id, NEW.approved_by);
            IF NOT v_inv_result.success THEN
                RAISE EXCEPTION 'Refund inventory reversal failed for %: %',
                    NEW.refund_number, v_inv_result.message;
            END IF;
            RAISE NOTICE '📦 Processed inventory reversal for % items', v_inv_result.items_processed;
        END IF;

        -- ---------------------------------------------------------------
        -- STEP 2: discount reversal. Result now captured and checked.
        -- ---------------------------------------------------------------
        IF NEW.discount_refunded > 0 THEN
            SELECT * INTO v_disc_result FROM reverse_discounts_on_refund(NEW.id, NEW.approved_by);
            IF NOT v_disc_result.success THEN
                RAISE EXCEPTION 'Refund discount reversal failed for %: %',
                    NEW.refund_number, v_disc_result.message;
            END IF;
            RAISE NOTICE '💰 Processed discount reversal: %', NEW.discount_refunded;
        END IF;

        -- ---------------------------------------------------------------
        -- STEP 3: tax reversal. Result now captured and checked.
        -- ---------------------------------------------------------------
        IF NEW.tax_refunded > 0 THEN
            SELECT * INTO v_tax_result FROM reverse_tax_on_refund(NEW.id, NEW.approved_by);
            IF NOT v_tax_result.success THEN
                RAISE EXCEPTION 'Refund tax reversal failed for %: %',
                    NEW.refund_number, v_tax_result.message;
            END IF;
            RAISE NOTICE '🏛️ Processed tax reversal: %', NEW.tax_refunded;
        END IF;

        -- ---------------------------------------------------------------
        -- STEP 4 (moved down, was step 2): journal entry. Now that
        -- inventory reversal has run, its COGS sum will be correct.
        -- ---------------------------------------------------------------
        SELECT * INTO v_je_result FROM create_refund_journal_entry(NEW.id, NEW.approved_by);
        IF NOT v_je_result.success THEN
            RAISE EXCEPTION 'Refund accounting failed for %: %', NEW.refund_number, v_je_result.message;
        END IF;
        RAISE NOTICE '✅ Journal entry created: %', v_je_result.journal_entry_id;

        -- ---------------------------------------------------------------
        -- STEP 4b (NEW in 1508): link the inventory_transactions rows
        -- written in Step 1 back to the journal entry created in Step 4.
        -- Matches on the same (reference_type, reference_id) pair
        -- reverse_inventory_on_refund() uses. No-op if there were no
        -- refund items (v_refund_items_count = 0), since no rows would
        -- exist to match.
        -- ---------------------------------------------------------------
        IF v_refund_items_count > 0 THEN
            UPDATE inventory_transactions
            SET cogs_entry_id = v_je_result.journal_entry_id
            WHERE reference_type = 'refund'
              AND reference_id = NEW.id
              AND business_id = NEW.business_id
              AND cogs_entry_id IS NULL;
        END IF;

        -- ---------------------------------------------------------------
        -- STEP 5: update original transaction + line items (unchanged)
        -- ---------------------------------------------------------------
        IF NEW.original_transaction_type = 'POS' THEN
            UPDATE pos_transactions
            SET refunded_amount = COALESCE(refunded_amount, 0) + NEW.total_refunded,
                refund_status = CASE
                    WHEN COALESCE(refunded_amount, 0) + NEW.total_refunded >= total_amount THEN 'FULL'
                    ELSE 'PARTIAL'
                END,
                updated_at = NOW()
            WHERE id = NEW.original_transaction_id
            RETURNING refund_status INTO v_updated_status;

            UPDATE pos_transaction_items
            SET already_refunded_qty = COALESCE(already_refunded_qty, 0) + ri.quantity_refunded,
                already_refunded_amount = COALESCE(already_refunded_amount, 0) + ri.total_refunded
            FROM refund_items ri
            WHERE ri.refund_id = NEW.id
            AND pos_transaction_items.id = ri.original_line_item_id;

        ELSIF NEW.original_transaction_type = 'INVOICE' THEN
            UPDATE invoices
            SET refunded_amount = COALESCE(refunded_amount, 0) + NEW.total_refunded,
                refund_status = CASE
                    WHEN COALESCE(refunded_amount, 0) + NEW.total_refunded >= total_amount THEN 'FULL'
                    ELSE 'PARTIAL'
                END,
                updated_at = NOW()
            WHERE id = NEW.original_transaction_id
            RETURNING refund_status INTO v_updated_status;

            UPDATE invoice_line_items
            SET already_refunded_qty = COALESCE(already_refunded_qty, 0) + ri.quantity_refunded,
                already_refunded_amount = COALESCE(already_refunded_amount, 0) + ri.total_refunded
            FROM refund_items ri
            WHERE ri.refund_id = NEW.id
            AND invoice_line_items.id = ri.original_line_item_id;
        END IF;

        -- ---------------------------------------------------------------
        -- STEP 6: completion audit log (unchanged)
        -- ---------------------------------------------------------------
        INSERT INTO audit_logs (
            business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, metadata, created_at
        ) VALUES (
            NEW.business_id, NEW.approved_by, 'refund.processed.complete', 'refund', NEW.id,
            jsonb_build_object('old_status', OLD.status),
            jsonb_build_object('new_status', NEW.status,
                                'journal_entry_id', v_je_result.journal_entry_id,
                                'refund_amount', NEW.total_refunded),
            jsonb_build_object('trigger', 'process_refund_accounting',
                                'items_processed', v_refund_items_count,
                                'discount_reversed', NEW.discount_refunded > 0,
                                'tax_reversed', NEW.tax_refunded > 0),
            NOW()
        );

        RAISE NOTICE '✅ Refund processing complete for: %', NEW.refund_number;
    END IF;

    RETURN NEW;
END;
$function$;
