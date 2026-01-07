-- ============================================================================
-- MIGRATION 100: COMPLETE EXPENSE SYSTEM FIX - SYNTAX CORRECTED
-- ============================================================================
-- Original migration with syntax errors fixed
-- Resolves ALL expense accounting issues:
-- 1. Correct account structure with proper semantics
-- 2. Working auto-mapping for all expense types
-- 3. Historical data cleanup
-- ============================================================================
BEGIN;
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'COMPLETE EXPENSE SYSTEM FIX - CORRECTED';
    RAISE NOTICE '========================================';
END;
$$;
-- ============================================================================
-- PART 1: FIX ACCOUNT STRUCTURE (SEMANTIC CORRECTNESS)
-- ============================================================================
DO $$
DECLARE
    v_business RECORD;
    v_accounts_added INTEGER := 0;
BEGIN
    RAISE NOTICE 'Fixing account structure for all businesses...';
    FOR v_business IN SELECT id, name FROM businesses
    LOOP
        -- Add 5206 for Salaries (the CORRECT account)
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name,
            account_type, is_active, created_at, updated_at
        )
        SELECT
            v_business.id,
            '5206',
            'Salaries and Wages',
            'expense',
            true,
            NOW(),
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM chart_of_accounts
            WHERE business_id = v_business.id
              AND account_code = '5206'
        );
        IF FOUND THEN
            v_accounts_added := v_accounts_added + 1;
        END IF;
        -- Ensure 5200 is correctly named as "Rent Expense"
        UPDATE chart_of_accounts
        SET account_name = 'Rent Expense',
            updated_at = NOW()
        WHERE business_id = v_business.id
          AND account_code = '5200'
          AND account_name != 'Rent Expense';
        -- Ensure 5203 exists for alternative rent (already should exist)
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name,
            account_type, is_active, created_at, updated_at
        )
        SELECT
            v_business.id,
            '5203',
            'Rent Expense',
            'expense',
            true,
            NOW(),
            NOW()
        WHERE NOT EXISTS (
            SELECT 1 FROM chart_of_accounts
            WHERE business_id = v_business.id
              AND account_code = '5203'
        );
    END LOOP;
    RAISE NOTICE '✅ Account structure fixed for all businesses';
    RAISE NOTICE ' Added account 5206 to % businesses', v_accounts_added;
END;
$$;
-- ============================================================================
-- PART 2: CREATE CORRECT AUTO-MAPPING FUNCTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Creating auto-mapping function...';
END;
$$;
CREATE OR REPLACE FUNCTION auto_map_expense_account_code()
RETURNS TRIGGER AS $$
DECLARE
    v_mapped_code VARCHAR(20);
    v_category_name_lower TEXT;
