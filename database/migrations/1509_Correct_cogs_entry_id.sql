-- Migration 1509: Correct cogs_entry_id backfill to reference the actual
-- journal_entry_lines row, not the journal_entries header
--
-- ROOT CAUSE OF 1508's FAILURE:
-- inventory_transactions.cogs_entry_id has a foreign key to
-- journal_entry_lines(id), NOT journal_entries(id). Migration 1508 set it
-- to v_je_result.journal_entry_id -- the journal entry HEADER id returned
-- by create_refund_journal_entry() -- which can never satisfy that FK,
-- since header ids and line ids are drawn from different rows entirely.
-- Confirmed live via a real refund: the UPDATE raised
-- "violates foreign key constraint inventory_transactions_cogs_entry_id_fkey"
-- and rolled back the whole approval transaction.
--
-- This is the same bug SHAPE as an earlier, already-fixed issue in this
-- codebase (POS-sale COGS recording once pointed cogs_entry_id at
-- journal_entries.id instead of journal_entry_lines.id) -- migration 1508
-- reintroduced the identical mistake on the refund path. The FK constraint
-- caught it this time before it could commit, which is why this is being
-- corrected here rather than discovered later as bad data.
--
-- CONFIRMED FROM create_refund_journal_entry()'s actual source:
-- - There is exactly ONE aggregated "Credit COGS" line per refund journal
--   entry (v_total_cogs is already SUM()'d across every returned item), not
--   one line per product. So one shared cogs_entry_id value per refund is
--   correct by design -- this migration does not change that shape, only
--   which id gets written.
-- - The COGS line is identified by: journal_entry_id = the header id,
--   account_id = the business's account_code '5100' (COGS -- same
--   convention used by get_profit_loss()), line_type = 'credit'.
-- - This line only exists when v_has_products AND v_total_cogs > 0. If a
--   refund has no product-linked items (e.g. a services-only refund), no
--   inventory_transactions rows exist for it either (reverse_inventory_on_refund
--   only inserts rows when product_id IS NOT NULL), so there's nothing to
--   backfill in that case -- correctly a no-op, not a bug.
--
-- FIX: after journal entry creation (Step 4), look up the specific COGS
-- line's id from journal_entry_lines, then use THAT id (not the header id)
-- in the inventory_transactions UPDATE.

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
    v_cogs_line_id UUID;
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
        -- STEP 4b (CORRECTED in 1509, was broken in 1508): link the
        -- inventory_transactions rows written in Step 1 back to the
        -- specific COGS journal_entry_lines row -- not the journal_entries
        -- header, which cogs_entry_id's foreign key does not permit.
        -- ---------------------------------------------------------------
        IF v_refund_items_count > 0 THEN
            SELECT jel.id INTO v_cogs_line_id
            FROM journal_entry_lines jel
            JOIN chart_of_accounts ca ON ca.id = jel.account_id
            WHERE jel.journal_entry_id = v_je_result.journal_entry_id
              AND ca.business_id = NEW.business_id
              AND ca.account_code = '5100'
              AND jel.line_type = 'credit'
            LIMIT 1;

            IF v_cogs_line_id IS NOT NULL THEN
                UPDATE inventory_transactions
                SET cogs_entry_id = v_cogs_line_id
                WHERE reference_type = 'refund'
                  AND reference_id = NEW.id
                  AND business_id = NEW.business_id
                  AND cogs_entry_id IS NULL;
            END IF;
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
