-- ============================================================================
-- COMPLETE CLEANUP QUERY FOR DUPLICATE WALLET TRANSACTIONS
-- ============================================================================
BEGIN;

DO $$
DECLARE
    v_wallet_id UUID := 'd8fa1c8f-c3a5-4060-8200-108b64af1cff';
    v_deleted_count INTEGER := 0;
    v_correct_balance NUMERIC;
    v_current_balance NUMERIC;
    v_duplicate_amount NUMERIC := 0;
    v_reversal_amount NUMERIC := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING DUPLICATE WALLET TRANSACTIONS';
    RAISE NOTICE 'Wallet ID: %', v_wallet_id;
    RAISE NOTICE '========================================';

    -- Get current wallet balance
    SELECT current_balance INTO v_current_balance
    FROM money_wallets 
    WHERE id = v_wallet_id;

    RAISE NOTICE 'Current wallet balance: %', v_current_balance;

    -- Calculate total amount from duplicate PO payments (each 300,000 was deducted twice)
    SELECT COALESCE(SUM(amount), 0) INTO v_duplicate_amount
    FROM wallet_transactions 
    WHERE wallet_id = v_wallet_id
      AND transaction_type = 'expense'
      AND description LIKE '%PO SYS-000001%'
      AND (reference_type IS NULL OR reference_type != 'vendor_payment');

    RAISE NOTICE 'Duplicate deductions found: %', v_duplicate_amount;
    
    -- Check for any reversals that need to be accounted for
    SELECT COALESCE(SUM(amount), 0) INTO v_reversal_amount
    FROM wallet_transactions 
    WHERE wallet_id = v_wallet_id
      AND transaction_type = 'income'
      AND description LIKE '%Reversal: Failed PO payment cleanup%';

    RAISE NOTICE 'Reversal amount: %', v_reversal_amount;

    -- Delete duplicate wallet transactions (those without vendor_payment reference)
    WITH duplicates AS (
        SELECT 
            wt.id,
            ROW_NUMBER() OVER (
                PARTITION BY wt.wallet_id, DATE_TRUNC('second', wt.created_at), wt.amount
                ORDER BY CASE 
                    WHEN wt.reference_type = 'vendor_payment' THEN 1  -- Keep these
                    ELSE 2  -- Delete these
                END, wt.created_at
            ) as rn
        FROM wallet_transactions wt
        WHERE wt.wallet_id = v_wallet_id
          AND wt.transaction_type = 'expense'
          AND wt.description LIKE '%PO SYS-000001%'
    )
    DELETE FROM wallet_transactions 
    WHERE id IN (
        SELECT id FROM duplicates WHERE rn = 2
    );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted duplicate transactions: %', v_deleted_count;

    -- Calculate correct balance
    -- Starting from the reversal (which brought us to 1,560,000)
    -- Then subtract ONLY the correct vendor_payment transactions (300,000 + 300,000 = 600,000)
    -- So: 1,560,000 - 600,000 = 960,000
    v_correct_balance := 1560000.00 - 600000.00;
    
    RAISE NOTICE 'Calculated correct balance: %', v_correct_balance;
    RAISE NOTICE 'Balance adjustment needed: %', v_correct_balance - v_current_balance;

    -- Update wallet to correct balance
    UPDATE money_wallets 
    SET current_balance = v_correct_balance,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Cleanup completed successfully';
    RAISE NOTICE '   - Deleted % duplicate transactions', v_deleted_count;
    RAISE NOTICE '   - Corrected balance from % to %', v_current_balance, v_correct_balance;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error during cleanup: %', SQLERRM;
    RAISE EXCEPTION 'Cleanup failed';
END $$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
DO $$
DECLARE
    v_wallet_balance NUMERIC;
    v_transaction_count INTEGER;
    v_vendor_payment_refs INTEGER;
    v_duplicate_count INTEGER;
    v_correct_po_payments NUMERIC;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';

    -- Check wallet balance
    SELECT current_balance INTO v_wallet_balance
    FROM money_wallets 
    WHERE id = 'd8fa1c8f-c3a5-4060-8200-108b64af1cff';

    -- Count transactions
    SELECT COUNT(*) INTO v_transaction_count
    FROM wallet_transactions 
    WHERE wallet_id = 'd8fa1c8f-c3a5-4060-8200-108b64af1cff';

    -- Count vendor payment references
    SELECT COUNT(*) INTO v_vendor_payment_refs
    FROM wallet_transactions 
    WHERE wallet_id = 'd8fa1c8f-c3a5-4060-8200-108b64af1cff'
      AND reference_type = 'vendor_payment';

    -- Check for duplicates
    SELECT COUNT(*) INTO v_duplicate_count
    FROM (
        SELECT 
            wt.amount,
            DATE_TRUNC('second', wt.created_at) as transaction_second,
            COUNT(*) as count_per_second
        FROM wallet_transactions wt
        WHERE wt.wallet_id = 'd8fa1c8f-c3a5-4060-8200-108b64af1cff'
          AND wt.transaction_type = 'expense'
          AND wt.description LIKE '%PO SYS-000001%'
        GROUP BY wt.amount, DATE_TRUNC('second', wt.created_at)
        HAVING COUNT(*) > 1
    ) dup_check;

    -- Sum of correct PO payments
    SELECT COALESCE(SUM(amount), 0) INTO v_correct_po_payments
    FROM wallet_transactions 
    WHERE wallet_id = 'd8fa1c8f-c3a5-4060-8200-108b64af1cff'
      AND reference_type = 'vendor_payment'
      AND description LIKE '%PO SYS-000001%';

    RAISE NOTICE 'Mobile Money Wallet Balance: %', v_wallet_balance;
    RAISE NOTICE 'Total Transactions: %', v_transaction_count;
    RAISE NOTICE 'Vendor Payment References: %', v_vendor_payment_refs;
    RAISE NOTICE 'Duplicate Groups Found: %', v_duplicate_count;
    RAISE NOTICE 'Correct PO Payments Total: %', v_correct_po_payments;

    IF v_duplicate_count = 0 THEN
        RAISE NOTICE '✅ No duplicates found';
    ELSE
        RAISE NOTICE '❌ Still have duplicates: % groups', v_duplicate_count;
    END IF;

    IF v_wallet_balance = 960000.00 THEN
        RAISE NOTICE '✅ Wallet balance is CORRECT: 960,000 UGX';
    ELSE
        RAISE NOTICE '❌ Wallet balance is WRONG: % (should be 960,000)', v_wallet_balance;
    END IF;

    IF v_correct_po_payments = 600000.00 THEN
        RAISE NOTICE '✅ Correct PO payments total: 600,000 UGX';
    ELSE
        RAISE NOTICE '❌ PO payments total is wrong: % (should be 600,000)', v_correct_po_payments;
    END IF;

END $$;

COMMIT;

-- ============================================================================
-- FINAL STATE CHECK
-- ============================================================================
SELECT 
    id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    reference_type,
    reference_id,
    created_at
FROM wallet_transactions 
WHERE wallet_id = 'd8fa1c8f-c3a5-4060-8200-108b64af1cff'
ORDER BY created_at;
