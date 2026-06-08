CREATE OR REPLACE FUNCTION public.reverse_discounts_on_refund(p_refund_id uuid, p_user_id uuid)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_id UUID;
    v_refund RECORD;
    v_discount_allocation RECORD;
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

    -- VOID original allocations (no negative inserts - violates CHECK constraint)
    FOR v_discount_allocation IN
        SELECT da.* FROM discount_allocations da
        WHERE (da.pos_transaction_id = v_refund.original_transaction_id
               OR da.invoice_id = v_refund.original_transaction_id)
          AND da.status = 'APPLIED'
          AND da.voided_at IS NULL
          AND da.is_refund_reversal = FALSE
    LOOP
        UPDATE discount_allocations
        SET status = 'VOID',
            voided_by = p_user_id,
            voided_at = NOW(),
            void_reason = 'Refunded: ' || p_refund_id
        WHERE id = v_discount_allocation.id;

        INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, metadata, created_at)
        VALUES (v_refund.business_id, p_user_id, 'discount.refund.reversal', 'discount_allocation',
            v_discount_allocation.id,
            jsonb_build_object('original_status', v_discount_allocation.status, 'discount_amount', v_discount_allocation.total_discount_amount),
            jsonb_build_object('new_status', 'VOID'),
            jsonb_build_object('refund_id', p_refund_id, 'reason', 'refund_processing'), NOW());
    END LOOP;

    success := TRUE;
    message := 'Discounts reversed successfully';
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    INSERT INTO audit_logs (business_id, user_id, action, resource_type, resource_id,
        new_values, metadata, created_at)
    VALUES (v_refund.business_id, p_user_id, 'discount.refund.reversal.error', 'refund',
        p_refund_id, jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_discounts_on_refund'), NOW());
    success := FALSE; message := SQLERRM;
    RETURN NEXT;
END;
$function$;
