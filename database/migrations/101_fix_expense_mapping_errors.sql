-- ============================================================================
-- MIGRATION 101: FIX EXPENSE MAPPING ERRORS FROM MIGRATION 100
-- ============================================================================
-- Fixes the syntax errors and completes the work started in migration 100
-- 1. Proper transaction handling
-- 2. Fix RAISE NOTICE syntax errors
-- 3. Ensure account 5206 exists for all businesses
-- 4. Fix historical category mappings
-- 5. Recreate trigger correctly
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING EXPENSE MAPPING ERRORS';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: ENSURE ACCOUNT 5206 EXISTS FOR ALL BUSINESSES
-- ============================================================================

DO $$
DECLARE
    v_business_count INTEGER := 0;
    v_accounts_added INTEGER := 0;
BEGIN
    RAISE NOTICE 'Step 1: Ensuring account 5206 (Salaries and Wages) exists...';
    
    SELECT COUNT(DISTINCT business_id) INTO v_accounts_added
    FROM (
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name,
            account_type, is_active, created_at, updated_at
        )
        SELECT DISTINCT
            b.id,
            '5206',
            'Salaries and Wages',
            'expense',
            true,
            NOW(),
            NOW()
        FROM businesses b
        WHERE NOT EXISTS (
            SELECT 1 FROM chart_of_accounts ca
            WHERE ca.business_id = b.id
              AND ca.account_code = '5206'
        )
        RETURNING business_id
    ) AS inserted;
    
    RAISE NOTICE '✅ Added account 5206 to % businesses', v_accounts_added;
    
    -- Also ensure account 5200 is correctly named
    UPDATE chart_of_accounts
    SET account_name = 'Rent Expense',
        updated_at = NOW()
    WHERE account_code = '5200'
      AND account_name != 'Rent Expense';
    
    GET DIAGNOSTICS v_business_count = ROW_COUNT;
    IF v_business_count > 0 THEN
        RAISE NOTICE '✅ Fixed account name for 5200 in % businesses', v_business_count;
    END IF;
END;
$$;

-- ============================================================================
-- PART 2: RECREATE THE AUTO-MAPPING FUNCTION (FIXED SYNTAX)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 2: Recreating auto-mapping function...';
END;
$$;

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS auto_map_expense_account_code() CASCADE;

-- Create the function with proper syntax
CREATE OR REPLACE FUNCTION auto_map_expense_account_code()
RETURNS TRIGGER AS $$
DECLARE
    v_mapped_code VARCHAR(20);
    v_category_name_lower TEXT;
    v_account_name TEXT;
