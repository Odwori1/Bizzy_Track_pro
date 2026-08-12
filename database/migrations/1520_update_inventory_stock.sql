CREATE OR REPLACE FUNCTION public.update_inventory_stock(
  p_inventory_item_id uuid,
  p_quantity_change numeric,
  p_movement_type character varying
)
RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_stock DECIMAL(10,2);
    v_current_stock DECIMAL(10,2);
    v_item_name VARCHAR;
BEGIN
    SELECT current_stock, name INTO v_current_stock, v_item_name
    FROM inventory_items
    WHERE id = p_inventory_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    CASE p_movement_type
        WHEN 'purchase' THEN v_new_stock := v_current_stock + p_quantity_change;
        WHEN 'sale' THEN v_new_stock := v_current_stock - p_quantity_change;
        WHEN 'adjustment' THEN v_new_stock := v_current_stock + p_quantity_change;
        WHEN 'return' THEN v_new_stock := v_current_stock + p_quantity_change;
        WHEN 'damage' THEN v_new_stock := v_current_stock - p_quantity_change;
        WHEN 'internal_use' THEN v_new_stock := v_current_stock - p_quantity_change;
        WHEN 'transfer' THEN v_new_stock := v_current_stock - p_quantity_change;
        WHEN 'transfer_in' THEN v_new_stock := v_current_stock + p_quantity_change;
        WHEN 'transfer_out' THEN v_new_stock := v_current_stock - p_quantity_change;
        ELSE v_new_stock := v_current_stock;
    END CASE;

    IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: % of "%" requested but only % in stock',
            p_quantity_change, v_item_name, v_current_stock
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE inventory_items
    SET current_stock = v_new_stock, updated_at = NOW()
    WHERE id = p_inventory_item_id;

    RETURN v_new_stock;
END;
$function$;
