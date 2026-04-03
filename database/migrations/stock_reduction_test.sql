-- ============================================================================
-- SIMPLE INVENTORY TRIGGER TEST
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    v_user_id UUID := 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
    
    v_inventory_id UUID;
    v_product_id UUID;
    v_pos_transaction_id UUID;
    v_initial_stock NUMERIC;
    v_stock_after_insert NUMERIC;
    v_inventory_transaction_count INTEGER;
    
    v_timestamp TEXT := TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS');
    v_sku TEXT := 'TEST-STOCK-' || v_timestamp;
    
    -- Record variables for loops
    rec_record RECORD;
    
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'INVENTORY TRIGGER DIAGNOSTIC TEST';
    RAISE NOTICE 'Test Run: %', v_timestamp;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    -- ========================================================================
    -- STEP 1: Create inventory item
    -- ========================================================================
    RAISE NOTICE 'STEP 1: Creating inventory item';
    RAISE NOTICE '----------------------------------------';
    
    INSERT INTO inventory_items (
        business_id, name, sku, cost_price, selling_price, current_stock,
        min_stock_level, max_stock_level, unit_of_measure, is_active
    ) VALUES (
        v_business_id, 'Test Stock Item', v_sku,
        60.00, 120.00, 50, 10, 100, 'units', true
    ) RETURNING id INTO v_inventory_id;
    
    RAISE NOTICE '✅ Created inventory item: %', v_inventory_id;
    
    -- ========================================================================
    -- STEP 2: Create product linked to inventory
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 2: Creating product linked to inventory';
    RAISE NOTICE '----------------------------------------';
    
    INSERT INTO products (
        business_id, name, sku, inventory_item_id, selling_price, cost_price, current_stock, is_active
    ) VALUES (
        v_business_id, 'Test Product', 'PROD-' || v_sku,
        v_inventory_id, 120.00, 60.00, 50, true
    ) RETURNING id INTO v_product_id;
    
    RAISE NOTICE '✅ Created product: % (inventory_item_id = %)', v_product_id, v_inventory_id;
    
    -- ========================================================================
    -- STEP 3: Check initial stock
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 3: Checking initial stock';
    RAISE NOTICE '----------------------------------------';
    
    SELECT current_stock INTO v_initial_stock
    FROM inventory_items WHERE id = v_inventory_id;
    
    RAISE NOTICE '📊 Initial stock: % units', v_initial_stock;
    
    -- ========================================================================
    -- STEP 4: Create POS transaction
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 4: Creating POS transaction';
    RAISE NOTICE '----------------------------------------';
    
    INSERT INTO pos_transactions (
        business_id, transaction_number, total_amount, discount_amount, tax_amount,
        final_amount, payment_method, status, created_by
    ) VALUES (
        v_business_id, 'STOCK-TEST-' || v_timestamp, 240.00, 0.00, 0.00, 240.00,
        'cash', 'completed', v_user_id
    ) RETURNING id INTO v_pos_transaction_id;
    
    RAISE NOTICE '✅ Created POS transaction: %', v_pos_transaction_id;
    
    -- ========================================================================
    -- STEP 5: Add POS transaction item (TEST CASE 1 - with product_id only)
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 5: Adding POS transaction item (product_id only, no inventory_item_id)';
    RAISE NOTICE '----------------------------------------';
    
    INSERT INTO pos_transaction_items (
        pos_transaction_id, product_id, item_type, item_name,
        quantity, unit_price, total_price, business_id
    ) VALUES (
        v_pos_transaction_id, v_product_id, 'product', 'Test Product',
        2, 120.00, 240.00, v_business_id
    );
    
    RAISE NOTICE '✅ Added POS item with product_id only';
    
    -- Wait for trigger
    PERFORM pg_sleep(1);
    
    -- ========================================================================
    -- STEP 6: Check results
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 6: Checking results';
    RAISE NOTICE '----------------------------------------';
    
    -- Check stock after insert
    SELECT current_stock INTO v_stock_after_insert
    FROM inventory_items WHERE id = v_inventory_id;
    
    RAISE NOTICE '📊 Stock after insert: % units', v_stock_after_insert;
    RAISE NOTICE '   Change: % units (Expected: -2 units)', v_stock_after_insert - v_initial_stock;
    
    -- Check inventory transactions
    SELECT COUNT(*) INTO v_inventory_transaction_count
    FROM inventory_transactions
    WHERE reference_type = 'pos_transaction' 
      AND reference_id::text = v_pos_transaction_id::text;
    
    RAISE NOTICE '📊 Inventory transactions created: % (Expected: 1)', v_inventory_transaction_count;
    
    -- Show inventory transaction details
    IF v_inventory_transaction_count > 0 THEN
        RAISE NOTICE '📊 Inventory transaction details:';
        FOR rec_record IN (
            SELECT transaction_type, quantity, unit_cost, total_cost, notes
            FROM inventory_transactions
            WHERE reference_type = 'pos_transaction' 
              AND reference_id::text = v_pos_transaction_id::text
        ) LOOP
            RAISE NOTICE '   - Type: %, Qty: %, Cost: %, Total: %, Notes: %',
                rec_record.transaction_type, rec_record.quantity, 
                rec_record.unit_cost, rec_record.total_cost, rec_record.notes;
        END LOOP;
    END IF;
    
    -- Check if inventory_item_id was populated by trigger
    DECLARE
        v_inv_item_id UUID;
    BEGIN
        SELECT inventory_item_id INTO v_inv_item_id
        FROM pos_transaction_items
        WHERE pos_transaction_id = v_pos_transaction_id;
        
        RAISE NOTICE '📊 inventory_item_id in pos_transaction_items: %', v_inv_item_id;
        
        IF v_inv_item_id IS NOT NULL THEN
            RAISE NOTICE '✅ Trigger populated inventory_item_id correctly';
        ELSE
            RAISE NOTICE '⚠️ Trigger did NOT populate inventory_item_id';
        END IF;
    END;
    
    -- ========================================================================
    -- STEP 7: Test with inventory_item_id explicitly set
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 7: Testing with inventory_item_id explicitly set';
    RAISE NOTICE '----------------------------------------';
    
    -- Create another POS transaction
    DECLARE
        v_pos2_id UUID;
        v_stock_before NUMERIC;
        v_stock_after NUMERIC;
    BEGIN
        SELECT current_stock INTO v_stock_before
        FROM inventory_items WHERE id = v_inventory_id;
        
        RAISE NOTICE 'Stock before second test: %', v_stock_before;
        
        INSERT INTO pos_transactions (
            business_id, transaction_number, total_amount, discount_amount, tax_amount,
            final_amount, payment_method, status, created_by
        ) VALUES (
            v_business_id, 'STOCK-TEST-2-' || v_timestamp, 120.00, 0.00, 0.00, 120.00,
            'cash', 'completed', v_user_id
        ) RETURNING id INTO v_pos2_id;
        
        -- Insert with inventory_item_id explicitly set
        INSERT INTO pos_transaction_items (
            pos_transaction_id, product_id, inventory_item_id, item_type, item_name,
            quantity, unit_price, total_price, business_id
        ) VALUES (
            v_pos2_id, v_product_id, v_inventory_id, 'product', 'Test Product 2',
            1, 120.00, 120.00, v_business_id
        );
        
        PERFORM pg_sleep(1);
        
        SELECT current_stock INTO v_stock_after
        FROM inventory_items WHERE id = v_inventory_id;
        
        RAISE NOTICE 'Stock after second test (with inventory_item_id set): %', v_stock_after;
        RAISE NOTICE 'Change: % (Expected: -1 unit)', v_stock_after - v_stock_before;
        
        -- Clean up second test
        DELETE FROM pos_transaction_items WHERE pos_transaction_id = v_pos2_id;
        DELETE FROM pos_transactions WHERE id = v_pos2_id;
        
    END;
    
    -- ========================================================================
    -- STEP 8: Analyze trigger function source
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 8: Analyzing trigger function source';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'sync_inventory_on_pos_sale'
    ) LOOP
        RAISE NOTICE 'Trigger function code:';
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- Also check the create_inventory_transaction_with_accounting function
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 8b: Checking create_inventory_transaction_with_accounting function';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'create_inventory_transaction_with_accounting'
    ) LOOP
        RAISE NOTICE 'Function code:';
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- ========================================================================
    -- STEP 9: Cleanup
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 9: Cleanup';
    RAISE NOTICE '----------------------------------------';
    
    -- Delete test data
    DELETE FROM pos_transaction_items WHERE pos_transaction_id = v_pos_transaction_id;
    DELETE FROM pos_transactions WHERE id = v_pos_transaction_id;
    DELETE FROM products WHERE id = v_product_id;
    DELETE FROM inventory_transactions WHERE product_id = v_product_id;
    DELETE FROM inventory_items WHERE id = v_inventory_id;
    
    RAISE NOTICE '✅ Test data cleaned up';
    
    -- ========================================================================
    -- STEP 10: Summary
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST SUMMARY';
    RAISE NOTICE '========================================';
    
    IF v_stock_after_insert = v_initial_stock - 2 THEN
        RAISE NOTICE '✅ TEST PASSED: Stock reduction is working!';
        RAISE NOTICE '   Stock decreased from % to % (-2 units)', v_initial_stock, v_stock_after_insert;
    ELSE
        RAISE NOTICE '❌ TEST FAILED: Stock reduction is NOT working!';
        RAISE NOTICE '   Expected stock: %, Actual stock: %', v_initial_stock - 2, v_stock_after_insert;
        RAISE NOTICE '';
        RAISE NOTICE '   Possible reasons:';
        RAISE NOTICE '   1. The trigger checks for "IF NEW.product_id IS NOT NULL AND NEW.inventory_item_id IS NULL"';
        RAISE NOTICE '   2. Our insert had product_id and inventory_item_id was NULL - condition should be true';
        RAISE NOTICE '   3. The function create_inventory_transaction_with_accounting might not be updating stock';
        RAISE NOTICE '   4. Check if create_inventory_transaction_with_accounting function exists and works';
    END IF;
    
    IF v_inventory_transaction_count > 0 THEN
        RAISE NOTICE '✅ Inventory transaction was created';
    ELSE
        RAISE NOTICE '❌ No inventory transaction was created';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    
END $$;
