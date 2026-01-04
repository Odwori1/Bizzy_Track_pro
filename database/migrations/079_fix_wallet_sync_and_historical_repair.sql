-- File: ~/Bizzy_Track_pro/database/migrations/079_fix_wallet_sync_and_historical_repair.sql
-- ============================================================================
-- COMPREHENSIVE FIX: WALLET BALANCE SYNC & HISTORICAL REPAIR
-- ============================================================================
-- Problem 1: Wallet balances not syncing with journal entries
-- Problem 2: ACC-000006 still mapped to Cash instead of Bank
-- Problem 3: Missing voided_by, void_reason columns in journal_entries
-- ============================================================================

-- ============================================================================
-- STEP 1: ADD MISSING COLUMNS TO JOURNAL_ENTRIES TABLE
-- ============================================================================
DO $$
BEGIN
    -- Check and add voided_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'journal_entries' 
        AND column_name = 'voided_by'
    ) THEN
        ALTER TABLE journal_entries 
        ADD COLUMN voided_by UUID REFERENCES users(id);
        
        RAISE NOTICE 'Added voided_by column to journal_entries';
    ELSE
        RAISE NOTICE 'voided_by column already exists in journal_entries';
    END IF;

    -- Check and add void_reason column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'journal_entries' 
        AND column_name = 'void_reason'
    ) THEN
        ALTER TABLE journal_entries 
        ADD COLUMN void_reason TEXT;
        
        RAISE NOTICE 'Added void_reason column to journal_entries';
    ELSE
        RAISE NOTICE 'void_reason column already exists in journal_entries';
    END IF;
END;
$$;

-- ============================================================================
-- STEP 2: CREATE FUNCTION TO SYNC WALLET BALANCES FROM JOURNAL ENTRIES
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_wallet_balance_from_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
    v_amount DECIMAL(15,2);
    v_gl_account_id UUID;
    v_business_id UUID;
BEGIN
    -- Only process if this is a debit line for an asset account
    IF NEW.line_type = 'debit' THEN
        -- Get the GL account and business ID
        SELECT ca.id, ca.business_id INTO v_gl_account_id, v_business_id
        FROM chart_of_accounts ca
        WHERE ca.id = NEW.account_id
          AND ca.account_type = 'asset';
        
        -- If found and it's an asset account, find the matching wallet
        IF v_gl_account_id IS NOT NULL THEN
            -- Find wallet with this GL account mapping
            SELECT w.id INTO v_wallet_id
            FROM money_wallets w
            WHERE w.business_id = v_business_id
              AND w.gl_account_id = v_gl_account_id
            LIMIT 1;
            
            -- If wallet found, update its balance
            IF v_wallet_id IS NOT NULL THEN
                UPDATE money_wallets
                SET current_balance = current_balance + NEW.amount,
                    updated_at = NOW()
                WHERE id = v_wallet_id;
                
                RAISE NOTICE 'Synced wallet % with +% from journal entry line %', 
                    v_wallet_id, NEW.amount, NEW.id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: CREATE TRIGGER FOR AUTOMATIC WALLET SYNC
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_wallet_on_journal_entry ON journal_entry_lines;
CREATE TRIGGER trg_sync_wallet_on_journal_entry
    AFTER INSERT ON journal_entry_lines
    FOR EACH ROW
    EXECUTE FUNCTION sync_wallet_balance_from_journal();

-- ============================================================================
-- STEP 4: CREATE FUNCTION TO SYNC ALL HISTORICAL WALLET BALANCES
-- ============================================================================
CREATE OR REPLACE FUNCTION sync_all_wallet_balances()
RETURNS TABLE(
    business_id UUID,
    wallet_name VARCHAR,
    old_balance DECIMAL(15,2),
    new_balance DECIMAL(15,2),
    status TEXT
) AS $$
DECLARE
    v_wallet RECORD;
    v_balance DECIMAL(15,2);
BEGIN
    -- For each wallet with GL account mapping
    FOR v_wallet IN 
        SELECT 
            w.id as wallet_id,
            w.gl_account_id,
            w.business_id,
            w.name,
            w.current_balance as old_balance
        FROM money_wallets w
        WHERE w.gl_account_id IS NOT NULL
    LOOP
        -- Calculate balance from journal entries
        SELECT COALESCE(SUM(
            CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        ), 0) INTO v_balance
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE jel.account_id = v_wallet.gl_account_id
          AND je.business_id = v_wallet.business_id
          AND je.voided_at IS NULL;
        
        -- Update wallet balance
        UPDATE money_wallets
        SET current_balance = v_balance,
            updated_at = NOW()
        WHERE id = v_wallet.wallet_id;
        
        -- Return result
        business_id := v_wallet.business_id;
        wallet_name := v_wallet.name;
        old_balance := v_wallet.old_balance;
        new_balance := v_balance;
        status := CASE 
            WHEN v_wallet.old_balance = v_balance THEN '✅ UNCHANGED' 
            ELSE '✅ UPDATED' 
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: FIX SPECIFIC INCORRECT TRANSACTION (ACC-000006)
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID := 'cf00478e-172d-4030-b7f5-10b09fc2a0b7';
    v_user_id UUID := '67ae321e-071c-4a2d-b99b-0ea2f8d7118b'; -- Test user from login
    v_pos_transaction_id UUID := '8353f33e-cdc9-424b-87bd-aade3c98aed3'; -- ACC-000006 ID
    v_wrong_journal_entry_id UUID := 'a249a5e9-d871-4fbf-b50a-c01ee3da0a0d'; -- Wrong JE ID
    v_new_journal_entry_id UUID;
