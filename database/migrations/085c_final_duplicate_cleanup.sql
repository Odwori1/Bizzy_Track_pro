-- Migration 085c: Final duplicate cleanup for business 243a15b5-255a-4852-83bf-5cb46aa62b5e
-- Production-safe manual cleanup - CORRECT SYNTAX VERSION

BEGIN;

-- ============================================
-- 1. CREATE BACKUP OF AFFECTED WALLETS
-- ============================================
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS money_wallets_duplicate_backup AS
    SELECT *, CURRENT_TIMESTAMP as backup_timestamp 
    FROM money_wallets 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND wallet_type IN ('cash', 'mobile_money');
    
    RAISE NOTICE 'Created backup table: money_wallets_duplicate_backup';
END $$;

COMMENT ON TABLE money_wallets_duplicate_backup IS 'Backup of duplicate wallets before cleanup for business 243a15b5-255a-4852-83bf-5cb46aa62b5e';

-- ============================================
-- 2. CLEANUP DUPLICATES AND ADD CONSTRAINT
-- ============================================
DO $$
DECLARE
    v_cash_wallet_to_keep UUID;
    v_mobile_wallet_to_keep UUID;
    v_wallet_transaction_count INTEGER;
    v_wallet_rec RECORD;
    v_deleted_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DUPLICATE CLEANUP FOR BUSINESS: 243a15b5-255a-4852-83bf-5cb46aa62b5e';
    RAISE NOTICE '========================================';
    
    -- Find the cash wallet to keep (keep the one with highest balance)
    SELECT id INTO v_cash_wallet_to_keep
    FROM money_wallets 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND wallet_type = 'cash'
    ORDER BY 
        current_balance DESC,
        created_at
    LIMIT 1;
    
    RAISE NOTICE 'Keeping cash wallet: % (has highest balance)', v_cash_wallet_to_keep;
    
    -- Find the mobile money wallet to keep
    SELECT id INTO v_mobile_wallet_to_keep
    FROM money_wallets 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND wallet_type = 'mobile_money'
    ORDER BY 
        CASE WHEN gl_account_id IS NOT NULL THEN 1 ELSE 2 END,
        current_balance DESC,
        created_at
    LIMIT 1;
    
    RAISE NOTICE 'Keeping mobile money wallet: %', v_mobile_wallet_to_keep;
    
    -- ============================================
    -- 3. CHECK FOR WALLET TRANSACTIONS
    -- ============================================
    SELECT COUNT(*) INTO v_wallet_transaction_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions';
    
    IF v_wallet_transaction_count > 0 THEN
        RAISE NOTICE 'Updating wallet_transactions references...';
        
        UPDATE wallet_transactions wt
        SET wallet_id = v_cash_wallet_to_keep
        FROM money_wallets mw
        WHERE wt.wallet_id = mw.id
          AND mw.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
          AND mw.wallet_type = 'cash'
          AND mw.id != v_cash_wallet_to_keep;
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE 'Updated % cash wallet transaction references', v_deleted_count;
        
        UPDATE wallet_transactions wt
        SET wallet_id = v_mobile_wallet_to_keep
        FROM money_wallets mw
        WHERE wt.wallet_id = mw.id
          AND mw.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
          AND mw.wallet_type = 'mobile_money'
          AND mw.id != v_mobile_wallet_to_keep;
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE 'Updated % mobile money wallet transaction references', v_deleted_count;
    ELSE
        RAISE NOTICE 'wallet_transactions table does not exist';
    END IF;
    
    -- ============================================
    -- 4. DELETE DUPLICATE WALLETS
    -- ============================================
    -- Delete duplicate cash wallets
    DELETE FROM money_wallets 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND wallet_type = 'cash'
      AND id != v_cash_wallet_to_keep;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate cash wallets', v_deleted_count;
    
    -- Delete duplicate mobile money wallets
    DELETE FROM money_wallets 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND wallet_type = 'mobile_money'
      AND id != v_mobile_wallet_to_keep;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate mobile money wallets', v_deleted_count;
    
    -- ============================================
    -- 5. VERIFY CLEANUP
    -- ============================================
    RAISE NOTICE '';
    RAISE NOTICE 'VERIFICATION:';
    RAISE NOTICE 'Cash wallets after cleanup:';
    
    FOR v_wallet_rec IN 
        SELECT id, name, current_balance, gl_account_id 
        FROM money_wallets 
        WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
          AND wallet_type = 'cash'
    LOOP
        RAISE NOTICE '  - %: % (Balance: %, GL: %)', 
            v_wallet_rec.id, v_wallet_rec.name, v_wallet_rec.current_balance, 
            CASE WHEN v_wallet_rec.gl_account_id IS NOT NULL THEN 'Yes' ELSE 'No' END;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Mobile money wallets after cleanup:';
    
    FOR v_wallet_rec IN 
        SELECT id, name, current_balance, gl_account_id 
        FROM money_wallets 
        WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
          AND wallet_type = 'mobile_money'
    LOOP
        RAISE NOTICE '  - %: % (Balance: %, GL: %)', 
            v_wallet_rec.id, v_wallet_rec.name, v_wallet_rec.current_balance, 
            CASE WHEN v_wallet_rec.gl_account_id IS NOT NULL THEN 'Yes' ELSE 'No' END;
    END LOOP;
    