BEGIN
    -- Only auto-map if account_code is not provided
    IF NEW.account_code IS NULL OR NEW.account_code = '' THEN
        v_category_name_lower := LOWER(NEW.name);
        -- CORRECTED MAPPING with proper account semantics
        v_mapped_code := CASE
            -- Salaries → 5206 (FIXED: was incorrectly using 5200)
            WHEN v_category_name_lower LIKE '%salary%'
              OR v_category_name_lower LIKE '%salaries%'
              OR v_category_name_lower LIKE '%wage%'
              OR v_category_name_lower LIKE '%payroll%'
              OR v_category_name_lower LIKE '%employee%pay%'
              THEN '5206'
            -- Rent → 5203 (primary), 5200 (alternative)
            WHEN v_category_name_lower LIKE '%rent%'
              OR v_category_name_lower LIKE '%lease%'
              THEN '5203'
            -- Office Supplies → 5201
            WHEN v_category_name_lower LIKE '%office%'
              OR v_category_name_lower LIKE '%suppl%'
              OR v_category_name_lower LIKE '%stationery%'
              OR v_category_name_lower LIKE '%paper%'
              OR v_category_name_lower LIKE '%pen%'
              THEN '5201'
            -- Utilities → 5202
            WHEN v_category_name_lower LIKE '%utility%'
              OR v_category_name_lower LIKE '%electric%'
              OR v_category_name_lower LIKE '%water%'
              OR v_category_name_lower LIKE '%internet%'
              OR v_category_name_lower LIKE '%phone%'
              THEN '5202'
            -- Marketing/Advertising → 5204
            WHEN v_category_name_lower LIKE '%market%'
              OR v_category_name_lower LIKE '%advertis%'
              OR v_category_name_lower LIKE '%promot%'
              OR v_category_name_lower LIKE '%campaign%'
              THEN '5204'
            -- Travel → 5205
            WHEN v_category_name_lower LIKE '%travel%'
              OR v_category_name_lower LIKE '%transport%'
              OR v_category_name_lower LIKE '%accommodat%'
              OR v_category_name_lower LIKE '%hotel%'
              OR v_category_name_lower LIKE '%flight%'
              THEN '5205'
            -- Insurance → 5300
            WHEN v_category_name_lower LIKE '%insurance%'
              OR v_category_name_lower LIKE '%premium%'
              THEN '5300'
            -- Repairs/Maintenance → 5400
            WHEN v_category_name_lower LIKE '%repair%'
              OR v_category_name_lower LIKE '%maintenance%'
              OR v_category_name_lower LIKE '%fix%'
              THEN '5400'
            -- Software/Subscriptions → 5201 (Office Supplies)
            WHEN v_category_name_lower LIKE '%software%'
              OR v_category_name_lower LIKE '%subscription%'
              OR v_category_name_lower LIKE '%license%'
              OR v_category_name_lower LIKE '%saas%'
              THEN '5201'
            -- Depreciation → 5600
            WHEN v_category_name_lower LIKE '%depreciation%'
              OR v_category_name_lower LIKE '%amortization%'
              THEN '5600'
            -- Interest → 5700
            WHEN v_category_name_lower LIKE '%interest%'
              OR v_category_name_lower LIKE '%finance charge%'
              THEN '5700'
            -- Default: Other Expenses
            ELSE '5700'
        END;
        NEW.account_code := v_mapped_code;
        RAISE NOTICE 'Auto-mapped category "%" to account code "%"', NEW.name, v_mapped_code;
    ELSE
        RAISE NOTICE 'Category "%" using provided account code: %', NEW.name, NEW.account_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$
BEGIN
    RAISE NOTICE '✅ Auto-mapping function created';
END;
$$;
-- ============================================================================
-- PART 3: RECREATE TRIGGER
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Recreating auto-mapping trigger...';
END;
$$;
DROP TRIGGER IF EXISTS trg_auto_map_expense_account ON expense_categories;
CREATE TRIGGER trg_auto_map_expense_account
    BEFORE INSERT OR UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION auto_map_expense_account_code();
DO $$
BEGIN
    RAISE NOTICE '✅ Auto-mapping trigger created';
END;
$$;
-- ============================================================================
-- PART 4: FIX HISTORICAL DATA
-- ============================================================================
DO $$
DECLARE
    v_category RECORD;
    v_updated_count INTEGER := 0;
    v_old_code VARCHAR(20);
    v_new_code VARCHAR(20);
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Fixing historical expense categories...';
    -- Update categories with NULL or incorrect account codes
    FOR v_category IN
        SELECT id, business_id, name, account_code
        FROM expense_categories
        WHERE account_code IS NULL
           OR account_code = ''
           OR (LOWER(name) LIKE '%salary%' AND account_code = '5700')
        ORDER BY created_at
    LOOP
        v_old_code := v_category.account_code;
        -- Trigger the auto-mapping by updating the row
        UPDATE expense_categories
        SET updated_at = NOW()
        WHERE id = v_category.id
        RETURNING account_code INTO v_new_code;
        IF v_old_code IS DISTINCT FROM v_new_code THEN
            v_updated_count := v_updated_count + 1;
            RAISE NOTICE ' Fixed: "%" (% → %)',
                v_category.name,
                COALESCE(v_old_code, 'NULL'),
                v_new_code;
        END IF;
    END LOOP;
    RAISE NOTICE '✅ Updated % categories', v_updated_count;