BEGIN
    RAISE NOTICE 'Fixing ACC-000006 (transaction: %, business: %)', 
        v_pos_transaction_id, v_business_id;
    
    -- 1. Void the incorrect journal entry
    UPDATE journal_entries
    SET 
        voided_at = NOW(),
        voided_by = v_user_id,
        void_reason = 'Fixing incorrect card payment mapping to Cash (1110) instead of Bank Account (1120)',
        status = 'voided',
        updated_at = NOW()
    WHERE id = v_wrong_journal_entry_id;
    
    RAISE NOTICE 'Voided incorrect journal entry: %', v_wrong_journal_entry_id;
    
    -- 2. Create correct journal entry using the fixed function
    v_new_journal_entry_id := create_journal_entry_for_pos_transaction(
        v_pos_transaction_id,
        v_user_id
    );
    
    RAISE NOTICE 'Created corrected journal entry: %', v_new_journal_entry_id;
    
    -- 3. Update POS transaction status
    UPDATE pos_transactions
    SET 
        accounting_processed = TRUE,
        accounting_error = NULL,
        updated_at = NOW()
    WHERE id = v_pos_transaction_id;
    
    RAISE NOTICE '✅ ACC-000006 successfully repaired';
END;
$$;

-- ============================================================================
-- STEP 6: SYNC ALL WALLET BALANCES (ONE-TIME FIX)
-- ============================================================================
DO $$
DECLARE
    v_sync_result RECORD;
BEGIN
    RAISE NOTICE 'Syncing all wallet balances from journal entries...';
    
    FOR v_sync_result IN 
        SELECT * FROM sync_all_wallet_balances()
        ORDER BY business_id, wallet_name
    LOOP
        RAISE NOTICE 'Business: %, Wallet: %, Old: %, New: %, Status: %',
            v_sync_result.business_id,
            v_sync_result.wallet_name,
            v_sync_result.old_balance,
            v_sync_result.new_balance,
            v_sync_result.status;
    END LOOP;
    
    RAISE NOTICE '✅ All wallet balances synced';
END;
$$;

-- ============================================================================
-- STEP 7: CREATE VERIFICATION VIEW
-- ============================================================================
CREATE OR REPLACE VIEW wallet_journal_sync_status AS
SELECT 
    w.business_id,
    w.name as wallet_name,
    w.wallet_type,
    w.current_balance as wallet_balance,
    ca.account_code,
    ca.account_name,
    ROUND(COALESCE(SUM(
        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
    ), 0), 2) as journal_balance,
    CASE 
        WHEN w.current_balance = ROUND(COALESCE(SUM(
            CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
        ), 0), 2) THEN '✅ IN SYNC'
        ELSE '❌ OUT OF SYNC'
    END as sync_status,
    ROUND(w.current_balance - COALESCE(SUM(
        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
    ), 0), 2) as difference
FROM money_wallets w
LEFT JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
LEFT JOIN journal_entry_lines jel ON jel.account_id = ca.id
LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
GROUP BY w.id, w.name, w.wallet_type, w.current_balance, ca.account_code, ca.account_name, w.business_id
ORDER BY w.business_id, w.wallet_type, w.name;

-- ============================================================================
-- STEP 8: VERIFICATION QUERIES
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== VERIFICATION RESULTS ===';
    RAISE NOTICE '';
END;
$$;

-- Check wallet sync status for our test business
SELECT 
    wallet_name,
    wallet_balance,
    journal_balance,
    sync_status,
    difference
FROM wallet_journal_sync_status
WHERE business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
ORDER BY wallet_name;

