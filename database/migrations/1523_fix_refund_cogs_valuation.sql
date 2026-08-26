-- Migration 1523: Fix reverse_inventory_on_refund() sourcing cost_price from
-- inventory_items (current, possibly-changed cost) instead of the unit_cost
-- actually booked on the original sale's inventory_transactions row.
--
-- Root cause confirmed live: a full sale-then-refund cycle with a deliberate
-- cost_price change in between showed the refund's COGS/Inventory journal
-- lines using the NEW cost (5000) instead of the ORIGINAL sale-time cost
-- (1000) — a documented, previously-unverified risk (Finding B) across five
-- prior audit reports (v15.0-v19.0), now confirmed and fixed here.
--
-- Must be run as postgres (superuser) — DDL/CREATE OR REPLACE FUNCTION
-- requires ownership, per this project's own standing rule.

CREATE OR REPLACE FUNCTION public.reverse_inventory_on_refund(p_refund_id uuid, p_user_id uuid)
 RETURNS TABLE(success boolean, message text, items_processed integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_business_id UUID;
    v_refund_item RECORD;
    v_inventory_item_id UUID;
    v_current_stock NUMERIC(12,4);
    v_quantity_refunded NUMERIC(12,4);
    v_unit_cost NUMERIC(12,4);
    v_items_processed INTEGER := 0;
    v_error_message TEXT;
BEGIN
    -- Get business ID from refund
    SELECT business_id INTO v_business_id
    FROM refunds
    WHERE id = p_refund_id;

    IF NOT FOUND THEN
        success := FALSE;
        message := 'Refund not found: ' || p_refund_id;
        items_processed := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Process each refund item that has a product
    -- CHANGED: now also selects original_line_item_id/original_line_type,
    -- needed to trace back to the original sale's booked cost.
    FOR v_refund_item IN
        SELECT ri.product_id, ri.quantity_refunded, ri.item_name,
               ri.original_line_item_id, ri.original_line_type
        FROM refund_items ri
        WHERE ri.refund_id = p_refund_id
          AND ri.product_id IS NOT NULL
    LOOP
        -- Get inventory item ID from product
        SELECT inventory_item_id INTO v_inventory_item_id
        FROM products
        WHERE id = v_refund_item.product_id
          AND business_id = v_business_id;

        IF v_inventory_item_id IS NOT NULL THEN
            -- Get current stock (still needed, unrelated to the cost bug)
            SELECT current_stock INTO v_current_stock
            FROM inventory_items
            WHERE id = v_inventory_item_id;

            -- FIX: retrieve the unit_cost actually booked at the time of the
            -- original sale, via pos_transaction_items -> inventory_transactions,
            -- instead of re-querying inventory_items.cost_price (which may have
            -- changed since the sale — this was the entire defect).
            v_unit_cost := NULL;

            IF v_refund_item.original_line_type = 'POS_ITEM' THEN
                SELECT it.unit_cost INTO v_unit_cost
                FROM pos_transaction_items pti
                JOIN inventory_transactions it
                  ON it.reference_type = 'pos_transaction'
                  AND it.reference_id = pti.pos_transaction_id
                  AND it.inventory_item_id = v_inventory_item_id
                WHERE pti.id = v_refund_item.original_line_item_id
                ORDER BY it.created_at ASC
                LIMIT 1;
            END IF;

            -- Fallback only: if no original-sale cost could be traced (e.g.
            -- an INVOICE_LINE refund — that path was not traced/verified in
            -- this fix — or a genuinely missing historical row), fall back to
            -- current cost_price rather than failing the refund outright.
            -- This is a degraded case, not the correct behavior, and should
            -- be flagged for follow-up: confirm the INVOICE_LINE join path
            -- and remove this fallback once it's covered explicitly.
            IF v_unit_cost IS NULL THEN
                SELECT cost_price INTO v_unit_cost
                FROM inventory_items
                WHERE id = v_inventory_item_id;
            END IF;

            v_quantity_refunded := v_refund_item.quantity_refunded;

            -- Update inventory quantity (increase stock)
            UPDATE inventory_items
            SET current_stock = current_stock + v_quantity_refunded,
                updated_at = NOW()
            WHERE id = v_inventory_item_id;

            -- Create inventory transaction
            INSERT INTO inventory_transactions (
                business_id,
                inventory_item_id,
                product_id,
                transaction_type,
                quantity,
                unit_cost,
                reference_type,
                reference_id,
                created_by,
                notes
            ) VALUES (
                v_business_id,
                v_inventory_item_id,
                v_refund_item.product_id,
                'refund',
                v_quantity_refunded,
                v_unit_cost,
                'refund',
                p_refund_id,
                p_user_id,
                'Inventory reversal from refund: ' || p_refund_id
            );

            v_items_processed := v_items_processed + 1;

            -- Log inventory change
            INSERT INTO audit_logs (
                business_id,
                user_id,
                action,
                resource_type,
                resource_id,
                old_values,
                new_values,
                metadata,
                created_at
            ) VALUES (
                v_business_id,
                p_user_id,
                'inventory.refund.reversal',
                'inventory_item',
                v_inventory_item_id,
                jsonb_build_object('stock_before', v_current_stock),
                jsonb_build_object('stock_after', v_current_stock + v_quantity_refunded),
                jsonb_build_object(
                    'refund_id', p_refund_id,
                    'quantity', v_quantity_refunded,
                    'unit_cost', v_unit_cost
                ),
                NOW()
            );
        END IF;
    END LOOP;

    success := TRUE;
    message := 'Processed ' || v_items_processed || ' inventory items';
    items_processed := v_items_processed;
    RETURN NEXT;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;

    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'inventory.refund.reversal.error',
        'refund',
        p_refund_id,
        jsonb_build_object('error', v_error_message),
        jsonb_build_object('function', 'reverse_inventory_on_refund'),
        NOW()
    );

    success := FALSE;
    message := SQLERRM;
    items_processed := v_items_processed;
    RETURN NEXT;
END;
$function$;
