-- ============================================================================
-- TEST FOR PRODUCT INVENTORY (MERCHANDISE) ONLY
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    v_user_id UUID := 'd5f407e3-ac71-4b91-b03e-ec50f908c3d1';
    
    v_product_inventory_id UUID;
    v_product_id UUID;
    v_pos_transaction_id UUID;
    v_refund_id UUID;
    
    v_initial_stock NUMERIC;
    v_stock_after_sale NUMERIC;
    v_stock_after_refund NUMERIC;
    
    v_timestamp TEXT := TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS');
    v_product_sku TEXT := 'MERCH-TEST-' || v_timestamp;
    
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PRODUCT INVENTORY TEST (Merchandise)';
    RAISE NOTICE 'Test Run: %', v_timestamp;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    
    -- ========================================================================
    -- STEP 1: Create product inventory (merchandise)
    -- ========================================================================
    RAISE NOTICE 'STEP 1: Creating Product Inventory';
    RAISE NOTICE '----------------------------------------';
    
    INSERT INTO inventory_items (
        business_id, name, sku, cost_price, selling_price, current_stock,
        min_stock_level, max_stock_level, unit_of_measure, is_active
    ) VALUES (
        v_business_id, 'Merchandise Product', v_product_sku,
        60.00, 120.00, 50, 10, 100, 'units', true
    ) RETURNING id INTO v_product_inventory_id;
    
    RAISE NOTICE '✅ Created inventory item: % (Type: Product/Merchandise)', v_product_inventory_id;
    
    -- ========================================================================
    -- STEP 2: Create product
    -- ========================================================================
    INSERT INTO products (
        business_id, name, sku, inventory_item_id, selling_price, cost_price, current_stock, is_active
    ) VALUES (
        v_business_id, 'Merchandise Product', 'MERCH-' || v_product_sku,
        v_product_inventory_id, 120.00, 60.00, 50, true
    ) RETURNING id INTO v_product_id;
    
    RAISE NOTICE '✅ Created product: %', v_product_id;
    
    -- ========================================================================
    -- STEP 3: Create POS transaction
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 2: Creating POS Sale';
    RAISE NOTICE '----------------------------------------';
    
    SELECT current_stock INTO v_initial_stock
    FROM inventory_items WHERE id = v_product_inventory_id;
    RAISE NOTICE 'Initial stock: %', v_initial_stock;
    
    INSERT INTO pos_transactions (
        business_id, transaction_number, total_amount, final_amount,
        payment_method, status, created_by
    ) VALUES (
        v_business_id, 'MERCH-TEST-' || v_timestamp, 240.00, 240.00,
        'cash', 'completed', v_user_id
    ) RETURNING id INTO v_pos_transaction_id;
    
    -- Add product item
    INSERT INTO pos_transaction_items (
        pos_transaction_id, product_id, item_type, item_name,
        quantity, unit_price, total_price, business_id
    ) VALUES (
        v_pos_transaction_id, v_product_id, 'product', 'Merchandise Product',
        2, 120.00, 240.00, v_business_id
    );
    
    -- CRITICAL: For merchandise, we need to update inventory
    -- This is where the product inventory workflow should happen
    
    RAISE NOTICE '⚠️ Need to determine how product inventory is updated';
    RAISE NOTICE '   Is it through:';
    RAISE NOTICE '   1. update_inventory_for_pos_transaction()?';
    RAISE NOTICE '   2. process_pos_sale()?';
    RAISE NOTICE '   3. Something else?';
    
    -- Try to update inventory using the correct method for merchandise
    BEGIN
        -- Attempt to update using the product-specific function
        PERFORM update_inventory_for_pos_transaction(v_pos_transaction_id, v_user_id);
        RAISE NOTICE '✅ Called update_inventory_for_pos_transaction';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️ update_inventory_for_pos_transaction failed: %', SQLERRM;
    END;
    
    SELECT current_stock INTO v_stock_after_sale
    FROM inventory_items WHERE id = v_product_inventory_id;
    
    RAISE NOTICE 'Stock after sale: % → %', v_initial_stock, v_stock_after_sale;
    
    -- ========================================================================
    -- STEP 4: Create refund for product
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'STEP 3: Testing Product Refund';
    RAISE NOTICE '----------------------------------------';
    
    DECLARE
        v_line_item_id UUID;
    BEGIN
        SELECT id INTO v_line_item_id
        FROM pos_transaction_items
        WHERE pos_transaction_id = v_pos_transaction_id
        LIMIT 1;
        
        INSERT INTO refunds (
            business_id, refund_number, original_transaction_id, original_transaction_type,
            refund_type, refund_method, subtotal_refunded, discount_refunded, tax_refunded,
            total_refunded, refund_reason, status, created_by
        ) VALUES (
            v_business_id, 'MERCH-REFUND-' || v_timestamp, v_pos_transaction_id, 'POS',
            'FULL', 'CASH', 240.00, 0.00, 0.00, 240.00,
            'Full refund of merchandise', 'APPROVED', v_user_id
        ) RETURNING id INTO v_refund_id;
        
        INSERT INTO refund_items (
            refund_id, business_id, original_line_item_id, original_line_type,
            product_id, item_name, quantity_refunded, unit_price,
            subtotal_refunded, discount_refunded, tax_refunded, total_refunded
        ) VALUES (
            v_refund_id, v_business_id, v_line_item_id, 'POS_ITEM',
            v_product_id, 'Merchandise Product', 2, 120.00,
            240.00, 0.00, 0.00, 240.00
        );
        
        RAISE NOTICE '✅ Created refund: %', v_refund_id;
        
        -- Wait for trigger
        PERFORM pg_sleep(1);
        
        SELECT current_stock INTO v_stock_after_refund
        FROM inventory_items WHERE id = v_product_inventory_id;
        
        RAISE NOTICE 'Stock after refund: %', v_stock_after_refund;
        
    END;
    
    -- ========================================================================
    -- STEP 5: Results
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST RESULTS';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Initial stock: %', v_initial_stock;
    RAISE NOTICE 'After sale: % (Expected: %)', v_stock_after_sale, v_initial_stock - 2;
    RAISE NOTICE 'After refund: % (Expected: %)', v_stock_after_refund, v_initial_stock;
    
    IF v_stock_after_sale = v_initial_stock - 2 THEN
        RAISE NOTICE '✅ Product inventory workflow WORKING!';
    ELSE
        RAISE NOTICE '❌ Product inventory workflow BROKEN';
        RAISE NOTICE '';
        RAISE NOTICE 'The system likely has separate workflows for:';
        RAISE NOTICE '  - Products (Merchandise): Should update current_stock';
        RAISE NOTICE '  - Assets (Equipment/Hire): May not use current_stock';
    END IF;
    
    -- Cleanup
    DELETE FROM refund_items WHERE refund_id = v_refund_id;
    DELETE FROM refunds WHERE id = v_refund_id;
    DELETE FROM pos_transaction_items WHERE pos_transaction_id = v_pos_transaction_id;
    DELETE FROM pos_transactions WHERE id = v_pos_transaction_id;
    DELETE FROM products WHERE id = v_product_id;
    DELETE FROM inventory_items WHERE id = v_product_inventory_id;
    
END $$;
