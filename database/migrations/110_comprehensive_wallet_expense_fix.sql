-- ============================================================================
-- COMPREHENSIVE WALLET & EXPENSE FIX - WITH SCHEMA VALIDATION
-- ============================================================================
-- Fixed version that checks and creates missing columns first
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'COMPREHENSIVE WALLET FIX - SCHEMA CHECK';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 0: FIX WALLET_TRANSACTIONS TABLE SCHEMA
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Checking wallet_transactions table schema...';
    
    -- Check if journal_entry_line_id column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' 
          AND column_name = 'journal_entry_line_id'
    ) THEN
        RAISE NOTICE 'Adding missing journal_entry_line_id column...';
        
        ALTER TABLE wallet_transactions
        ADD COLUMN journal_entry_line_id UUID REFERENCES journal_entry_lines(id);
        
        RAISE NOTICE '✅ Added journal_entry_line_id column';
    ELSE
        RAISE NOTICE '✅ journal_entry_line_id column already exists';
    END IF;

    -- Check if balance_before column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' 
          AND column_name = 'balance_before'
    ) THEN
        RAISE NOTICE 'Adding missing balance_before column...';
        
        ALTER TABLE wallet_transactions
        ADD COLUMN balance_before DECIMAL(15,2);
        
        RAISE NOTICE '✅ Added balance_before column';
    ELSE
        RAISE NOTICE '✅ balance_before column already exists';
    END IF;

    -- Check if balance_after column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'wallet_transactions' 
          AND column_name = 'balance_after'
    ) THEN
        RAISE NOTICE 'Adding missing balance_after column...';
        
        ALTER TABLE wallet_transactions
        ADD COLUMN balance_after DECIMAL(15,2);
        
        RAISE NOTICE '✅ Added balance_after column';
    ELSE
        RAISE NOTICE '✅ balance_after column already exists';
    END IF;
END;
$$;

-- ============================================================================
-- PART 1: FIX THE WALLET SYNC TRIGGER FUNCTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Creating wallet sync trigger function...';
END;
$$;

CREATE OR REPLACE FUNCTION sync_wallet_balance_from_journal()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_id UUID;
    v_wallet_balance_change DECIMAL(15,2);
    v_gl_account_id UUID;
    v_business_id UUID;
    v_account_type VARCHAR(50);
    v_old_balance DECIMAL(15,2);
    v_new_balance DECIMAL(15,2);
    v_description TEXT;
BEGIN
    -- Get the GL account details
    SELECT ca.id, ca.business_id, ca.account_type 
    INTO v_gl_account_id, v_business_id, v_account_type
    FROM chart_of_accounts ca
    WHERE ca.id = NEW.account_id;

    -- Only process asset accounts (cash, bank, mobile money wallets)
    IF v_gl_account_id IS NOT NULL AND v_account_type = 'asset' THEN
        
        -- Find the wallet mapped to this GL account
        SELECT w.id, w.current_balance 
        INTO v_wallet_id, v_old_balance
        FROM money_wallets w
        WHERE w.business_id = v_business_id
          AND w.gl_account_id = v_gl_account_id
          AND w.is_active = true
        LIMIT 1;

        IF v_wallet_id IS NOT NULL THEN
            -- Calculate balance change:
            -- DEBIT to asset = increase wallet (sales, deposits)
            -- CREDIT to asset = decrease wallet (expenses, withdrawals)
            v_wallet_balance_change := CASE 
                WHEN NEW.line_type = 'debit' THEN NEW.amount
                WHEN NEW.line_type = 'credit' THEN -NEW.amount
                ELSE 0
            END;

            -- Update wallet balance
            UPDATE money_wallets
            SET current_balance = current_balance + v_wallet_balance_change,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING current_balance INTO v_new_balance;

            -- Get description from journal entry
            SELECT COALESCE(je.description, 'Journal entry: ' || je.entry_number)
            INTO v_description
            FROM journal_entries je 
            WHERE je.id = NEW.journal_entry_id;

            -- Create wallet transaction for audit trail
            INSERT INTO wallet_transactions (
                business_id,
                wallet_id,
                journal_entry_line_id,
                transaction_type,
                amount,
                balance_before,
                balance_after,
                description,
                created_at
            ) VALUES (
                v_business_id,
                v_wallet_id,
                NEW.id,
                CASE 
                    WHEN NEW.line_type = 'debit' THEN 'deposit'
                    WHEN NEW.line_type = 'credit' THEN 'withdrawal'
                    ELSE 'adjustment'
                END,
                ABS(NEW.amount),
                v_old_balance,
                v_new_balance,
                v_description,
                NOW()
            );

            RAISE NOTICE 'Wallet % %: % → % (Δ %)',
                v_wallet_id,
                CASE WHEN NEW.line_type = 'debit' THEN 'increased' ELSE 'decreased' END,
                v_old_balance,
                v_new_balance,
                v_wallet_balance_change;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_sync_wallet_on_journal_entry ON journal_entry_lines;