END $$;

-- ============================================
-- 6. ADD THE UNIQUE CONSTRAINT
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Adding unique constraint: (business_id, wallet_type)';
    
    ALTER TABLE money_wallets
    ADD CONSTRAINT money_wallets_business_id_wallet_type_key
    UNIQUE (business_id, wallet_type);
    
    RAISE NOTICE '✅ Added unique constraint';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE '⚠️  Constraint already exists';
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Failed to add constraint: %', SQLERRM;
        RAISE;
END $$;

-- ============================================
-- 7. UPDATE THE WALLET CREATION FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION ensure_business_has_default_wallets(
    p_business_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_cash_account_id UUID;
    v_bank_account_id UUID;
    v_mobile_account_id UUID;
BEGIN
    -- Use provided user_id or find one
    SELECT COALESCE(
        p_user_id,
        (SELECT id FROM users WHERE business_id = p_business_id LIMIT 1)
    ) INTO v_user_id;
    
    -- Get account IDs
    SELECT id INTO v_cash_account_id 
    FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '1110';
    
    SELECT id INTO v_bank_account_id 
    FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '1120';
    
    SELECT id INTO v_mobile_account_id 
    FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '1130';
    
    -- Insert with ON CONFLICT - now works because constraint exists
    INSERT INTO money_wallets (
        business_id, name, wallet_type, current_balance, 
        created_by, gl_account_id, created_at, updated_at
    ) VALUES 
    (
        p_business_id, 'Cash', 'cash', 0.00, 
        v_user_id, v_cash_account_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ),
    (
        p_business_id, 'Bank Account', 'bank', 0.00, 
        v_user_id, v_bank_account_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ),
    (
        p_business_id, 'Mobile Money', 'mobile_money', 0.00, 
        v_user_id, v_mobile_account_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (business_id, wallet_type) 
    DO UPDATE SET 
        gl_account_id = EXCLUDED.gl_account_id,
        updated_at = CURRENT_TIMESTAMP;
    
    RAISE NOTICE 'Default wallets ensured for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. FINAL VERIFICATION
-- ============================================
DO $$
DECLARE
    v_remaining_duplicates INTEGER;
    v_constraint_exists BOOLEAN;
    v_total_wallets INTEGER;
BEGIN
    -- Check for remaining duplicates
    SELECT COUNT(*) INTO v_remaining_duplicates
    FROM (
        SELECT business_id, wallet_type
        FROM money_wallets
        GROUP BY business_id, wallet_type
        HAVING COUNT(*) > 1
    ) AS duplicates;
    
    -- Check constraint exists
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'money_wallets'::regclass 
          AND conname = 'money_wallets_business_id_wallet_type_key'
    ) INTO v_constraint_exists;
    
    -- Count total wallets
    SELECT COUNT(*) INTO v_total_wallets FROM money_wallets;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 085c: COMPLETION REPORT';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total wallets: %', v_total_wallets;
    RAISE NOTICE 'Remaining duplicate pairs: %', v_remaining_duplicates;
    RAISE NOTICE 'Constraint exists: %', v_constraint_exists;
    RAISE NOTICE '';
    
    IF v_remaining_duplicates = 0 AND v_constraint_exists THEN
        RAISE NOTICE '✅ SUCCESS: Migration completed';
        RAISE NOTICE '✅ Business registration should now work';
    ELSIF v_remaining_duplicates > 0 THEN
        RAISE NOTICE '⚠️  WARNING: Still have % duplicate pairs', v_remaining_duplicates;
        RAISE NOTICE '   Run this query to see duplicates:';
        RAISE NOTICE '   SELECT business_id, wallet_type, COUNT(*)';
        RAISE NOTICE '   FROM money_wallets GROUP BY business_id, wallet_type HAVING COUNT(*) > 1;';
    ELSE
        RAISE NOTICE '⚠️  WARNING: Constraint not created';
    END IF;
END $$;

COMMIT;