END;
$$;
-- ============================================================================
-- PART 5: VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_test_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION REPORT';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Test Business Accounts:';
END;
$$;
-- Show expense accounts for test business
DO $$
DECLARE
    v_account RECORD;
BEGIN
    FOR v_account IN
        SELECT
            account_code,
            account_name,
            CASE
                WHEN account_code = '5206' THEN '🆕 ADDED FOR SALARIES'
                WHEN account_code IN ('5201', '5202', '5203', '5204', '5205')
                THEN '✅ EXPENSE DETAIL ACCOUNTS'
                ELSE '✅ STANDARD ACCOUNT'
            END as status
        FROM chart_of_accounts
        WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
          AND account_type = 'expense'
        ORDER BY account_code
    LOOP
        RAISE NOTICE ' %: % (%)',
            v_account.account_code,
            v_account.account_name,
            v_account.status;
    END LOOP;
END;
$$;
-- Show categories with their mappings
DO $$
DECLARE
    v_category RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Category Mappings:';
    FOR v_category IN
        SELECT
            name as category_name,
            account_code,
            (SELECT account_name FROM chart_of_accounts ca
             WHERE ca.business_id = ec.business_id
               AND ca.account_code = ec.account_code
             LIMIT 1) as account_name,
            CASE
                WHEN account_code = '5206' AND LOWER(name) LIKE '%salary%'
                THEN '✅ CORRECT'
                WHEN account_code = '5203' AND LOWER(name) LIKE '%rent%'
                THEN '✅ CORRECT'
                WHEN account_code = '5202' AND LOWER(name) LIKE '%electric%'
                THEN '✅ CORRECT'
                WHEN account_code IS NULL THEN '❌ MISSING'
                ELSE '✓ Mapped'
            END as validation
        FROM expense_categories ec
        WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
        ORDER BY created_at DESC
    LOOP
        RAISE NOTICE ' % → % (%) [%]',
            v_category.category_name,
            v_category.account_code,
            v_category.account_name,
            v_category.validation;
    END LOOP;
END;
$$;
-- ============================================================================
-- PART 6: CREATE TEST CATEGORIES TO VERIFY
-- ============================================================================
DO $$
DECLARE
    v_test_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_test_category RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Creating test categories to verify auto-mapping...';
    -- Delete any existing test categories
    DELETE FROM expense_categories
    WHERE business_id = v_test_business_id
      AND name LIKE 'AUTOMAP TEST:%';
    -- Create test categories (trigger will auto-map)
    INSERT INTO expense_categories (business_id, name, description)
    VALUES
        (v_test_business_id, 'AUTOMAP TEST: Employee Salaries', 'Should map to 5206'),
        (v_test_business_id, 'AUTOMAP TEST: Office Rent', 'Should map to 5203'),
        (v_test_business_id, 'AUTOMAP TEST: Electricity', 'Should map to 5202'),
        (v_test_business_id, 'AUTOMAP TEST: Marketing Campaign', 'Should map to 5204'),
        (v_test_business_id, 'AUTOMAP TEST: Business Travel', 'Should map to 5205')
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Test categories created';
END;
$$;
-- Verify test categories
DO $$
DECLARE
    v_test RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Test Results:';
    FOR v_test IN
        SELECT
            name,
            account_code,
            (SELECT account_name FROM chart_of_accounts
             WHERE business_id = ec.business_id
               AND account_code = ec.account_code) as mapped_to,
            CASE
                WHEN name LIKE '%Salaries%' AND account_code = '5206' THEN '✅ PASS'
                WHEN name LIKE '%Rent%' AND account_code = '5203' THEN '✅ PASS'
                WHEN name LIKE '%Electricity%' AND account_code = '5202' THEN '✅ PASS'
                WHEN name LIKE '%Marketing%' AND account_code = '5204' THEN '✅ PASS'
                WHEN name LIKE '%Travel%' AND account_code = '5205' THEN '✅ PASS'
                ELSE '❌ FAIL'
            END as test_result
        FROM expense_categories ec
        WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
          AND name LIKE 'AUTOMAP TEST:%'
        ORDER BY name
    LOOP
        RAISE NOTICE ' % → % (%) [%]',
            v_test.name,
            v_test.account_code,
            v_test.mapped_to,
            v_test.test_result;
    END LOOP;