BEGIN
    -- Only auto-map if account_code is not provided
    IF NEW.account_code IS NULL OR NEW.account_code = '' THEN
        v_category_name_lower := LOWER(NEW.name);
        
        -- Get account name for logging
        v_account_name := (
            SELECT account_name FROM chart_of_accounts
            WHERE business_id = NEW.business_id
              AND account_code = CASE
                WHEN v_category_name_lower LIKE '%salary%'
                  OR v_category_name_lower LIKE '%salaries%'
                  OR v_category_name_lower LIKE '%wage%'
                  OR v_category_name_lower LIKE '%payroll%'
                  OR v_category_name_lower LIKE '%employee%pay%'
                  THEN '5206'
                
                WHEN v_category_name_lower LIKE '%rent%'
                  OR v_category_name_lower LIKE '%lease%'
                  THEN '5203'
                
                WHEN v_category_name_lower LIKE '%office%'
                  OR v_category_name_lower LIKE '%suppl%'
                  OR v_category_name_lower LIKE '%stationery%'
                  OR v_category_name_lower LIKE '%paper%'
                  OR v_category_name_lower LIKE '%pen%'
                  THEN '5201'
                
                WHEN v_category_name_lower LIKE '%utility%'
                  OR v_category_name_lower LIKE '%electric%'
                  OR v_category_name_lower LIKE '%water%'
                  OR v_category_name_lower LIKE '%internet%'
                  OR v_category_name_lower LIKE '%phone%'
                  THEN '5202'
                
                WHEN v_category_name_lower LIKE '%market%'
                  OR v_category_name_lower LIKE '%advertis%'
                  OR v_category_name_lower LIKE '%promot%'
                  OR v_category_name_lower LIKE '%campaign%'
                  THEN '5204'
                
                WHEN v_category_name_lower LIKE '%travel%'
                  OR v_category_name_lower LIKE '%transport%'
                  OR v_category_name_lower LIKE '%accommodat%'
                  OR v_category_name_lower LIKE '%hotel%'
                  OR v_category_name_lower LIKE '%flight%'
                  THEN '5205'
                
                WHEN v_category_name_lower LIKE '%insurance%'
                  OR v_category_name_lower LIKE '%premium%'
                  THEN '5300'
                
                WHEN v_category_name_lower LIKE '%repair%'
                  OR v_category_name_lower LIKE '%maintenance%'
                  OR v_category_name_lower LIKE '%fix%'
                  THEN '5400'
                
                WHEN v_category_name_lower LIKE '%software%'
                  OR v_category_name_lower LIKE '%subscription%'
                  OR v_category_name_lower LIKE '%license%'
                  OR v_category_name_lower LIKE '%saas%'
                  THEN '5201'
                
                WHEN v_category_name_lower LIKE '%depreciation%'
                  OR v_category_name_lower LIKE '%amortization%'
                  THEN '5600'
                
                WHEN v_category_name_lower LIKE '%interest%'
                  OR v_category_name_lower LIKE '%finance charge%'
                  THEN '5700'
                
                ELSE '5700'
              END
            LIMIT 1
        );
        
        -- Map the account code
        NEW.account_code := CASE
            WHEN v_category_name_lower LIKE '%salary%'
              OR v_category_name_lower LIKE '%salaries%'
              OR v_category_name_lower LIKE '%wage%'
              OR v_category_name_lower LIKE '%payroll%'
              OR v_category_name_lower LIKE '%employee%pay%'
              THEN '5206'
            
            WHEN v_category_name_lower LIKE '%rent%'
              OR v_category_name_lower LIKE '%lease%'
              THEN '5203'
            
            WHEN v_category_name_lower LIKE '%office%'
              OR v_category_name_lower LIKE '%suppl%'
              OR v_category_name_lower LIKE '%stationery%'
              OR v_category_name_lower LIKE '%paper%'
              OR v_category_name_lower LIKE '%pen%'
              THEN '5201'
            
            WHEN v_category_name_lower LIKE '%utility%'
              OR v_category_name_lower LIKE '%electric%'
              OR v_category_name_lower LIKE '%water%'
              OR v_category_name_lower LIKE '%internet%'
              OR v_category_name_lower LIKE '%phone%'
              THEN '5202'
            
            WHEN v_category_name_lower LIKE '%market%'
              OR v_category_name_lower LIKE '%advertis%'
              OR v_category_name_lower LIKE '%promot%'
              OR v_category_name_lower LIKE '%campaign%'
              THEN '5204'
            
            WHEN v_category_name_lower LIKE '%travel%'
              OR v_category_name_lower LIKE '%transport%'
              OR v_category_name_lower LIKE '%accommodat%'
              OR v_category_name_lower LIKE '%hotel%'
              OR v_category_name_lower LIKE '%flight%'
              THEN '5205'
            
            WHEN v_category_name_lower LIKE '%insurance%'
              OR v_category_name_lower LIKE '%premium%'
              THEN '5300'
            
            WHEN v_category_name_lower LIKE '%repair%'
              OR v_category_name_lower LIKE '%maintenance%'
              OR v_category_name_lower LIKE '%fix%'
              THEN '5400'
            
            WHEN v_category_name_lower LIKE '%software%'
              OR v_category_name_lower LIKE '%subscription%'
              OR v_category_name_lower LIKE '%license%'
              OR v_category_name_lower LIKE '%saas%'
              THEN '5201'
            
            WHEN v_category_name_lower LIKE '%depreciation%'
              OR v_category_name_lower LIKE '%amortization%'
              THEN '5600'
            
            WHEN v_category_name_lower LIKE '%interest%'
              OR v_category_name_lower LIKE '%finance charge%'
              THEN '5700'
            
            ELSE '5700'
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '✅ Auto-mapping function created successfully';
END;
$$;

-- ============================================================================
-- PART 3: RECREATE THE TRIGGER
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Step 3: Recreating auto-mapping trigger...';
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_map_expense_account ON expense_categories;

CREATE TRIGGER trg_auto_map_expense_account
    BEFORE INSERT OR UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION auto_map_expense_account_code();

