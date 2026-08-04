-- Migration 1516: Add stock-sufficiency floor to sync_inventory_on_pos_sale()
-- Fixes Bug 2.1 (v13.0/v14.0 audit): POS sales could drive inventory_items.current_stock
-- negative with no guard. Fail-closed, matching pattern established in 1513/1515.

CREATE OR REPLACE FUNCTION public.sync_inventory_on_pos_sale()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_inventory_item_id UUID;
    v_user_id           UUID;
    v_cost_price        DECIMAL(15,2);
    v_current_stock     DECIMAL(15,2);
    v_item_name         TEXT;
BEGIN
    IF NEW.item_type NOT IN ('product','inventory') THEN
        RETURN NEW;
    END IF;

    v_inventory_item_id := NEW.inventory_item_id;

    IF v_inventory_item_id IS NULL AND NEW.product_id IS NOT NULL THEN
        SELECT inventory_item_id INTO v_inventory_item_id
        FROM   products
        WHERE  id = NEW.product_id;

        IF v_inventory_item_id IS NOT NULL THEN
            NEW.inventory_item_id := v_inventory_item_id;
        END IF;
    END IF;

    IF v_inventory_item_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT created_by INTO v_user_id
    FROM   pos_transactions
    WHERE  id = NEW.pos_transaction_id;

    -- Lock the inventory row before reading, so concurrent sales against the
    -- same item serialize instead of both reading a stale current_stock.
    SELECT cost_price, current_stock, name
    INTO   v_cost_price, v_current_stock, v_item_name
    FROM   inventory_items
    WHERE  id = v_inventory_item_id
    FOR UPDATE;

    IF v_current_stock - NEW.quantity < 0 THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: cannot sell % of "%" — only % in stock',
            NEW.quantity, COALESCE(v_item_name, v_inventory_item_id::text), v_current_stock
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE inventory_items
    SET    current_stock = current_stock - NEW.quantity,
           updated_at    = NOW()
    WHERE  id = v_inventory_item_id;

    IF NOT EXISTS (
        SELECT 1 FROM inventory_transactions
        WHERE  reference_type  = 'pos_transaction'
          AND  reference_id    = NEW.pos_transaction_id
          AND  inventory_item_id = v_inventory_item_id
          AND  transaction_type  = 'sale'
    ) THEN
        INSERT INTO inventory_transactions (
            id, business_id, inventory_item_id, transaction_type,
            quantity, unit_cost, reference_type, reference_id,
            notes, created_by, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            NEW.business_id,
            v_inventory_item_id,
            'sale',
            -NEW.quantity,
            v_cost_price,
            'pos_transaction',
            NEW.pos_transaction_id,
            'POS Sale: ' || NEW.item_name,
            COALESCE(v_user_id,
                (SELECT created_by FROM pos_transactions
                 WHERE id = NEW.pos_transaction_id)),
            NOW(),
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$function$;
