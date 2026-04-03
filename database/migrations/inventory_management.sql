-- ============================================================================
-- COMPLETE INVENTORY MANAGEMENT ANALYSIS - CORRECTED VERSION
-- ============================================================================

DO $$
DECLARE
    rec_record RECORD;
    v_function_exists INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'INVENTORY MANAGEMENT SYSTEM ANALYSIS';
    RAISE NOTICE '========================================';
    
    -- ========================================================================
    -- 1. Check all functions that might update inventory
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '1. Functions that update inventory stock:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT proname 
        FROM pg_proc 
        WHERE proname LIKE '%inventory%' 
           OR proname LIKE '%stock%'
        ORDER BY proname
        LIMIT 20
    ) LOOP
        RAISE NOTICE '  Function: %', rec_record.proname;
    END LOOP;
    
    -- ========================================================================
    -- 2. Check for any triggers that update inventory_items
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '2. Triggers on inventory_items:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT 
            tgname,
            tgrelid::regclass as table_name,
            tgfoid::regproc as function_name
        FROM pg_trigger
        WHERE tgrelid = 'inventory_items'::regclass
          AND tgname NOT LIKE 'RI_%'
    ) LOOP
        RAISE NOTICE '  Trigger: % on % -> %', 
            rec_record.tgname, rec_record.table_name, rec_record.function_name;
    END LOOP;
    
    -- ========================================================================
    -- 3. Check if there's a function that updates current_stock
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '3. Functions that update current_stock:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT proname
        FROM pg_proc 
        WHERE prosrc LIKE '%UPDATE inventory_items%'
           OR prosrc LIKE '%current_stock%'
    ) LOOP
        RAISE NOTICE '  Function: % (updates current_stock)', rec_record.proname;
    END LOOP;
    
    -- ========================================================================
    -- 4. Check reverse_inventory_on_refund function
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '4. reverse_inventory_on_refund analysis:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'reverse_inventory_on_refund'
        LIMIT 1
    ) LOOP
        IF rec_record.prosrc LIKE '%UPDATE inventory_items%current_stock%' THEN
            RAISE NOTICE '✅ This function DOES update current_stock';
        ELSIF rec_record.prosrc LIKE '%current_stock = current_stock +%' THEN
            RAISE NOTICE '✅ This function DOES update current_stock';
        ELSE
            RAISE NOTICE '❌ This function does NOT update current_stock';
            RAISE NOTICE '   It only creates inventory_transactions';
        END IF;
    END LOOP;
    
    -- ========================================================================
    -- 5. Check create_inventory_transaction_with_accounting function
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '5. create_inventory_transaction_with_accounting analysis:';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'create_inventory_transaction_with_accounting'
        LIMIT 1
    ) LOOP
        IF rec_record.prosrc LIKE '%UPDATE inventory_items%current_stock%' THEN
            RAISE NOTICE '✅ This function DOES update current_stock';
        ELSIF rec_record.prosrc LIKE '%current_stock = current_stock%' THEN
            RAISE NOTICE '✅ This function DOES update current_stock';
        ELSE
            RAISE NOTICE '❌ This function does NOT update current_stock';
            RAISE NOTICE '   It only creates inventory_transactions';
        END IF;
    END LOOP;
    
    -- ========================================================================
    -- 6. Check if there's a trigger on inventory_transactions
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '6. Triggers on inventory_transactions:';
    RAISE NOTICE '----------------------------------------';
    
    SELECT COUNT(*) INTO v_function_exists
    FROM pg_trigger
    WHERE tgrelid = 'inventory_transactions'::regclass
      AND tgname NOT LIKE 'RI_%';
    
    IF v_function_exists > 0 THEN
        FOR rec_record IN (
            SELECT tgname, tgfoid::regproc as function_name
            FROM pg_trigger
            WHERE tgrelid = 'inventory_transactions'::regclass
              AND tgname NOT LIKE 'RI_%'
        ) LOOP
            RAISE NOTICE '  Trigger: % -> %', rec_record.tgname, rec_record.function_name;
        END LOOP;
    ELSE
        RAISE NOTICE '  No triggers found on inventory_transactions';
    END IF;
    
    -- ========================================================================
    -- 7. Summary
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SUMMARY OF FINDINGS';
    RAISE NOTICE '========================================';
    
    -- Check if stock update exists anywhere
    SELECT COUNT(*) INTO v_function_exists
    FROM pg_proc 
    WHERE prosrc LIKE '%UPDATE inventory_items%current_stock%'
       OR prosrc LIKE '%current_stock = current_stock%';
    
    IF v_function_exists > 0 THEN
        RAISE NOTICE '✅ Found functions that update current_stock';
    ELSE
        RAISE NOTICE '❌ NO functions found that update inventory_items.current_stock';
        RAISE NOTICE '';
        RAISE NOTICE 'This explains why stock never changes!';
        RAISE NOTICE 'Inventory transactions are recorded but stock levels are never updated.';
    END IF;
    
    -- ========================================================================
    -- 8. Recommendations
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'RECOMMENDATIONS:';
    RAISE NOTICE '----------------------------------------';
    RAISE NOTICE '1. Modify create_inventory_transaction_with_accounting to update current_stock';
    RAISE NOTICE '2. OR create a trigger on inventory_transactions that updates inventory_items';
    RAISE NOTICE '';
    RAISE NOTICE 'Example fix for create_inventory_transaction_with_accounting:';
    RAISE NOTICE '';
    RAISE NOTICE '  -- After inserting inventory_transaction, add:';
    RAISE NOTICE '  UPDATE inventory_items';
    RAISE NOTICE '  SET current_stock = current_stock +';
    RAISE NOTICE '    CASE p_transaction_type';
    RAISE NOTICE '      WHEN ''sale'' THEN -p_quantity';
    RAISE NOTICE '      WHEN ''purchase'' THEN p_quantity';
    RAISE NOTICE '      WHEN ''refund'' THEN p_quantity';
    RAISE NOTICE '      ELSE 0';
    RAISE NOTICE '    END';
    RAISE NOTICE '  WHERE id = p_inventory_item_id;';
    
END $$;