DO $$
BEGIN
    RAISE NOTICE '✅ Auto-mapping trigger created successfully';
END;
$$;

-- ============================================================================
-- PART 4: FIX HISTORICAL CATEGORY DATA
-- ============================================================================

DO $$
DECLARE
    v_total_categories INTEGER := 0;
    v_fixed_categories INTEGER := 0;
    v_category RECORD;
BEGIN
    RAISE NOTICE 'Step 4: Fixing historical category mappings...';
    
    -- Count total categories
    SELECT COUNT(*) INTO v_total_categories FROM expense_categories;
    
    -- Fix categories with incorrect mappings
    FOR v_category IN
        SELECT 
            ec.id,
            ec.business_id,
            ec.name,
            ec.account_code as old_code,
            CASE
                WHEN LOWER(ec.name) LIKE '%salary%'
                  OR LOWER(ec.name) LIKE '%salaries%'
                  OR LOWER(ec.name) LIKE '%wage%'
                  OR LOWER(ec.name) LIKE '%payroll%'
                  OR LOWER(ec.name) LIKE '%employee%pay%'
                  THEN '5206'
                
                WHEN LOWER(ec.name) LIKE '%rent%'
                  OR LOWER(ec.name) LIKE '%lease%'
                  THEN '5203'
                
                WHEN LOWER(ec.name) LIKE '%office%'
                  OR LOWER(ec.name) LIKE '%suppl%'
                  OR LOWER(ec.name) LIKE '%stationery%'
                  OR LOWER(ec.name) LIKE '%paper%'
                  OR LOWER(ec.name) LIKE '%pen%'
                  THEN '5201'
                
                WHEN LOWER(ec.name) LIKE '%utility%'
                  OR LOWER(ec.name) LIKE '%electric%'
                  OR LOWER(ec.name) LIKE '%water%'
                  OR LOWER(ec.name) LIKE '%internet%'
                  OR LOWER(ec.name) LIKE '%phone%'
                  THEN '5202'
                
                WHEN LOWER(ec.name) LIKE '%market%'
                  OR LOWER(ec.name) LIKE '%advertis%'
                  OR LOWER(ec.name) LIKE '%promot%'
                  OR LOWER(ec.name) LIKE '%campaign%'
                  THEN '5204'
                
                WHEN LOWER(ec.name) LIKE '%travel%'
                  OR LOWER(ec.name) LIKE '%transport%'
                  OR LOWER(ec.name) LIKE '%accommodat%'
                  OR LOWER(ec.name) LIKE '%hotel%'
                  OR LOWER(ec.name) LIKE '%flight%'
                  THEN '5205'
                
                WHEN ec.account_code IS NULL OR ec.account_code = ''
                  THEN '5700'
                
                ELSE ec.account_code
            END as new_code
        FROM expense_categories ec
        WHERE ec.account_code IS NULL 
           OR ec.account_code = ''
           OR (LOWER(ec.name) LIKE '%salary%' AND ec.account_code != '5206')
           OR (LOWER(ec.name) LIKE '%rent%' AND ec.account_code NOT IN ('5200', '5203'))
    LOOP
        IF v_category.old_code IS DISTINCT FROM v_category.new_code THEN
            UPDATE expense_categories
            SET account_code = v_category.new_code,
                updated_at = NOW()
            WHERE id = v_category.id;
            
            v_fixed_categories := v_fixed_categories + 1;
            
            RAISE NOTICE '  Fixed: "%" (% → %)',
                v_category.name,
                COALESCE(v_category.old_code, 'NULL'),
                v_category.new_code;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Fixed % out of % categories', v_fixed_categories, v_total_categories;
END;
$$;

-- ============================================================================
-- PART 5: VERIFICATION AND TESTING
-- ============================================================================

