-- File: ~/Bizzy_Track_pro/database/migrations/075_fix_mobile_money_accounting.sql
-- ============================================================================
-- FIX MOBILE MONEY ACCOUNTING (Migration 075)
-- ============================================================================
-- Fix the failed correction and properly update mobile money transactions
-- ============================================================================

-- ============================================================================
-- STEP 1: FIX THE UPDATE STATEMENT (REMOVE updated_at)
-- ============================================================================
DO $$
DECLARE
    v_transaction_record RECORD;
    v_correct_account_id UUID;
    v_wrong_account_id UUID;
    v_journal_entry_id UUID;
    v_line_id UUID;
BEGIN
    -- Find transactions with mobile_money payment but accounted to cash
    FOR v_transaction_record IN 
        SELECT 
            pt.id as transaction_id,
            pt.payment_method,
            pt.final_amount,
            je.id as journal_entry_id,
            ca.id as current_account_id,
            ca.account_code as current_account_code
        FROM pos_transactions pt
        JOIN journal_entries je ON je.reference_id = pt.id::text 
            AND je.reference_type = 'pos_transaction'
        JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        JOIN chart_of_accounts ca ON jel.account_id = ca.id
        WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
            AND jel.line_type = 'debit'
            AND pt.payment_method = 'mobile_money'
            AND ca.account_code = '1110'  -- Wrong: should be 1130
    LOOP
        -- Get correct account ID (1130 Mobile Money)
        SELECT id INTO v_correct_account_id
        FROM chart_of_accounts
        WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
          AND account_code = '1130'
        LIMIT 1;

        IF v_correct_account_id IS NOT NULL THEN
            -- FIXED: Remove updated_at column
            UPDATE journal_entry_lines
            SET account_id = v_correct_account_id,
                description = 'Received from POS sale via mobile_money (corrected)'
            WHERE journal_entry_id = v_transaction_record.journal_entry_id
              AND account_id = v_transaction_record.current_account_id
              AND line_type = 'debit';

            RAISE NOTICE '✅ Corrected transaction %: Changed account % → %', 
                v_transaction_record.transaction_id,
                v_transaction_record.current_account_code,
                '1130';
        END IF;
    END LOOP;
END;
$$;

-- ============================================================================
-- STEP 2: TEST THE NEW FUNCTION WITH A NEW TRANSACTION
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID := 'cf00478e-172d-4030-b7f5-10b09fc2a0b7';
    v_user_id UUID;
    v_product_id UUID;
    v_test_transaction_id UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Get a user and product for testing
    SELECT id INTO v_user_id 
    FROM users 
    WHERE business_id = v_business_id 
    LIMIT 1;

    SELECT id INTO v_product_id
    FROM products
    WHERE business_id = v_business_id
    LIMIT 1;

    IF v_user_id IS NOT NULL AND v_product_id IS NOT NULL THEN
        -- Create a test mobile_money transaction
        INSERT INTO pos_transactions (
            business_id,
            transaction_number,
            total_amount,
            final_amount,
            payment_method,
            status,
            created_by
        ) VALUES (
            v_business_id,
            'TEST-MOBILE-001',
            100000,
            100000,
            'mobile_money',
            'completed',
            v_user_id
        ) RETURNING id INTO v_test_transaction_id;

        -- Add a transaction item
        INSERT INTO pos_transaction_items (
            pos_transaction_id,
            product_id,
            item_type,
            item_name,
            quantity,
            unit_price,
            total_price
        ) VALUES (
            v_test_transaction_id,
            v_product_id,
            'product',
            'Test Product',
            1,
            100000,
            100000
        );

        -- Manually call the accounting function
        BEGIN
            v_journal_entry_id := create_journal_entry_for_pos_transaction(
                v_test_transaction_id,
                v_user_id
            );

            RAISE NOTICE '✅ Test transaction created: %', v_test_transaction_id;
            RAISE NOTICE '✅ Journal entry created: %', v_journal_entry_id;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '❌ Test failed: %', SQLERRM;
        END;

        -- Clean up test data
        DELETE FROM journal_entry_lines WHERE journal_entry_id = v_journal_entry_id;
        DELETE FROM journal_entries WHERE id = v_journal_entry_id;
        DELETE FROM pos_transaction_items WHERE pos_transaction_id = v_test_transaction_id;
        DELETE FROM pos_transactions WHERE id = v_test_transaction_id;
    END IF;
END;
$$;

-- ============================================================================
-- STEP 3: VERIFY THE CORRECTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== VERIFICATION ===';
    RAISE NOTICE 'Checking mobile money transaction corrections...';
END;
$$;

