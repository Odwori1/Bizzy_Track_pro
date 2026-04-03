-- ============================================================================
-- COMPREHENSIVE SYSTEM DIAGNOSTIC - Understanding the Refund System
-- ============================================================================

DO $$
DECLARE
    rec_record RECORD;
    v_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'COMPREHENSIVE SYSTEM DIAGNOSTIC';
    RAISE NOTICE '========================================';
    
    -- ========================================================================
    -- 1. INVENTORY TRIGGER ANALYSIS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '1. INVENTORY TRIGGER ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    -- Check if trigger exists and is enabled
    RAISE NOTICE 'Checking trigger_sync_inventory_on_pos_sale:';
    FOR rec_record IN (
        SELECT 
            tgname,
            tgfoid::regproc as function_name,
            tgenabled,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgname = 'trigger_sync_inventory_on_pos_sale'
    ) LOOP
        RAISE NOTICE '  Trigger: %', rec_record.tgname;
        RAISE NOTICE '    Function: %', rec_record.function_name;
        RAISE NOTICE '    Enabled: %', rec_record.tgenabled;
        RAISE NOTICE '    Timing: %', rec_record.timing_event;
    END LOOP;
    
    -- Check the function source code
    RAISE NOTICE '';
    RAISE NOTICE 'Function sync_inventory_on_pos_sale source:';
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'sync_inventory_on_pos_sale'
    ) LOOP
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- ========================================================================
    -- 2. INVENTORY REVERSAL FUNCTION ANALYSIS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '2. INVENTORY REVERSAL FUNCTION ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    -- Check reverse_inventory_on_refund function
    FOR rec_record IN (
        SELECT prosrc 
        FROM pg_proc 
        WHERE proname = 'reverse_inventory_on_refund'
    ) LOOP
        RAISE NOTICE 'reverse_inventory_on_refund source:';
        RAISE NOTICE '%', rec_record.prosrc;
    END LOOP;
    
    -- ========================================================================
    -- 3. REFUND TRIGGER ANALYSIS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '3. REFUND TRIGGER ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    -- Check triggers on refunds table
    FOR rec_record IN (
        SELECT 
            tgname,
            tgfoid::regproc as function_name,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgrelid = 'refunds'::regclass
          AND tgname NOT LIKE 'RI_%'
    ) LOOP
        RAISE NOTICE 'Trigger: %', rec_record.tgname;
        RAISE NOTICE '  Function: %', rec_record.function_name;
        RAISE NOTICE '  Timing: %', rec_record.timing_event;
    END LOOP;
    
    -- ========================================================================
    -- 4. DISCOUNT ALLOCATION CONSTRAINT ANALYSIS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '4. DISCOUNT ALLOCATION CONSTRAINTS';
    RAISE NOTICE '----------------------------------------';
    
    -- Check all check constraints on discount_allocations
    FOR rec_record IN (
        SELECT 
            conname,
            pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint 
        WHERE conrelid = 'discount_allocations'::regclass
          AND contype = 'c'
    ) LOOP
        RAISE NOTICE 'Constraint: %', rec_record.conname;
        RAISE NOTICE '  Definition: %', rec_record.constraint_def;
    END LOOP;
    
    -- Check required columns
    RAISE NOTICE '';
    RAISE NOTICE 'NOT NULL columns:';
    FOR rec_record IN (
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'discount_allocations'
          AND is_nullable = 'NO'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '  % (%)', rec_record.column_name, rec_record.data_type;
    END LOOP;
    
    -- ========================================================================
    -- 5. POS TRANSACTION STATUS UPDATE MECHANISM
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '5. POS TRANSACTION REFUND STATUS UPDATE';
    RAISE NOTICE '----------------------------------------';
    
    -- Check if there's a trigger that updates refund_status on pos_transactions
    FOR rec_record IN (
        SELECT 
            tgname,
            tgfoid::regproc as function_name,
            CASE tgtype & 1 WHEN 1 THEN 'ROW ' ELSE 'STATEMENT ' END ||
            CASE tgtype & 2 WHEN 2 THEN 'BEFORE ' ELSE '' END ||
            CASE tgtype & 4 WHEN 4 THEN 'AFTER ' ELSE '' END ||
            CASE tgtype & 64 WHEN 64 THEN 'INSERT ' ELSE '' END ||
            CASE tgtype & 128 WHEN 128 THEN 'DELETE ' ELSE '' END ||
            CASE tgtype & 256 WHEN 256 THEN 'UPDATE ' ELSE '' END as timing_event
        FROM pg_trigger
        WHERE tgrelid = 'pos_transactions'::regclass
          AND (tgname LIKE '%refund%' OR tgname LIKE '%status%')
          AND tgname NOT LIKE 'RI_%'
    ) LOOP
        RAISE NOTICE 'Trigger: %', rec_record.tgname;
        RAISE NOTICE '  Function: %', rec_record.function_name;
        RAISE NOTICE '  Timing: %', rec_record.timing_event;
    END LOOP;
    
    -- ========================================================================
    -- 6. CHECK IF ANY TEST DATA EXISTS AND WHAT STATE IT'S IN
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '6. CURRENT TEST DATA STATE';
    RAISE NOTICE '----------------------------------------';
    
    -- Check for existing test transactions
    SELECT COUNT(*) INTO v_count 
    FROM pos_transactions 
    WHERE transaction_number LIKE 'COMPREHENSIVE-TEST-%';
    RAISE NOTICE 'Existing test POS transactions: %', v_count;
    
    SELECT COUNT(*) INTO v_count 
    FROM refunds 
    WHERE refund_number LIKE 'PROD-PARTIAL-%' 
       OR refund_number LIKE 'SERVICE-FULL-%'
       OR refund_number LIKE 'FULL-REMAINING-%';
    RAISE NOTICE 'Existing test refunds: %', v_count;
    
    -- ========================================================================
    -- 7. SAMPLE WORKFLOW ANALYSIS - Check what happens when POS is created
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '7. SAMPLE WORKFLOW ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    -- Create a temporary test to see what columns are actually populated
    RAISE NOTICE 'Creating temporary test to analyze workflow...';
    
    DECLARE
        v_test_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
        v_test_user_id UUID := 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
        v_test_inventory_id UUID;
        v_test_product_id UUID;
        v_test_pos_id UUID;
        v_test_timestamp TEXT := 'DIAG-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS');
    BEGIN
        -- Create minimal test data
        INSERT INTO inventory_items (
            business_id, name, sku, cost_price, selling_price, current_stock,
            min_stock_level, max_stock_level, unit_of_measure, is_active
        ) VALUES (
            v_test_business_id, 'DIAG Product', 'DIAG-SKU-' || v_test_timestamp,
            60.00, 120.00, 100, 10, 200, 'units', true
        ) RETURNING id INTO v_test_inventory_id;
        
        INSERT INTO products (
            business_id, name, sku, inventory_item_id, selling_price, cost_price, current_stock, is_active
        ) VALUES (
            v_test_business_id, 'DIAG Product', 'DIAG-PROD-' || v_test_timestamp,
            v_test_inventory_id, 120.00, 60.00, 100, true
        ) RETURNING id INTO v_test_product_id;
        
        -- Create POS transaction
        INSERT INTO pos_transactions (
            business_id, transaction_number, total_amount, discount_amount, tax_amount,
            final_amount, payment_method, status, created_by
        ) VALUES (
            v_test_business_id, 'DIAG-TEST-' || v_test_timestamp,
            240.00, 0.00, 0.00, 240.00, 'cash', 'completed', v_test_user_id
        ) RETURNING id INTO v_test_pos_id;
        
        -- Add transaction item
        INSERT INTO pos_transaction_items (
            pos_transaction_id, product_id, inventory_item_id, item_type, item_name,
            quantity, unit_price, total_price, business_id
        ) VALUES (
            v_test_pos_id, v_test_product_id, v_test_inventory_id, 'product', 'DIAG Product',
            2, 120.00, 240.00, v_test_business_id
        );
        
        -- Wait for triggers
        PERFORM pg_sleep(1);
        
        -- Check if inventory was automatically reduced
        DECLARE
            v_stock_after NUMERIC;
        BEGIN
            SELECT current_stock INTO v_stock_after 
            FROM inventory_items WHERE id = v_test_inventory_id;
            
            RAISE NOTICE '  Stock after inserting POS item: % (Expected: 98 if trigger works)', v_stock_after;
            
            IF v_stock_after = 100 THEN
                RAISE NOTICE '  ⚠️ WARNING: Inventory trigger did NOT fire!';
            ELSE
                RAISE NOTICE '  ✅ Inventory trigger fired correctly';
            END IF;
        END;
        
        -- Check if inventory transaction was created
        SELECT COUNT(*) INTO v_count 
        FROM inventory_transactions 
        WHERE reference_type = 'pos_sale' AND reference_id::text = v_test_pos_id::text;
        
        RAISE NOTICE '  Inventory transactions created: % (Expected: 1 if trigger works)', v_count;
        
        -- Check what columns are actually filled in the transaction
        RAISE NOTICE '  Sample inventory transaction data:';
        FOR rec_record IN (
            SELECT transaction_type, quantity, unit_cost, total_cost, reference_type, notes
            FROM inventory_transactions 
            WHERE reference_type = 'pos_sale' AND reference_id::text = v_test_pos_id::text
            LIMIT 1
        ) LOOP
            RAISE NOTICE '    Type: %, Qty: %, Cost: %, Total: %, Ref: %, Notes: %',
                rec_record.transaction_type, rec_record.quantity, rec_record.unit_cost,
                rec_record.total_cost, rec_record.reference_type, rec_record.notes;
        END LOOP;
        
        -- Clean up test data
        DELETE FROM pos_transaction_items WHERE pos_transaction_id = v_test_pos_id;
        DELETE FROM pos_transactions WHERE id = v_test_pos_id;
        DELETE FROM products WHERE id = v_test_product_id;
        DELETE FROM inventory_transactions WHERE product_id = v_test_product_id;
        DELETE FROM inventory_items WHERE id = v_test_inventory_id;
        
        RAISE NOTICE '  Test data cleaned up';
        
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  Error in test: %', SQLERRM;
        -- Attempt cleanup
        DELETE FROM pos_transaction_items WHERE pos_transaction_id IN (SELECT id FROM pos_transactions WHERE transaction_number LIKE 'DIAG-TEST-%');
        DELETE FROM pos_transactions WHERE transaction_number LIKE 'DIAG-TEST-%';
        DELETE FROM products WHERE sku LIKE 'DIAG-PROD-%';
        DELETE FROM inventory_items WHERE sku LIKE 'DIAG-SKU-%';
    END;
    
    -- ========================================================================
    -- 8. CHECK FOR OTHER TRIGGERS THAT MIGHT AFFECT REFUNDS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '8. OTHER RELEVANT TRIGGERS';
    RAISE NOTICE '----------------------------------------';
    
    -- Check for any triggers on refund_items
    FOR rec_record IN (
        SELECT tgname, tgfoid::regproc as function_name
        FROM pg_trigger
        WHERE tgrelid = 'refund_items'::regclass
          AND tgname NOT LIKE 'RI_%'
    ) LOOP
        RAISE NOTICE 'Trigger on refund_items: % -> %', rec_record.tgname, rec_record.function_name;
    END LOOP;
    
    -- ========================================================================
    -- 9. CHECK FOR EXPECTED COLUMN NAMES IN POS_TRANSACTION_ITEMS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '9. POS_TRANSACTION_ITEMS COLUMN ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'pos_transaction_items'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '  % (%): Nullable=%', 
            rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- ========================================================================
    -- 10. CHECK FOR EXPECTED COLUMN NAMES IN REFUND_ITEMS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '10. REFUND_ITEMS COLUMN ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'refund_items'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '  % (%): Nullable=%', 
            rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- ========================================================================
    -- 11. CHECK FOR EXPECTED COLUMN NAMES IN REFUNDS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '11. REFUNDS COLUMN ANALYSIS';
    RAISE NOTICE '----------------------------------------';
    
    FOR rec_record IN (
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'refunds'
        ORDER BY ordinal_position
    ) LOOP
        RAISE NOTICE '  % (%): Nullable=%', 
            rec_record.column_name, rec_record.data_type, rec_record.is_nullable;
    END LOOP;
    
    -- ========================================================================
    -- 12. SUMMARY OF FINDINGS
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DIAGNOSTIC SUMMARY';
    RAISE NOTICE '========================================';
    
    -- Check if the inventory trigger actually exists and works
    SELECT COUNT(*) INTO v_count FROM pg_trigger WHERE tgname = 'trigger_sync_inventory_on_pos_sale' AND tgenabled = 'O';
    IF v_count > 0 THEN
        RAISE NOTICE '✅ trigger_sync_inventory_on_pos_sale exists and is enabled';
    ELSE
        RAISE NOTICE '❌ trigger_sync_inventory_on_pos_sale is missing or disabled';
    END IF;
    
    -- Check if reverse_inventory_on_refund function exists
    SELECT COUNT(*) INTO v_count FROM pg_proc WHERE proname = 'reverse_inventory_on_refund';
    IF v_count > 0 THEN
        RAISE NOTICE '✅ reverse_inventory_on_refund function exists';
    ELSE
        RAISE NOTICE '❌ reverse_inventory_on_refund function is missing';
    END IF;
    
    -- Check if trigger_refund_accounting exists
    SELECT COUNT(*) INTO v_count FROM pg_trigger WHERE tgname = 'trigger_refund_accounting' AND tgrelid = 'refunds'::regclass;
    IF v_count > 0 THEN
        RAISE NOTICE '✅ trigger_refund_accounting exists on refunds table';
    ELSE
        RAISE NOTICE '❌ trigger_refund_accounting is missing on refunds table';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Based on this diagnostic, we can determine:';
    RAISE NOTICE '1. Why inventory is not being reduced automatically';
    RAISE NOTICE '2. What columns are required for discount allocations';
    RAISE NOTICE '3. How refunds should be processed to trigger the right functions';
    RAISE NOTICE '4. Whether we need to manually call functions or rely on triggers';
    
END $$;