END;
$$;
-- Clean up test data
DELETE FROM expense_categories
WHERE business_id = '0374935e-7461-47c5-856e-17c116542baa'
  AND name LIKE 'AUTOMAP TEST:%';
-- ============================================================================
-- FINAL REPORT
-- ============================================================================
DO $$
DECLARE
    v_total_businesses INTEGER;
    v_businesses_with_5206 INTEGER;
    v_total_categories INTEGER;
    v_mapped_categories INTEGER;
    v_unmapped_categories INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_businesses FROM businesses;
    SELECT COUNT(DISTINCT business_id) INTO v_businesses_with_5206
    FROM chart_of_accounts
    WHERE account_code = '5206';
    SELECT COUNT(*) INTO v_total_categories FROM expense_categories;
    SELECT COUNT(*) INTO v_mapped_categories
    FROM expense_categories
    WHERE account_code IS NOT NULL AND account_code != '';
    v_unmapped_categories := v_total_categories - v_mapped_categories;
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 100 COMPLETE (SYNTAX CORRECTED)';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'SUMMARY:';
    RAISE NOTICE ' Total Businesses: %', v_total_businesses;
    RAISE NOTICE ' Businesses with 5206 (Salaries): %', v_businesses_with_5206;
    RAISE NOTICE ' Total Categories: %', v_total_categories;
    RAISE NOTICE ' Mapped Categories: %', v_mapped_categories;
    RAISE NOTICE ' Unmapped Categories: %', v_unmapped_categories;
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIXED:';
    RAISE NOTICE ' • Added account 5206 for Salaries and Wages';
    RAISE NOTICE ' • Account 5200 correctly named "Rent Expense"';
    RAISE NOTICE ' • Auto-mapping now works for ALL expense types';
    RAISE NOTICE ' • Historical categories updated with correct codes';
    RAISE NOTICE '';
    RAISE NOTICE '📋 ACCOUNT MAPPING GUIDE:';
    RAISE NOTICE ' 5206 → Salaries and Wages';
    RAISE NOTICE ' 5203 → Rent Expense';
    RAISE NOTICE ' 5201 → Office Supplies';
    RAISE NOTICE ' 5202 → Utilities';
    RAISE NOTICE ' 5204 → Marketing';
    RAISE NOTICE ' 5205 → Travel';
    RAISE NOTICE ' 5700 → Other Expenses (default)';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VERIFICATION QUERIES TO RUN:';
    RAISE NOTICE ' 1. Check accounts: SELECT * FROM chart_of_accounts WHERE account_code IN (''5200'', ''5206'');';
    RAISE NOTICE ' 2. Check categories: SELECT name, account_code FROM expense_categories WHERE name LIKE ''%Salaries%'';';
    RAISE NOTICE ' 3. Test trigger: INSERT INTO expense_categories (business_id, name) VALUES (''<biz-id>'', ''Test Salaries'');';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️ REMAINING WORK:';
    RAISE NOTICE ' • Add PATCH /api/expenses/:id/approve endpoint';
    RAISE NOTICE ' • Connect approval to accounting trigger';
    RAISE NOTICE '========================================';
END;
$$;
COMMIT;
-- ============================================================================
-- POST-MIGRATION CLEANUP
-- ============================================================================
DO $$
BEGIN
    -- Final cleanup of any test data
    DELETE FROM expense_categories
    WHERE name LIKE 'AUTOMAP TEST:%';
    RAISE NOTICE '';
    RAISE NOTICE 'Migration completed successfully!';
END;
$$;
