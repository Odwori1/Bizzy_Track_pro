-- ============================================================================
-- Migration 1504: Fix refund accounting gaps found in Phase 20 pre-flight review
--
-- Must be run as `postgres` (DDL / CREATE FUNCTION). Grant EXECUTE to
-- bizzytrack_user on the three recreated functions after running (see bottom).
--
-- Fixes three confirmed defects, all inside process_refund_accounting() and
-- its two dependents:
--
--   1. ORDERING BUG (silent, 100% of refunds with products):
--      create_refund_journal_entry() summed inventory_transactions for COGS
--      BEFORE reverse_inventory_on_refund() had inserted the reversal rows.
--      v_total_cogs was always 0 -> COGS/Inventory journal lines were always
--      skipped. Physical stock was restored correctly; the books never
--      reflected it. Fix: call inventory reversal before the journal entry.
--
--   2. SILENT PERFORM FAILURES:
--      The trigger called reverse_inventory_on_refund/reverse_discounts_on_refund/
--      reverse_tax_on_refund with PERFORM, discarding their (success, message)
--      return values. Each function catches its own exceptions and returns
--      success=false instead of re-raising, so a real failure inside any of
--      them was invisible to the trigger, which proceeded to mark the refund
--      APPROVED/COMPLETED anyway. Fix: capture the result and RAISE EXCEPTION
--      on failure, consistent with how create_refund_journal_entry's result
--      was already (correctly) checked.
--
--   3. NON-PROPORTIONAL DISCOUNT REVERSAL:
--      reverse_discounts_on_refund() voided the ENTIRE original discount
--      allocation on any refund that touched it, regardless of whether the
--      refund was partial. A second partial refund on the same sale then
--      found zero APPLIED allocations left to reverse, breaking the
--      allocation-level audit trail after the first partial refund.
--      Fix: track a running reversed_discount_amount per allocation, only
--      reverse proportionally to what THIS refund is actually returning, and
--      only flip status to VOID once fully reversed.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- STEP 1: Schema change to support proportional discount reversal
-- ----------------------------------------------------------------------------
ALTER TABLE discount_allocations
  ADD COLUMN IF NOT EXISTS reversed_discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Guard against ever reversing more than was originally allocated (with a
-- small rounding tolerance, matching the tolerance style used elsewhere in
-- this codebase, e.g. the 0.01 checks in refundService.js).
ALTER TABLE discount_allocations
  DROP CONSTRAINT IF EXISTS chk_reversed_not_exceed_total;
ALTER TABLE discount_allocations
  ADD CONSTRAINT chk_reversed_not_exceed_total
  CHECK (reversed_discount_amount <= total_discount_amount + 0.01);

-- ----------------------------------------------------------------------------
-- STEP 2: Proportional discount reversal
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_discounts_on_refund(p_refund_id uuid, p_user_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_refund RECORD;
    v_allocation RECORD;
    v_remaining_to_reverse NUMERIC(15,2);
    v_this_reversal NUMERIC(15,2);
    v_new_reversed_total NUMERIC(15,2);
    v_error_message TEXT;
BEGIN
    SELECT business_id, original_transaction_id, original_transaction_type, discount_refunded
    INTO v_refund FROM refunds WHERE id = p_refund_id;

    IF NOT FOUND THEN
        success := FALSE; message := 'Refund not found'; RETURN NEXT; RETURN;
    END IF;

    IF v_refund.discount_refunded = 0 THEN
        success := TRUE; message := 'No discounts to reverse'; RETURN NEXT; RETURN;
    END IF;

    v_remaining_to_reverse := v_refund.discount_refunded;

    -- Walk allocations that still have un-reversed discount, oldest first,
    -- reversing only as much as THIS refund actually returns. This makes
    -- repeated partial refunds against the same sale correctly draw down
    -- the same allocation instead of finding it already voided.
    FOR v_allocation IN
        SELECT da.* FROM discount_allocations da
        WHERE (da.pos_transaction_id = v_refund.original_transaction_id
               OR da.invoice_id = v_refund.original_transaction_id)
          AND da.is_refund_reversal = FALSE
          AND da.reversed_discount_amount < da.total_discount_amount - 0.005
        ORDER BY da.created_at
        FOR UPDATE
    LOOP
        EXIT WHEN v_remaining_to_reverse <= 0.005;

        v_this_reversal := LEAST(
            v_remaining_to_reverse,
            v_allocation.total_discount_amount - v_allocation.reversed_discount_amount
        );
        v_new_reversed_total := v_allocation.reversed_discount_amount + v_this_reversal;

        UPDATE discount_allocations
        SET reversed_discount_amount = v_new_reversed_total,
            status = CASE WHEN v_new_reversed_total >= total_discount_amount - 0.005
                          THEN 'VOID' ELSE status END,
            voided_by = CASE WHEN v_new_reversed_total >= total_discount_amount - 0.005
                          THEN p_user_id ELSE voided_by END,
            voided_at = CASE WHEN v_new_reversed_total >= total_discount_amount - 0.005
                          THEN NOW() ELSE voided_at END,
            void_reason = CASE
                WHEN v_new_reversed_total >= total_discount_amount - 0.005
                    THEN 'Fully refunded via ' || p_refund_id
                ELSE COALESCE(void_reason || ' | ', '')
                     || format('Partial reversal %.2f via refund %s', v_this_reversal, p_refund_id)
            END
        WHERE id = v_allocation.id;

        INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, metadata, created_at)
        VALUES (v_refund.business_id, p_user_id, 'discount.refund.reversal', 'discount_allocation',
            v_allocation.id,
            jsonb_build_object('reversed_before', v_allocation.reversed_discount_amount),
            jsonb_build_object('reversed_after', v_new_reversed_total,
                                'amount_this_refund', v_this_reversal,
                                'fully_reversed', v_new_reversed_total >= v_allocation.total_discount_amount - 0.005),
            jsonb_build_object('refund_id', p_refund_id, 'function', 'reverse_discounts_on_refund'), NOW());

        v_remaining_to_reverse := v_remaining_to_reverse - v_this_reversal;
    END LOOP;

    IF v_remaining_to_reverse > 0.005 THEN
        success := FALSE;
        message := format(
            'Could only reverse %.2f of %.2f discount refunded — no matching un-reversed allocation found for the remainder',
            v_refund.discount_refunded - v_remaining_to_reverse, v_refund.discount_refunded);
        RETURN NEXT; RETURN;
    END IF;

    success := TRUE;
    message := 'Discounts reversed successfully';
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id,
        new_values, metadata, created_at)
    VALUES (COALESCE(v_refund.business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        p_user_id, 'discount.refund.reversal.error', 'refund',
        p_refund_id, jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_discounts_on_refund'), NOW());
    success := FALSE; message := SQLERRM;
    RETURN NEXT;
END;
$function$;

-- ----------------------------------------------------------------------------
-- STEP 3: Reorder the trigger + stop discarding sub-function results
-- ----------------------------------------------------------------------------
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

COMMIT;

-- ----------------------------------------------------------------------------
-- Post-migration: grant EXECUTE to the app role (both functions were
-- recreated with CREATE OR REPLACE, which resets privileges to owner-only)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.reverse_discounts_on_refund(uuid, uuid) TO bizzytrack_user;
GRANT EXECUTE ON FUNCTION public.process_refund_accounting() TO bizzytrack_user;
