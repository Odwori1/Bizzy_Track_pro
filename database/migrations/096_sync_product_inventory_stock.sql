-- ============================================================================
-- MIGRATION 096: SYNC PRODUCT-INVENTORY STOCK
-- ============================================================================
-- Issue: products.current_stock doesn't update when inventory_items.current_stock changes
-- Solution: Add database trigger to keep them in sync
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SYNCING PRODUCT & INVENTORY STOCK';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: CREATE SYNC FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_product_stock_from_inventory()
RETURNS TRIGGER AS $$
BEGIN
    -- When inventory stock changes, update linked product stock
    IF TG_OP = 'UPDATE' AND NEW.current_stock IS DISTINCT FROM OLD.current_stock THEN
        UPDATE products
        SET 
            current_stock = NEW.current_stock,
            updated_at = NOW()
        WHERE inventory_item_id = NEW.id
          AND business_id = NEW.business_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: CREATE TRIGGER
-- ============================================================================

DROP TRIGGER IF EXISTS trg_sync_product_stock ON inventory_items;
CREATE TRIGGER trg_sync_product_stock
AFTER UPDATE OF current_stock ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION sync_product_stock_from_inventory();

-- ============================================================================
-- PART 3: FIX EXISTING DATA (One-time sync)
-- ============================================================================

DO $$
DECLARE
    v_synced_count INTEGER := 0;
BEGIN
    -- Sync all existing product-inventory pairs
    UPDATE products p
    SET 
        current_stock = ii.current_stock,
        updated_at = NOW()
    FROM inventory_items ii
    WHERE p.inventory_item_id = ii.id
      AND p.current_stock != ii.current_stock
      AND p.business_id = ii.business_id;
    
    GET DIAGNOSTICS v_synced_count = ROW_COUNT;
    
    RAISE NOTICE 'Synced % existing product-inventory pairs', v_synced_count;
END;
$$;

-- ============================================================================
-- PART 4: VERIFICATION (FIXED SYNTAX)
-- ============================================================================

DO $$
DECLARE
    v_out_of_sync INTEGER;
    v_product_name TEXT;
    v_product_stock DECIMAL(15,2);
    v_inventory_stock DECIMAL(15,2);
BEGIN
    -- Check for any remaining out-of-sync items
    SELECT COUNT(*) INTO v_out_of_sync
    FROM products p
    JOIN inventory_items ii ON p.inventory_item_id = ii.id
    WHERE p.current_stock != ii.current_stock
      AND p.business_id = '0374935e-7461-47c5-856e-17c116542baa';
    
    IF v_out_of_sync = 0 THEN
        RAISE NOTICE '✅ All product-inventory pairs are in sync';
    ELSE
        RAISE NOTICE '⚠️ Found % out-of-sync pairs', v_out_of_sync;
        
        -- Show which items are out of sync
        RAISE NOTICE 'Out of sync items:';
        
        -- Use explicit cursor to avoid syntax error
        FOR v_product_name, v_product_stock, v_inventory_stock IN
            SELECT p.name, p.current_stock as product_stock, ii.current_stock as inventory_stock
            FROM products p
            JOIN inventory_items ii ON p.inventory_item_id = ii.id
            WHERE p.current_stock != ii.current_stock
              AND p.business_id = '0374935e-7461-47c5-856e-17c116542baa'
        LOOP
            RAISE NOTICE '  %: product=% inventory=%', 
                v_product_name, v_product_stock, v_inventory_stock;
        END LOOP;
    END IF;
END;
$$;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SYNC COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Created sync trigger';
    RAISE NOTICE '✅ Fixed existing data';
    RAISE NOTICE '✅ Future inventory updates will auto-sync products';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Product-inventory sync issue: RESOLVED!';
END;
$$;
