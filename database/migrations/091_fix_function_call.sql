-- ============================================================================
-- MIGRATION 091: FIX THE ACTUAL PROBLEM
-- ============================================================================
-- Issue: process_pos_accounting_safe() calls create_journal_entry_for_pos_transaction()
--        which doesn't update inventory
-- Solution: Make it call create_journal_entry_for_pos_transaction_fixed() instead
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL FIX: CALL CORRECT FUNCTION';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'process_pos_accounting_safe() calls WRONG function';
    RAISE NOTICE 'It calls: create_journal_entry_for_pos_transaction()';
    RAISE NOTICE 'Should call: create_journal_entry_for_pos_transaction_fixed()';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- PART 1: UPDATE process_pos_accounting_safe() TO CALL FIXED VERSION
-- ============================================================================

CREATE OR REPLACE FUNCTION process_pos_accounting_safe(
    p_transaction_id UUID,
    p_user_id UUID
) RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    journal_entry_id UUID,
    lines_created INTEGER
) AS $$
DECLARE
    v_business_id UUID;
    v_status TEXT;
    v_already_processed BOOLEAN;
    v_journal_entry_id UUID;
    v_line_count INTEGER;
    v_existing_journal_id UUID;
    v_payment_method VARCHAR(50);
BEGIN
    -- Check if transaction exists and is completed
    SELECT business_id, status, accounting_processed, payment_method
    INTO v_business_id, v_status, v_already_processed, v_payment_method
    FROM pos_transactions
    WHERE id = p_transaction_id;

    IF v_business_id IS NULL THEN
        RETURN QUERY SELECT false, 'Transaction not found', NULL::UUID, 0;
        RETURN;
    END IF;

    IF v_status != 'completed' THEN
        RETURN QUERY SELECT false, 'Transaction not completed', NULL::UUID, 0;
        RETURN;
    END IF;

    -- Check if journal entry already exists
    SELECT id INTO v_existing_journal_id
    FROM journal_entries
    WHERE business_id = v_business_id
      AND reference_type = 'pos_transaction'
      AND reference_id = p_transaction_id::TEXT;

    -- If journal entry already exists, return it
    IF v_existing_journal_id IS NOT NULL THEN
        -- Count lines
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = v_existing_journal_id;

        -- Mark as processed if not already
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id
          AND accounting_processed = FALSE;

        RETURN QUERY SELECT true, 'Accounting already exists (returning existing entry)',
                     v_existing_journal_id, v_line_count;
        RETURN;
    END IF;

    -- Only check already_processed if no journal entry exists yet
    IF v_already_processed THEN
        RETURN QUERY SELECT false, 'Accounting already processed but no journal entry found', NULL::UUID, 0;
        RETURN;
    END IF;

    -- Verify items exist
    IF NOT EXISTS (
        SELECT 1 FROM pos_transaction_items
        WHERE pos_transaction_id = p_transaction_id
    ) THEN
        RETURN QUERY SELECT false, 'No transaction items found', NULL::UUID, 0;
        RETURN;
    END IF;

    -- ========================================================================
    -- CRITICAL FIX: CALL THE FIXED VERSION THAT UPDATES INVENTORY
    -- ========================================================================
    BEGIN
        v_journal_entry_id := create_journal_entry_for_pos_transaction_fixed(  -- ← CHANGED THIS!
            p_transaction_id,
            p_user_id
        );

        IF v_journal_entry_id IS NULL THEN
            RAISE EXCEPTION 'Journal entry creation returned NULL';
        END IF;

        -- Count lines created
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = v_journal_entry_id;

        -- Mark as processed
        UPDATE pos_transactions
        SET accounting_processed = TRUE,
            accounting_error = NULL
        WHERE id = p_transaction_id;

        RETURN QUERY SELECT true, 'Accounting processed successfully',
                     v_journal_entry_id, v_line_count;

    EXCEPTION WHEN OTHERS THEN
        -- Log error
        UPDATE pos_transactions
        SET accounting_error = SQLERRM
        WHERE id = p_transaction_id;

        -- Return failure with explicit NULL cast to UUID
        RETURN QUERY SELECT false, 'Accounting failed: ' || SQLERRM,
                     NULL::UUID, 0;
    END;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: TEST THE 8TH SALE AGAIN
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_inventory_item_id UUID := '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';
    v_8th_sale_id UUID := '42a374a6-9453-4461-95e1-1fb37749f770';
    v_user_id UUID := 'f7e2a2e5-a92e-41ee-864f-524b72b7bb7c';
    v_current_stock DECIMAL;
    v_result RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TESTING 8TH SALE WITH FIXED FUNCTION';
    RAISE NOTICE '========================================';

    -- Get current stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items 
    WHERE id = v_inventory_item_id;
    
    RAISE NOTICE 'Current stock before fix: %', v_current_stock;

    -- Reset accounting processed flag so we can test
    UPDATE pos_transactions 
    SET accounting_processed = false,
        accounting_error = NULL
    WHERE id = v_8th_sale_id;

    -- Delete existing journal entries for clean test
    DELETE FROM journal_entry_lines jel
    USING journal_entries je
    WHERE jel.journal_entry_id = je.id
      AND je.reference_id = v_8th_sale_id::text
      AND je.reference_type = 'pos_transaction';

    DELETE FROM journal_entries 
    WHERE reference_id = v_8th_sale_id::text
      AND reference_type = 'pos_transaction';

    -- Now call the function
    SELECT * INTO v_result
    FROM process_pos_accounting_safe(v_8th_sale_id, v_user_id);

    RAISE NOTICE 'Function result: success=%, message=%', 
        v_result.success, v_result.message;

    -- Check stock after
    SELECT current_stock INTO v_current_stock
    FROM inventory_items 
    WHERE id = v_inventory_item_id;
    
    RAISE NOTICE 'Current stock after fix: %', v_current_stock;

    -- Check inventory transactions
    RAISE NOTICE 'Inventory transactions for 8th sale: %',
        (SELECT COUNT(*) FROM inventory_transactions 
         WHERE reference_id = v_8th_sale_id);
