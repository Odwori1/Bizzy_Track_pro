-- ============================================================================
-- Migration 1506: Fix invalid %.2f format() specifier in reverse_discounts_on_refund
--
-- Postgres's format() only supports %s/%I/%L/%%, not printf-style numeric
-- specifiers like %.2f (introduced in migration 1504). This caused every
-- refund with discount_refunded > 0 that hit the partial-reversal branch to
-- fail at runtime with "unrecognized format() type specifier ".""
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

BEGIN;

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
                     -- FIXED: %.2f is not a valid format() specifier in Postgres.
                     -- Round to 2dp and cast to text, interpolate with %s instead.
                     || format('Partial reversal %s via refund %s',
                                round(v_this_reversal, 2)::text, p_refund_id)
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
        -- FIXED: same %.2f issue as above
        message := format(
            'Could only reverse %s of %s discount refunded — no matching un-reversed allocation found for the remainder',
            round(v_refund.discount_refunded - v_remaining_to_reverse, 2)::text,
            round(v_refund.discount_refunded, 2)::text);
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

COMMIT;

GRANT EXECUTE ON FUNCTION public.reverse_discounts_on_refund(uuid, uuid) TO bizzytrack_user;