-- Show corrected transactions
SELECT 
    pt.transaction_number,
    pt.payment_method,
    pt.final_amount,
    ca.account_code,
    ca.account_name,
    jel.amount,
    jel.description
FROM pos_transactions pt
JOIN journal_entries je ON je.reference_id = pt.id::text 
    AND je.reference_type = 'pos_transaction'
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
    AND jel.line_type = 'debit'
    AND ca.account_type = 'asset'
ORDER BY pt.created_at;

-- ============================================================================
-- STEP 4: UPDATE WALLET BALANCES (CORRECTED VERSION)
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID := 'cf00478e-172d-4030-b7f5-10b09fc2a0b7';
    v_cash_balance DECIMAL := 0;
    v_mobile_balance DECIMAL := 0;
    v_cash_wallet_id UUID;
    v_mobile_wallet_id UUID;
BEGIN
    -- Calculate cash balance (only from cash transactions)
    SELECT COALESCE(SUM(jel.amount), 0) INTO v_cash_balance
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    JOIN pos_transactions pt ON je.reference_id = pt.id::text 
        AND je.reference_type = 'pos_transaction'
    WHERE je.business_id = v_business_id
        AND jel.line_type = 'debit'
        AND ca.account_code = '1110'
        AND pt.payment_method = 'cash'
        AND je.voided_at IS NULL;

    -- Calculate mobile money balance
    SELECT COALESCE(SUM(jel.amount), 0) INTO v_mobile_balance
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    JOIN pos_transactions pt ON je.reference_id = pt.id::text 
        AND je.reference_type = 'pos_transaction'
    WHERE je.business_id = v_business_id
        AND jel.line_type = 'debit'
        AND ca.account_code = '1130'
        AND pt.payment_method = 'mobile_money'
        AND je.voided_at IS NULL;

    RAISE NOTICE 'Cash balance (from cash transactions): % UGX', v_cash_balance;
    RAISE NOTICE 'Mobile money balance: % UGX', v_mobile_balance;

    -- Update cash drawer wallet
    UPDATE money_wallets 
    SET current_balance = v_cash_balance
    WHERE business_id = v_business_id 
        AND wallet_type = 'cash_drawer'
        AND gl_account_id = (
            SELECT id FROM chart_of_accounts 
            WHERE business_id = v_business_id 
            AND account_code = '1110'
        );

    -- Update mobile money wallet
    UPDATE money_wallets 
    SET current_balance = v_mobile_balance
    WHERE business_id = v_business_id 
        AND wallet_type = 'mobile_money'
        AND gl_account_id = (
            SELECT id FROM chart_of_accounts 
            WHERE business_id = v_business_id 
            AND account_code = '1130'
        );

    -- Set petty cash to 0 (unless manually allocated)
    UPDATE money_wallets 
    SET current_balance = 0
    WHERE business_id = v_business_id 
        AND wallet_type = 'petty_cash';

    RAISE NOTICE '✅ Wallet balances updated';
END;
$$;

-- ============================================================================
-- STEP 5: FINAL VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL VERIFICATION ===';
    RAISE NOTICE 'Migration 075: Fixed mobile money accounting';
END;
$$;

-- Show final state
SELECT 
    'Transaction Summary' as category,
    COUNT(*) as count,
    SUM(final_amount) as total_amount
FROM pos_transactions 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
UNION ALL
SELECT 
    'Cash Transactions',
    COUNT(*) FILTER (WHERE payment_method = 'cash'),
    SUM(final_amount) FILTER (WHERE payment_method = 'cash')
FROM pos_transactions 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
UNION ALL
SELECT 
    'Mobile Money Transactions',
    COUNT(*) FILTER (WHERE payment_method = 'mobile_money'),
    SUM(final_amount) FILTER (WHERE payment_method = 'mobile_money')
FROM pos_transactions 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7';

-- Show wallet balances
SELECT 
    name as wallet_name,
    wallet_type,
    current_balance,
    currency,
    (SELECT account_code FROM chart_of_accounts WHERE id = gl_account_id) as gl_account
FROM money_wallets 
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
ORDER BY wallet_type;

-- Show accounting by payment method
SELECT 
    pt.payment_method,
    ca.account_code,
    ca.account_name,
    SUM(jel.amount) as total_amount
FROM pos_transactions pt
JOIN journal_entries je ON je.reference_id = pt.id::text 
    AND je.reference_type = 'pos_transaction'
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts ca ON jel.account_id = ca.id
WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
    AND jel.line_type = 'debit'
    AND ca.account_type = 'asset'
GROUP BY pt.payment_method, ca.account_code, ca.account_name
ORDER BY pt.payment_method;
