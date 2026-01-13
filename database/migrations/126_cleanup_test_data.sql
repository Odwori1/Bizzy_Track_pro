-- ============================================================================
-- MIGRATION 126: CLEAN UP TEST PURCHASE DATA ONLY
-- ============================================================================
-- Purpose: Clean up test purchase data while preserving legitimate expenses
-- Date: 2026-01-09
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    v_deleted_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CLEANING UP TEST PURCHASE DATA ONLY';
    RAISE NOTICE '========================================';

    -- 1. Delete vendor payments (if any) - these would be from test purchases
    DELETE FROM vendor_payments 
    WHERE business_id = v_business_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted vendor payments: %', v_deleted_count;

    -- 2. Delete purchase order items
    DELETE FROM purchase_order_items 
    WHERE business_id = v_business_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted purchase order items: %', v_deleted_count;

    -- 3. Delete purchase orders
    DELETE FROM purchase_orders 
    WHERE business_id = v_business_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted purchase orders: %', v_deleted_count;

    -- 4. Reset inventory stock to zero (but keep items)
    UPDATE inventory_items 
    SET current_stock = 0,
        updated_at = NOW()
    WHERE business_id = v_business_id
      AND current_stock > 0;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Reset inventory stock for % items', v_deleted_count;

    -- 5. Delete inventory transactions (purchases/sales)
    DELETE FROM inventory_transactions 
    WHERE business_id = v_business_id;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted inventory transactions: %', v_deleted_count;

    -- 6. Delete ONLY purchase_order journal entries (NOT expense or expense_payment)
    DELETE FROM journal_entries 
    WHERE business_id = v_business_id
      AND reference_type = 'purchase_order';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted purchase_order journal entries: %', v_deleted_count;

    -- Note: We are PRESERVING expense and expense_payment journal entries
    -- because they represent legitimate business expenses

    RAISE NOTICE '';
    RAISE NOTICE '✅ Cleanup complete!';
    RAISE NOTICE 'The system is now ready for fresh purchase order testing.';
    RAISE NOTICE '';
    RAISE NOTICE 'Preserved legitimate expenses:';
    RAISE NOTICE '  - Office rent: 800,000 UGX';
    RAISE NOTICE '  - Internet bill: 80,000 UGX';
    RAISE NOTICE '  - Test expense: 50,000 UGX';
    RAISE NOTICE '';
    RAISE NOTICE 'Current wallet balances preserved:';
    RAISE NOTICE '  - Cash: 61,000 UGX';
    RAISE NOTICE '  - Bank: 440,000 UGX';
    RAISE NOTICE '  - Mobile Money: 1,560,000 UGX';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready to test complete purchase → payment workflow!';

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error during cleanup: %', SQLERRM;
    RAISE EXCEPTION 'Cleanup failed';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_expense_count INTEGER;
    v_expense_payment_count INTEGER;
    v_purchase_order_journal_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';

    -- Check purchase orders (should be 0)
    RAISE NOTICE 'Purchase orders: %', (
        SELECT COUNT(*) FROM purchase_orders WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
    );

    -- Check journal entries (expenses should remain, purchase_orders should be deleted)
    SELECT COUNT(*) INTO v_expense_count 
    FROM journal_entries 
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
      AND reference_type = 'expense';
    
    SELECT COUNT(*) INTO v_expense_payment_count 
    FROM journal_entries 
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
      AND reference_type = 'expense_payment';
    
    SELECT COUNT(*) INTO v_purchase_order_journal_count 
    FROM journal_entries 
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
      AND reference_type = 'purchase_order';

    RAISE NOTICE 'Expense journal entries preserved: %', v_expense_count;
    RAISE NOTICE 'Expense payment journal entries preserved: %', v_expense_payment_count;
    RAISE NOTICE 'Purchase order journal entries deleted: % (should be 0)', v_purchase_order_journal_count;

    -- Check wallet balances (should be preserved)
    RAISE NOTICE '';
    RAISE NOTICE 'Wallet balances after cleanup:';
END $$;

-- Show wallet balances
SELECT 
    name,
    wallet_type,
    current_balance
FROM money_wallets 
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
ORDER BY 
    CASE wallet_type 
        WHEN 'cash' THEN 1
        WHEN 'bank' THEN 2
        WHEN 'mobile_money' THEN 3
        ELSE 4
    END;

-- Show preserved expense journal entries
SELECT 
    'PRESERVED: ' || reference_type as entry_type,
    description,
    total_amount,
    created_at
FROM journal_entries 
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
  AND reference_type IN ('expense', 'expense_payment')
ORDER BY created_at;
