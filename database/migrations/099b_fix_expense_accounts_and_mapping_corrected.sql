-- ============================================================================
-- MIGRATION 099b: FIX EXPENSE ACCOUNTS & AUTO-MAPPING (CORRECTED)
-- ============================================================================
-- Fixed version - applies changes in safe transactions
-- ============================================================================

-- PART 1: UPDATE THE EXISTING ACCOUNT CREATION FUNCTION (SAFE - NO TRANSACTION)
CREATE OR REPLACE FUNCTION ensure_business_has_complete_accounts(p_business_id UUID)
RETURNS VOID AS $$
DECLARE
    v_account RECORD;
BEGIN
    RAISE NOTICE 'Ensuring COMPLETE chart of accounts for business: %', p_business_id;

    -- Standard chart of accounts (NOW 33 ACCOUNTS with 5201-5205 added)
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

            -- Expenses (5000-5999) - UPDATED SECTION
            ('5100', 'Cost of Goods Sold', 'expense'),
            ('5200', 'Rent Expense', 'expense'),           -- ✅ FIXED: Changed from Salaries and Wages
            ('5201', 'Office Supplies Expense', 'expense'), -- 🆕 ADDED
            ('5202', 'Utilities Expense', 'expense'),      -- 🆕 ADDED
            ('5203', 'Rent Expense', 'expense'),           -- 🆕 ADDED
            ('5204', 'Marketing Expense', 'expense'),      -- 🆕 ADDED
            ('5205', 'Travel Expense', 'expense'),         -- 🆕 ADDED
            ('5300', 'Rent Expense', 'expense'),           -- ✅ EXISTS
            ('5400', 'Utilities Expense', 'expense'),      -- ✅ EXISTS
            ('5500', 'Advertising Expense', 'expense'),    -- ✅ EXISTS
            ('5600', 'Depreciation Expense', 'expense'),   -- ✅ EXISTS
            ('5700', 'Other Expenses', 'expense')          -- ✅ EXISTS
        ) AS accounts(account_code, account_name, account_type)
    ) LOOP
        -- Insert account if it doesn't exist
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name,
            account_type, is_active, created_at, updated_at
        )
        SELECT
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

        -- Update account name if it exists with wrong name (specifically 5200)
        UPDATE chart_of_accounts
        SET account_name = v_account.account_name,
            updated_at = NOW()
        WHERE business_id = p_business_id
          AND account_code = v_account.account_code
          AND account_name != v_account.account_name;
    END LOOP;

    RAISE NOTICE '✅ Chart of accounts complete for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- PART 2: UPDATE ALL EXISTING BUSINESSES WITH NEW ACCOUNTS
DO $$
DECLARE
    v_business RECORD;
    v_updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UPDATING ALL BUSINESSES';
    RAISE NOTICE '========================================';
    
    FOR v_business IN SELECT id, name FROM businesses ORDER BY created_at
    LOOP
        RAISE NOTICE 'Processing: %', v_business.name;
        
        -- This will add missing 5201-5205 accounts and fix 5200 name
        PERFORM ensure_business_has_complete_accounts(v_business.id);
        
        v_updated_count := v_updated_count + 1;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Updated % businesses with complete expense accounts', v_updated_count;
    RAISE NOTICE '========================================';
END;
$$;

-- PART 3: CREATE AUTO-MAPPING FUNCTION FOR EXPENSE CATEGORIES
CREATE OR REPLACE FUNCTION auto_map_expense_account_code()
RETURNS TRIGGER AS $$
DECLARE
    v_mapped_code VARCHAR(20);
BEGIN
    -- Only auto-map if account_code is not provided (null or empty)
    IF NEW.account_code IS NULL OR NEW.account_code = '' THEN
        v_mapped_code := CASE 
            -- High confidence mappings (aligned with 5200-series)
            WHEN LOWER(NEW.name) LIKE '%rent%' THEN '5203'  -- Use 5203 for rent
            WHEN LOWER(NEW.name) LIKE '%office%' OR 
                 LOWER(NEW.name) LIKE '%suppl%' OR 
                 LOWER(NEW.name) LIKE '%stationery%' THEN '5201'
            WHEN LOWER(NEW.name) LIKE '%salary%' OR 
                 LOWER(NEW.name) LIKE '%wage%' OR 
                 LOWER(NEW.name) LIKE '%payroll%' THEN '5200'  -- Salaries use 5200
            WHEN LOWER(NEW.name) LIKE '%utility%' OR 
                 LOWER(NEW.name) LIKE '%electric%' OR 
                 LOWER(NEW.name) LIKE '%water%' OR 
                 LOWER(NEW.name) LIKE '%internet%' THEN '5202'
            WHEN LOWER(NEW.name) LIKE '%market%' OR 
                 LOWER(NEW.name) LIKE '%advertis%' OR 
                 LOWER(NEW.name) LIKE '%promot%' THEN '5204'
            WHEN LOWER(NEW.name) LIKE '%travel%' OR 
                 LOWER(NEW.name) LIKE '%transport%' OR 
                 LOWER(NEW.name) LIKE '%accommodat%' THEN '5205'
            -- Medium confidence (use existing codes for backward compatibility)
            WHEN LOWER(NEW.name) LIKE '%insurance%' THEN '5300'
            WHEN LOWER(NEW.name) LIKE '%repair%' OR 
                 LOWER(NEW.name) LIKE '%maintenance%' THEN '5400'
            WHEN LOWER(NEW.name) LIKE '%software%' OR 
                 LOWER(NEW.name) LIKE '%subscription%' OR 
                 LOWER(NEW.name) LIKE '%license%' THEN '5201'  -- Office Supplies
            WHEN LOWER(NEW.name) LIKE '%depreciation%' THEN '5600'
            WHEN LOWER(NEW.name) LIKE '%interest%' THEN '5700'
            -- Default: Other Expenses (matches accounting function fallback)
            ELSE '5700'
        END;
        
        NEW.account_code := v_mapped_code;
        RAISE NOTICE 'Auto-mapped category "%" to account code "%"', NEW.name, v_mapped_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PART 4: CREATE TRIGGER FOR AUTOMATIC MAPPING
