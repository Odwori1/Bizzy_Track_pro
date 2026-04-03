-- ============================================================================
-- ANALYZE DUAL INVENTORY SYSTEM
-- ============================================================================

DO $$
DECLARE
    rec_record RECORD;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DUAL INVENTORY SYSTEM ANALYSIS';
    RAISE NOTICE '========================================';
    
    -- ========================================================================
    -- 1. Check inventory_items table for type indicators
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '1. Inventory Items Table - Type Indicators:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'inventory_items'
        ORDER BY ordinal_position
    ) LOOP
        IF rec_record.column_name LIKE '%type%' OR 
           rec_record.column_name LIKE '%category%' OR
           rec_record.column_name LIKE '%asset%' THEN
            RAISE NOTICE '   % (%): Nullable=% ⭐', 
                rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
        ELSE
            RAISE NOTICE '   % (%): Nullable=%', 
                rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
        END IF;
    END LOOP;
    
    -- ========================================================================
    -- 2. Check if there's an assets or equipment table
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '2. Asset/Equipment Related Tables:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name LIKE '%asset%' 
           OR table_name LIKE '%equipment%'
           OR table_name LIKE '%hire%'
        ORDER BY table_name
    ) LOOP
        RAISE NOTICE '   Table: %', rec_record.table_name;
    END LOOP;
    
    -- ========================================================================
    -- 3. Check if there's an item_type or category in inventory_items
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '3. Inventory Items by Type (Sample Data):';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT name, sku, 
               CASE 
                   WHEN sku LIKE '%ASSET%' OR sku LIKE '%EQUIP%' THEN 'ASSET'
                   WHEN name LIKE '%Hire%' OR name LIKE '%Rental%' THEN 'ASSET'
                   ELSE 'PRODUCT'
               END as inferred_type
        FROM inventory_items
        WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
        LIMIT 10
    ) LOOP
        RAISE NOTICE '   % - % (Inferred: %)', 
            rec_record.name, rec_record.sku, rec_record.inferred_type;
    END LOOP;
    
    -- ========================================================================
    -- 4. Check functions specific to assets/equipment
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '4. Asset/Equipment Related Functions:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT proname 
        FROM pg_proc 
        WHERE proname LIKE '%asset%' 
           OR proname LIKE '%equipment%'
           OR proname LIKE '%hire%'
        ORDER BY proname
    ) LOOP
        RAISE NOTICE '   Function: %', rec_record.proname;
    END LOOP;
    
    -- ========================================================================
    -- 5. Check pos_transaction_items for asset/equipment fields
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '5. POS Transaction Items - Asset/Equipment Fields:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'pos_transaction_items'
          AND (column_name LIKE '%equipment%' OR column_name LIKE '%asset%' OR column_name LIKE '%hire%')
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '   % (%)', rec_record.column_name, rec_record.data_type;
    END LOOP;
    
    -- ========================================================================
    -- 6. Check how inventory is handled for different item types
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '6. Inventory Handling by Item Type:';
    RAISE NOTICE '----------------------------------------';
    
    -- Check if there's a field that distinguishes product vs asset in inventory_items
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'inventory_items' 
        AND column_name = 'inventory_type'
    ) INTO rec_record;
    
    IF rec_record.exists THEN
        RAISE NOTICE '✅ inventory_items has inventory_type column';
    ELSE
        RAISE NOTICE '⚠️ No explicit type column in inventory_items';
        RAISE NOTICE '   Types may be inferred by:';
        RAISE NOTICE '   - Presence in equipment_hires table';
        RAISE NOTICE '   - SKU prefix';
        RAISE NOTICE '   - Category assignment';
    END IF;
    
    -- ========================================================================
    -- 7. Check equipment_hires table structure
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '7. Equipment Hires Table Structure:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'equipment_hires'
        ORDER BY ordinal_position
        LIMIT 15
    ) LOOP
        RAISE NOTICE '   % (%)', rec_record.column_name, rec_record.data_type;
    END LOOP;
    
    -- ========================================================================
    -- 8. Analyze the difference in inventory handling
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '8. Inventory Flow Analysis:';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE '';
    RAISE NOTICE 'Based on the dual inventory system, there are likely two workflows:';
    RAISE NOTICE '';
    RAISE NOTICE 'A. PRODUCT INVENTORY (Merchandise):';
    RAISE NOTICE '   - Stock decreases on sale';
    RAISE NOTICE '   - Stock increases on refund';
    RAISE NOTICE '   - Uses current_stock field';
    RAISE NOTICE '';
    RAISE NOTICE 'B. ASSET INVENTORY (Fixed Assets/Hire):';
    RAISE NOTICE '   - Assets are tracked separately (possibly in equipment_hires table)';
    RAISE NOTICE '   - May not use current_stock the same way';
    RAISE NOTICE '   - Availability tracked through hire status rather than stock count';
    RAISE NOTICE '   - May have different accounting treatment (depreciation vs COGS)';
    
END $$;