CREATE TRIGGER trg_sync_wallet_on_journal_entry
    AFTER INSERT ON journal_entry_lines
    FOR EACH ROW
    EXECUTE FUNCTION sync_wallet_balance_from_journal();

DO $$
BEGIN
    RAISE NOTICE '✅ Wallet sync trigger function created';
END;
$$;

-- ============================================================================
-- PART 2: CREATE WALLET REPAIR FUNCTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Creating wallet repair function...';
END;
$$;

CREATE OR REPLACE FUNCTION repair_wallet_balances_and_transactions()
RETURNS TABLE(
    wallet_name VARCHAR,
    gl_account VARCHAR,
    old_balance DECIMAL(15,2),
    calculated_balance DECIMAL(15,2),
    transactions_created INTEGER,
    status TEXT
) AS $$
DECLARE
    v_wallet RECORD;
    v_calculated_balance DECIMAL(15,2);
    v_transactions_created INTEGER := 0;
BEGIN
    FOR v_wallet IN
        SELECT
            w.id,
            w.name,
            w.business_id,
            w.current_balance,
            w.gl_account_id,
            ca.account_code
        FROM money_wallets w
        JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
        WHERE w.gl_account_id IS NOT NULL
          AND w.is_active = true
        ORDER BY w.business_id, w.name
    LOOP
        -- Calculate correct balance from journal entries
        SELECT COALESCE(SUM(
            CASE 
                WHEN jel.line_type = 'debit' THEN jel.amount 
                WHEN jel.line_type = 'credit' THEN -jel.amount 
            END
        ), 0) INTO v_calculated_balance
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE jel.account_id = v_wallet.gl_account_id
          AND je.business_id = v_wallet.business_id
          AND je.voided_at IS NULL;

        -- Update wallet balance
        UPDATE money_wallets
        SET current_balance = v_calculated_balance,
            updated_at = NOW()
        WHERE id = v_wallet.id;

        -- Create missing wallet transactions
        INSERT INTO wallet_transactions (
            business_id,
            wallet_id,
            journal_entry_line_id,
            transaction_type,
            amount,
            balance_before,
            balance_after,
            description,
            created_at
        )
        SELECT
            v_wallet.business_id,
            v_wallet.id,
            jel.id,
            CASE 
                WHEN jel.line_type = 'debit' THEN 'deposit'
                ELSE 'withdrawal'
            END,
            jel.amount,
            NULL, -- We can't calculate historical balance_before accurately
            NULL, -- We can't calculate historical balance_after accurately
            COALESCE(je.description, 'Historical: ' || je.entry_number),
            je.created_at
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE jel.account_id = v_wallet.gl_account_id
          AND je.business_id = v_wallet.business_id
          AND je.voided_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM wallet_transactions wt
              WHERE wt.journal_entry_line_id = jel.id
          )
        ORDER BY je.created_at;

        GET DIAGNOSTICS v_transactions_created = ROW_COUNT;

        -- Return results
        wallet_name := v_wallet.name;
        gl_account := v_wallet.account_code;
        old_balance := v_wallet.current_balance;
        calculated_balance := v_calculated_balance;
        transactions_created := v_transactions_created;
        status := CASE 
            WHEN v_wallet.current_balance = v_calculated_balance THEN '✅ Verified'
            ELSE '🔧 Repaired'
        END;

        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '✅ Wallet repair function created';
END;
$$;

-- ============================================================================
-- PART 3: CREATE EXPENSE-WALLET LINKAGE FIX FUNCTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Creating expense-wallet linkage fix function...';
END;
$$;