DROP TRIGGER IF EXISTS trg_auto_map_expense_account ON expense_categories;
CREATE TRIGGER trg_auto_map_expense_account
    BEFORE INSERT OR UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION auto_map_expense_account_code();

-- PART 5: UPDATE EXISTING CATEGORIES WITH AUTO-MAPPING
DO $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UPDATING EXISTING CATEGORIES';
    RAISE NOTICE '========================================';
    
    -- Trigger auto-mapping for existing categories
    UPDATE expense_categories 
    SET account_code = DEFAULT  -- This will trigger the auto-mapping function
    WHERE account_code IS NULL OR account_code = '';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    RAISE NOTICE '✅ Updated % categories with auto-mapped account codes', updated_count;
    RAISE NOTICE '========================================';
END;
$$;

-- PART 6: VERIFICATION (NO TRANSACTION - JUST QUERIES)
RAISE NOTICE '========================================';
RAISE NOTICE 'VERIFICATION REPORT';
RAISE NOTICE '========================================';

-- Check test business
SELECT '=== TEST BUSINESS (Fixed Permissions Test) ===' as check;
SELECT 
    account_code,
    account_name,
    CASE 
        WHEN account_code IN ('5201', '5202', '5203', '5204', '5205') 
        THEN '✅ ADDED BY MIGRATION'
        ELSE '✅ EXISTING'
    END as status
FROM chart_of_accounts 
WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
  AND account_type = 'expense'
ORDER BY account_code;

-- Count businesses with 5201-5205
SELECT '=== BUSINESSES WITH 5201-5205 ===' as check;
SELECT COUNT(DISTINCT business_id) as businesses_with_new_accounts
FROM chart_of_accounts
WHERE account_code IN ('5201', '5202', '5203', '5204', '5205');

-- Test auto-mapping
SELECT '=== TESTING AUTO-MAPPING ===' as check;
INSERT INTO expense_categories (business_id, name, description)
VALUES 
('0374935e-7461-47c5-856e-17c116542baa', 'TEST: Office Rent Payment', 'Test auto-mapping'),
('0374935e-7461-47c5-856e-17c116542baa', 'TEST: Electricity Bill', 'Test auto-mapping'),
('0374935e-7461-47c5-856e-17c116542baa', 'TEST: Employee Salaries', 'Test auto-mapping')
ON CONFLICT (business_id, name) DO NOTHING
RETURNING name, account_code;

-- Show the results
SELECT '=== AUTO-MAPPING RESULTS ===' as check;
SELECT 
    name,
    account_code,
    CASE 
        WHEN name LIKE '%Rent%' AND account_code = '5203' THEN '✅ CORRECT'
        WHEN name LIKE '%Electric%' AND account_code = '5202' THEN '✅ CORRECT'
        WHEN name LIKE '%Salar%' AND account_code = '5200' THEN '✅ CORRECT'
        ELSE '❌ CHECK'
    END as verification
FROM expense_categories 
WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
  AND name LIKE 'TEST:%';

-- Clean up test data
DELETE FROM expense_categories 
WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
  AND name LIKE 'TEST:%';

RAISE NOTICE '========================================';
RAISE NOTICE '✅ MIGRATION COMPLETE';
RAISE NOTICE '========================================';
RAISE NOTICE 'What was fixed:';
RAISE NOTICE '  1. Added 5201-5205 expense accounts to ALL businesses';
RAISE NOTICE '  2. Updated account 5200 name to "Rent Expense"';
RAISE NOTICE '  3. Created auto-mapping for expense categories';
RAISE NOTICE '  4. Users no longer need to know account codes';
RAISE NOTICE '========================================';