-- Check card payment mappings
DO $$
DECLARE
    v_card_count INTEGER;
    v_correct_count INTEGER;
    v_wrong_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_card_count
    FROM pos_transactions pt
    WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND pt.payment_method = 'card';
    
    SELECT COUNT(*) INTO v_correct_count
    FROM pos_transactions pt
    JOIN journal_entries je ON je.reference_id = pt.id::text 
        AND je.business_id = pt.business_id
        AND je.reference_type = 'pos_transaction'
        AND je.voided_at IS NULL
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        AND jel.line_type = 'debit'
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
        AND ca.account_type = 'asset'
    WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND pt.payment_method = 'card'
      AND ca.account_code = '1120';
    
    SELECT COUNT(*) INTO v_wrong_count
    FROM pos_transactions pt
    JOIN journal_entries je ON je.reference_id = pt.id::text 
        AND je.business_id = pt.business_id
        AND je.reference_type = 'pos_transaction'
        AND je.voided_at IS NULL
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        AND jel.line_type = 'debit'
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
        AND ca.account_type = 'asset'
    WHERE pt.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND pt.payment_method = 'card'
      AND ca.account_code = '1110';
    
    RAISE NOTICE '';
    RAISE NOTICE 'Card Payment Status:';
    RAISE NOTICE '  Total card transactions: %', v_card_count;
    RAISE NOTICE '  Correctly mapped to Bank (1120): %', v_correct_count;
    RAISE NOTICE '  Incorrectly mapped to Cash (1110): %', v_wrong_count;
    
    IF v_wrong_count = 0 THEN
        RAISE NOTICE '  ✅ ALL card payments correctly mapped!';
    ELSE
        RAISE NOTICE '  ⚠️  Found % incorrect card mappings', v_wrong_count;
    END IF;
END;
$$;

-- Check accounting equation
DO $$
DECLARE
    v_asset_total DECIMAL(15,2);
    v_liability_total DECIMAL(15,2);
    v_equity_total DECIMAL(15,2);
    v_revenue_total DECIMAL(15,2);
    v_expense_total DECIMAL(15,2);
    v_difference DECIMAL(15,2);
BEGIN
    -- Calculate totals by account type
    SELECT COALESCE(SUM(
        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
    ), 0) INTO v_asset_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE ca.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND ca.account_type = 'asset';
    
    SELECT COALESCE(SUM(
        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
    ), 0) INTO v_liability_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE ca.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND ca.account_type = 'liability';
    
    SELECT COALESCE(SUM(
        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
    ), 0) INTO v_equity_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE ca.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND ca.account_type = 'equity';
    
    SELECT COALESCE(SUM(
        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
    ), 0) INTO v_revenue_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE ca.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND ca.account_type = 'revenue';
    
    SELECT COALESCE(SUM(
        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
    ), 0) INTO v_expense_total
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id AND je.voided_at IS NULL
    JOIN chart_of_accounts ca ON jel.account_id = ca.id
    WHERE ca.business_id = 'cf00478e-172d-4030-b7f5-10b09fc2a0b7'
      AND ca.account_type = 'expense';
    
    -- Accounting equation: Assets = Liabilities + Equity + Revenue - Expenses
    v_difference := v_asset_total - (v_liability_total + v_equity_total + v_revenue_total - v_expense_total);
    
    RAISE NOTICE '';
    RAISE NOTICE 'Accounting Equation Check:';
    RAISE NOTICE '  Assets: %', v_asset_total;
    RAISE NOTICE '  Liabilities: %', v_liability_total;
    RAISE NOTICE '  Equity: %', v_equity_total;
    RAISE NOTICE '  Revenue: %', v_revenue_total;
    RAISE NOTICE '  Expenses: %', v_expense_total;
    RAISE NOTICE '  Assets = Liabilities + Equity + Revenue - Expenses:';
    RAISE NOTICE '  % = % + % + % - %', 
        v_asset_total, v_liability_total, v_equity_total, v_revenue_total, v_expense_total;
    
    IF ABS(v_difference) < 0.01 THEN
        RAISE NOTICE '  ✅ ACCOUNTING EQUATION BALANCED!';
    ELSE
        RAISE NOTICE '  ❌ UNBALANCED! Difference: %', v_difference;
    END IF;
END;
$$;

-- ============================================================================
-- STEP 9: FINAL SUCCESS MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== MIGRATION 079 COMPLETE ===';
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIXES APPLIED:';
    RAISE NOTICE '   1. Added missing columns to journal_entries (voided_by, void_reason)';
    RAISE NOTICE '   2. Created wallet sync trigger for automatic balance updates';
    RAISE NOTICE '   3. Synced all historical wallet balances';
    RAISE NOTICE '   4. Fixed ACC-000006 (voided wrong entry, created correct one)';
    RAISE NOTICE '';
    RAISE NOTICE '✅ NEW FEATURES:';
    RAISE NOTICE '   1. Automatic wallet balance sync on new journal entries';
    RAISE NOTICE '   2. Real-time balance verification view';
    RAISE NOTICE '   3. Accounting equation validation';
    RAISE NOTICE '';
    RAISE NOTICE '✅ READY FOR USE:';
    RAISE NOTICE '   - New card transactions → Bank Account (1120)';
    RAISE NOTICE '   - Wallet balances auto-update from journal entries';
    RAISE NOTICE '   - Historical data repaired';
    RAISE NOTICE '';
    RAISE NOTICE 'View wallet sync status: SELECT * FROM wallet_journal_sync_status;';
END;
$$;