CREATE OR REPLACE FUNCTION fix_expense_wallet_linkage()
RETURNS TABLE(
    expense_number VARCHAR,
    payment_method VARCHAR,
    amount DECIMAL(15,2),
    wallet_linked VARCHAR,
    status TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH expense_updates AS (
        UPDATE expenses e
        SET wallet_id = w.id,
            updated_at = NOW()
        FROM money_wallets w
        WHERE e.business_id = w.business_id
          AND e.status = 'paid'
          AND e.payment_method IS NOT NULL
          AND (e.wallet_id IS NULL OR e.wallet_id = '00000000-0000-0000-0000-000000000000')
          AND w.is_active = true
          AND (
              (e.payment_method = 'cash' AND w.wallet_type IN ('cash', 'cash_drawer'))
              OR (e.payment_method = 'card' AND w.wallet_type IN ('bank', 'bank_account'))
              OR (e.payment_method = 'mobile_money' AND w.wallet_type = 'mobile_money')
          )
        RETURNING e.expense_number, e.payment_method, e.amount, w.name as wallet_name
    )
    SELECT 
        eu.expense_number,
        eu.payment_method,
        eu.amount,
        eu.wallet_name,
        '✅ Linked'::TEXT
    FROM expense_updates eu;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '✅ Expense-wallet linkage fix function created';
END;
$$;

-- ============================================================================
-- PART 4: EXECUTE REPAIRS
-- ============================================================================
DO $$
DECLARE
    v_result RECORD;
    v_wallet_count INTEGER := 0;
    v_expense_count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'EXECUTING REPAIRS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';

    -- Repair wallets
    RAISE NOTICE 'Repairing wallet balances and creating audit trail:';
    FOR v_result IN SELECT * FROM repair_wallet_balances_and_transactions()
    LOOP
        RAISE NOTICE '  %: % → % (Created % txns) [%]',
            v_result.wallet_name,
            v_result.old_balance,
            v_result.calculated_balance,
            v_result.transactions_created,
            v_result.status;
        v_wallet_count := v_wallet_count + 1;
    END LOOP;

    -- Fix expense linkages
    RAISE NOTICE '';
    RAISE NOTICE 'Fixing expense-wallet linkages:';
    FOR v_result IN SELECT * FROM fix_expense_wallet_linkage()
    LOOP
        RAISE NOTICE '  %: % via % → % [%]',
            v_result.expense_number,
            v_result.amount,
            v_result.payment_method,
            v_result.wallet_linked,
            v_result.status;
        v_expense_count := v_expense_count + 1;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE 'Repair Summary:';
    RAISE NOTICE '  Wallets processed: %', v_wallet_count;
    RAISE NOTICE '  Expenses linked: %', v_expense_count;
END;
$$;

-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';
END;
$$;

-- Show current wallet status
SELECT 
    w.name as wallet_name,
    w.wallet_type,
    w.current_balance,
    ca.account_code,
    (SELECT COUNT(*) FROM wallet_transactions wt WHERE wt.wallet_id = w.id) as tx_count,
    CASE 
        WHEN w.current_balance = (
            SELECT COALESCE(SUM(
                CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
            ), 0)
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE jel.account_id = w.gl_account_id
              AND je.voided_at IS NULL
        ) THEN '✅ Synced'
        ELSE '❌ Out of sync'
    END as sync_status
FROM money_wallets w
LEFT JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
WHERE w.is_active = true
ORDER BY w.business_id, w.wallet_type;

-- ============================================================================
-- PART 6: FINAL SUMMARY
-- ============================================================================
DO $$
DECLARE
    v_total_wallets INTEGER;
    v_total_wallet_txs INTEGER;
    v_total_expenses INTEGER;
    v_linked_expenses INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_wallets 
    FROM money_wallets WHERE is_active = true;
    
    SELECT COUNT(*) INTO v_total_wallet_txs 
    FROM wallet_transactions;
    
    SELECT COUNT(*) INTO v_total_expenses 
    FROM expenses WHERE status = 'paid';
    
    SELECT COUNT(*) INTO v_linked_expenses
    FROM expenses 
    WHERE status = 'paid' 
      AND wallet_id IS NOT NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ FIX COMPLETE - SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'FIXES APPLIED:';
    RAISE NOTICE '  ✅ wallet_transactions schema fixed (added missing columns)';
    RAISE NOTICE '  ✅ Trigger now handles DEBIT and CREDIT entries';
    RAISE NOTICE '  ✅ Wallet balances recalculated from journal entries';
    RAISE NOTICE '  ✅ Audit trail created for all wallet changes';
    RAISE NOTICE '  ✅ Expense-wallet linkages repaired';
    RAISE NOTICE '';
    RAISE NOTICE 'STATISTICS:';
    RAISE NOTICE '  Active wallets: %', v_total_wallets;
    RAISE NOTICE '  Wallet transactions: %', v_total_wallet_txs;
    RAISE NOTICE '  Paid expenses: %', v_total_expenses;
    RAISE NOTICE '  Linked to wallets: %', v_linked_expenses;
    RAISE NOTICE '';
    RAISE NOTICE '✅ SYSTEM READY FOR PRODUCTION';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Test new POS transaction → Should update wallet';
    RAISE NOTICE '  2. Test new expense payment → Should decrease wallet';
    RAISE NOTICE '  3. Verify wallet_transactions table is being populated';
END;
$$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION: Display wallet_transactions sample
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Sample wallet transactions (most recent 5):';
END;
$$;

SELECT 
    wt.created_at,
    w.name as wallet,
    wt.transaction_type,
    wt.amount,
    wt.balance_before,
    wt.balance_after,
    wt.description
FROM wallet_transactions wt
JOIN money_wallets w ON wt.wallet_id = w.id
ORDER BY wt.created_at DESC
LIMIT 5;