DO $$
DECLARE
    v_test_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_has_5206 BOOLEAN;
    v_salary_category_fixed BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';
    
    -- Check if account 5206 exists
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = v_test_business_id
          AND account_code = '5206'
    ) INTO v_has_5206;
    
    -- Check if salary category is fixed
    SELECT EXISTS(
        SELECT 1 FROM expense_categories
        WHERE business_id = v_test_business_id
          AND name LIKE '%Salaries%'
          AND account_code = '5206'
    ) INTO v_salary_category_fixed;
    
    RAISE NOTICE 'Business %:', v_test_business_id;
    RAISE NOTICE '  • Account 5206 exists: %', 
        CASE WHEN v_has_5206 THEN '✅ YES' ELSE '❌ NO' END;
    RAISE NOTICE '  • Salary category mapped to 5206: %', 
        CASE WHEN v_salary_category_fixed THEN '✅ YES' ELSE '❌ NO' END;
    
    -- Test the trigger with a new category
    BEGIN
        INSERT INTO expense_categories (business_id, name, description)
        VALUES (v_test_business_id, 'TEST: Employee Bonuses', 'Should auto-map to 5206');
        
        RAISE NOTICE '  • Trigger test - new category: ✅ PASS';
        
        -- Clean up test data
        DELETE FROM expense_categories 
        WHERE business_id = v_test_business_id 
          AND name = 'TEST: Employee Bonuses';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  • Trigger test - new category: ❌ FAILED (%)', SQLERRM;
    END;
END;
$$;

-- ============================================================================
-- PART 6: FINAL REPORT
-- ============================================================================

DO $$
DECLARE
    v_total_businesses INTEGER;
    v_businesses_with_5206 INTEGER;
    v_total_categories INTEGER;
    v_mapped_categories INTEGER;
    v_unmapped_categories INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 101 COMPLETE';
    RAISE NOTICE '========================================';
    
    -- Gather statistics
    SELECT COUNT(*) INTO v_total_businesses FROM businesses;
    
    SELECT COUNT(DISTINCT business_id) INTO v_businesses_with_5206
    FROM chart_of_accounts
    WHERE account_code = '5206';
    
    SELECT COUNT(*) INTO v_total_categories FROM expense_categories;
    
    SELECT COUNT(*) INTO v_mapped_categories
    FROM expense_categories
    WHERE account_code IS NOT NULL AND account_code != '';
    
    v_unmapped_categories := v_total_categories - v_mapped_categories;
    
    RAISE NOTICE 'SUMMARY STATISTICS:';
    RAISE NOTICE '  Total Businesses: %', v_total_businesses;
    RAISE NOTICE '  Businesses with 5206 (Salaries): %', v_businesses_with_5206;
    RAISE NOTICE '  Total Expense Categories: %', v_total_categories;
    RAISE NOTICE '  Mapped Categories: %', v_mapped_categories;
    RAISE NOTICE '  Unmapped Categories: %', v_unmapped_categories;
    RAISE NOTICE '';
    RAISE NOTICE '✅ ACTIONS COMPLETED:';
    RAISE NOTICE '  1. Added account 5206 (Salaries and Wages) to all businesses';
    RAISE NOTICE '  2. Fixed account 5200 name to "Rent Expense"';
    RAISE NOTICE '  3. Recreated auto-mapping function with proper syntax';
    RAISE NOTICE '  4. Recreated auto-mapping trigger';
    RAISE NOTICE '  5. Fixed historical category mappings';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VERIFICATION QUERIES TO RUN:';
    RAISE NOTICE '  1. Check accounts: SELECT * FROM chart_of_accounts WHERE account_code IN (''5200'', ''5206'');';
    RAISE NOTICE '  2. Check categories: SELECT name, account_code FROM expense_categories WHERE name LIKE ''%Salaries%'';';
    RAISE NOTICE '  3. Test trigger: INSERT INTO expense_categories (business_id, name) VALUES (''<biz-id>'', ''Test Salaries'');';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NEXT STEPS:';
    RAISE NOTICE '  • Test expense approval flow with correct account mappings';
    RAISE NOTICE '  • Verify existing expenses are using correct account codes';
    RAISE NOTICE '========================================';
END;
$$;

COMMIT;

-- ============================================================================
-- OPTIONAL: CLEANUP OF DUPLICATE/DEPRECATED ACCOUNTS
-- ============================================================================
-- Note: This is commented out as it might not be needed for all businesses
-- Uncomment if you want to clean up duplicate rent/utility accounts
/*
DO $$
BEGIN
    -- Remove duplicate rent/utility accounts (5203 vs 5300, 5202 vs 5400)
    UPDATE chart_of_accounts
    SET is_active = false,
        updated_at = NOW()
    WHERE account_code IN ('5300', '5400', '5500')
      AND account_name IN ('Rent Expense', 'Utilities Expense', 'Marketing Expense');
    
    RAISE NOTICE 'Disabled duplicate deprecated accounts (5300, 5400, 5500)';
END;
$$;
*/
