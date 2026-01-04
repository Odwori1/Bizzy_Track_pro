-- Migration 083: Complete business account and wallet setup
-- Fixes incomplete GL accounts and wallet mappings for ALL existing businesses

-- ============================================================================
-- PART 1: CREATE MISSING CHART OF ACCOUNTS FOR ALL BUSINESSES
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_business_has_complete_accounts(p_business_id UUID)
RETURNS VOID AS $$
DECLARE
    v_account RECORD;
BEGIN
    RAISE NOTICE 'Ensuring complete chart of accounts for business: %', p_business_id;
    
    -- Standard chart of accounts (28 accounts as per migration 071)
    FOR v_account IN (
        SELECT * FROM (VALUES
            -- Assets (1000-1999)
            ('1110', 'Cash', 'asset'),
            ('1120', 'Bank Account', 'asset'),
            ('1130', 'Mobile Money', 'asset'),
            ('1200', 'Accounts Receivable', 'asset'),
            ('1300', 'Inventory', 'asset'),
            ('1400', 'Prepaid Expenses', 'asset'),
            ('1500', 'Equipment', 'asset'),
            ('1600', 'Furniture and Fixtures', 'asset'),
            ('1700', 'Accumulated Depreciation', 'asset'),
            ('1800', 'Other Assets', 'asset'),
            
            -- Liabilities (2000-2999)
            ('2100', 'Accounts Payable', 'liability'),
            ('2200', 'Loans Payable', 'liability'),
            ('2300', 'Accrued Expenses', 'liability'),
            ('2400', 'Unearned Revenue', 'liability'),
            ('2500', 'Other Liabilities', 'liability'),
            
            -- Equity (3000-3999)
            ('3100', 'Owner''s Capital', 'equity'),
            ('3200', 'Owner''s Drawings', 'equity'),
            ('3300', 'Retained Earnings', 'equity'),
            ('3400', 'Current Earnings', 'equity'),
            
            -- Revenue (4000-4999)
            ('4100', 'Sales Revenue', 'revenue'),
            ('4200', 'Service Revenue', 'revenue'),
            ('4300', 'Discounts Given', 'revenue'),
            ('4400', 'Other Revenue', 'revenue'),
            
            -- Expenses (5000-5999)
            ('5100', 'Cost of Goods Sold', 'expense'),
            ('5200', 'Salaries and Wages', 'expense'),
            ('5300', 'Rent Expense', 'expense'),
            ('5400', 'Utilities Expense', 'expense'),
            ('5500', 'Marketing Expense', 'expense'),
            ('5600', 'Depreciation Expense', 'expense'),
            ('5700', 'Other Expenses', 'expense')
        ) AS accounts(account_code, account_name, account_type)
    ) LOOP
        -- Insert account if it doesn't exist
        INSERT INTO chart_of_accounts (
            id, business_id, account_code, account_name,
            account_type, is_active, created_at, updated_at
        )
        SELECT 
            gen_random_uuid(),
            p_business_id,
            v_account.account_code,
            v_account.account_name,
            v_account.account_type,
            true,
            NOW(),
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM chart_of_accounts 
            WHERE business_id = p_business_id
            AND account_code = v_account.account_code
        );
        
        RAISE NOTICE '  Account % - %: %',
            v_account.account_code,
            v_account.account_name,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM chart_of_accounts 
                    WHERE business_id = p_business_id
                    AND account_code = v_account.account_code
                ) THEN 'CREATED/EXISTS'
                ELSE 'FAILED'
            END;
    END LOOP;
    
    RAISE NOTICE '✅ Chart of accounts complete for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: CREATE DEFAULT WALLETS FOR BUSINESSES
-- ============================================================================
CREATE OR REPLACE FUNCTION ensure_business_has_default_wallets(p_business_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_cash_account_id UUID;
    v_bank_account_id UUID;
    v_mobile_account_id UUID;
BEGIN
    RAISE NOTICE 'Ensuring default wallets for business: %', p_business_id;
    
    -- Get GL account IDs
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '1110';
    
    SELECT id INTO v_bank_account_id
    FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '1120';
    
    SELECT id INTO v_mobile_account_id
    FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '1130';
    
    -- Create Cash wallet
    INSERT INTO money_wallets (
        id, business_id, name, wallet_type,
        gl_account_id, current_balance, is_active,
        created_by, created_at, updated_at
    )
    SELECT 
        gen_random_uuid(),
        p_business_id,
        'Cash Register',
        'cash',
        v_cash_account_id,
        0.00,
        true,
        p_user_id,
        NOW(),
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM money_wallets 
        WHERE business_id = p_business_id AND wallet_type = 'cash'
    );
    
    -- Create Bank Account wallet
    INSERT INTO money_wallets (
        id, business_id, name, wallet_type,
        gl_account_id, current_balance, is_active,
        created_by, created_at, updated_at
    )
    SELECT 
        gen_random_uuid(),
        p_business_id,
        'Bank Account',
        'bank',
        v_bank_account_id,
        0.00,
        true,
        p_user_id,
        NOW(),
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM money_wallets 
        WHERE business_id = p_business_id AND wallet_type = 'bank'
    );
    
    -- Create Mobile Money wallet
    INSERT INTO money_wallets (
        id, business_id, name, wallet_type,
        gl_account_id, current_balance, is_active,
        created_by, created_at, updated_at
    )
    SELECT 
        gen_random_uuid(),
        p_business_id,
        'Mobile Money',
        'mobile_money',
        v_mobile_account_id,
        0.00,
        true,
        p_user_id,
        NOW(),
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM money_wallets 
        WHERE business_id = p_business_id AND wallet_type = 'mobile_money'
    );
    
    RAISE NOTICE '✅ Default wallets created for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: FIX ALL EXISTING BUSINESSES