END;
$$;

-- ============================================================================
-- PART 3: VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';
END;
$$;

-- Check final state
SELECT 
    'Current Stock' as metric,
    current_stock as value,
    CASE 
        WHEN current_stock = 2.00 THEN '✅ CORRECT (10 initial - 8 sold)'
        ELSE '❌ WRONG (should be 2.00)'
    END as status
FROM inventory_items 
WHERE id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1';

SELECT 
    'Inventory Transactions' as metric,
    COUNT(*) as count,
    SUM(ABS(quantity)) as total_units_sold,
    CASE 
        WHEN SUM(ABS(quantity)) = 8 THEN '✅ CORRECT (8 units sold)'
        ELSE '❌ WRONG (should be 8 units)'
    END as status
FROM inventory_transactions 
WHERE inventory_item_id = '389dc5c2-83ae-4bb9-a184-25be4f7b65c1'
  AND transaction_type = 'sale';

SELECT 
    '8th Sale Check' as metric,
    (SELECT COUNT(*) FROM inventory_transactions WHERE reference_id = '42a374a6-9453-4461-95e1-1fb37749f770') as has_inventory_tx,
    (SELECT COUNT(*) FROM journal_entries WHERE reference_id = '42a374a6-9453-4461-95e1-1fb37749f770'::text) as has_journal_entry,
    CASE 
        WHEN (SELECT COUNT(*) FROM inventory_transactions WHERE reference_id = '42a374a6-9453-4461-95e1-1fb37749f770') > 0 
        THEN '✅ HAS INVENTORY TRANSACTION'
        ELSE '❌ MISSING INVENTORY TRANSACTION'
    END as status;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Updated process_pos_accounting_safe() to call FIXED version';
    RAISE NOTICE '✅ Now calls: create_journal_entry_for_pos_transaction_fixed()';
    RAISE NOTICE '✅ Which includes inventory updates';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Test a 9th sale to confirm fix works!';
END;
$$;