-- ============================================================================
DO $$
DECLARE
    v_business RECORD;
    v_owner_user_id UUID;
    v_fixed_count INT := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING ALL EXISTING BUSINESSES';
    RAISE NOTICE '========================================';
    
    -- Get all businesses
    FOR v_business IN 
        SELECT id, name FROM businesses ORDER BY created_at
    LOOP
        RAISE NOTICE '';
        RAISE NOTICE 'Processing business: % (%)', v_business.name, v_business.id;
        
        -- Get an owner user for this business (for audit purposes)
        SELECT id INTO v_owner_user_id
        FROM users 
        WHERE business_id = v_business.id AND role = 'owner'
        LIMIT 1;
        
        -- Ensure complete accounts
        PERFORM ensure_business_has_complete_accounts(v_business.id);
        
        -- Ensure default wallets (use first owner or NULL if no owner)
        PERFORM ensure_business_has_default_wallets(
            v_business.id, 
            COALESCE(v_owner_user_id, '00000000-0000-0000-0000-000000000000'::UUID)
        );
        
        v_fixed_count := v_fixed_count + 1;
        
        RAISE NOTICE '✅ Business fixed: %', v_business.name;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'COMPLETED: Fixed % businesses', v_fixed_count;
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 4: VERIFICATION QUERY
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION REPORT';
    RAISE NOTICE '========================================';
END;
$$;

-- Check each business
SELECT 
    b.name as business_name,
    COUNT(DISTINCT ca.id) as account_count,
    COUNT(DISTINCT w.id) as wallet_count,
    CASE 
        WHEN COUNT(DISTINCT ca.id) >= 28 AND COUNT(DISTINCT w.id) >= 3 THEN '✅ COMPLETE'
        WHEN COUNT(DISTINCT ca.id) < 28 AND COUNT(DISTINCT w.id) >= 3 THEN '⚠️ MISSING ACCOUNTS'
        WHEN COUNT(DISTINCT ca.id) >= 28 AND COUNT(DISTINCT w.id) < 3 THEN '⚠️ MISSING WALLETS'
        ELSE '❌ INCOMPLETE'
    END as status
FROM businesses b
LEFT JOIN chart_of_accounts ca ON b.id = ca.business_id
LEFT JOIN money_wallets w ON b.id = w.business_id
GROUP BY b.id, b.name
ORDER BY b.created_at;

-- ============================================================================
-- PART 5: CREATE TRIGGER FOR NEW BUSINESSES (FUTURE-PROOF)
-- ============================================================================
CREATE OR REPLACE FUNCTION on_business_created_create_accounts()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_user_id UUID;
BEGIN
    RAISE NOTICE 'New business created: % (%), creating accounts and wallets...', NEW.name, NEW.id;
    
    -- Get the first owner (might not exist yet if called from trigger)
    SELECT id INTO v_owner_user_id
    FROM users 
    WHERE business_id = NEW.id AND role = 'owner'
    LIMIT 1;
    
    -- Create complete chart of accounts
    PERFORM ensure_business_has_complete_accounts(NEW.id);
    
    -- Create default wallets (use NULL user if no owner yet)
    PERFORM ensure_business_has_default_wallets(
        NEW.id, 
        COALESCE(v_owner_user_id, '00000000-0000-0000-0000-000000000000'::UUID)
    );
    
    RAISE NOTICE '✅ Accounts and wallets created for new business: %', NEW.name;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_business_created_accounts ON businesses;
CREATE TRIGGER trg_business_created_accounts
    AFTER INSERT ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION on_business_created_create_accounts();

-- ============================================================================
-- FINAL MESSAGE
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 083 COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ ACTIONS COMPLETED:';
    RAISE NOTICE '   1. Created complete chart of accounts for ALL businesses';
    RAISE NOTICE '   2. Created default wallets for ALL businesses';
    RAISE NOTICE '   3. Added trigger for automatic setup of NEW businesses';
    RAISE NOTICE '';
    RAISE NOTICE '✅ FUTURE BUSINESSES:';
    RAISE NOTICE '   New businesses will automatically get:';
    RAISE NOTICE '   • 28 GL accounts';
    RAISE NOTICE '   • 3 default wallets (Cash, Bank, Mobile Money)';
    RAISE NOTICE '   • Proper wallet→GL account mappings';
    RAISE NOTICE '';
    RAISE NOTICE '✅ SYSTEM READY FOR NEW BUSINESS REGISTRATION';
    RAISE NOTICE '';
END;
$$;
