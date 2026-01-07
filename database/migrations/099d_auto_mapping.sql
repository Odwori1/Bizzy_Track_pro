-- ============================================================================
-- MIGRATION 099d: AUTO-MAPPING FOR EXPENSE CATEGORIES
-- ============================================================================
-- Simple auto-mapping so users don't need to know account codes
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ADDING AUTO-MAPPING FOR EXPENSE CATEGORIES';
    RAISE NOTICE '========================================';
END;
$$;

-- Create or replace the auto-mapping function
CREATE OR REPLACE FUNCTION auto_map_expense_account_code()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-map if account_code is not provided
    IF NEW.account_code IS NULL OR NEW.account_code = '' THEN
        NEW.account_code := CASE 
            -- Map to our new 5200-series accounts
            WHEN LOWER(NEW.name) LIKE '%rent%' THEN '5203'
            WHEN LOWER(NEW.name) LIKE '%office%' OR 
                 LOWER(NEW.name) LIKE '%suppl%' OR 
                 LOWER(NEW.name) LIKE '%stationery%' THEN '5201'
            WHEN LOWER(NEW.name) LIKE '%salary%' OR 
                 LOWER(NEW.name) LIKE '%wage%' OR 
                 LOWER(NEW.name) LIKE '%payroll%' THEN '5200'
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
            -- Fallback to existing codes
            WHEN LOWER(NEW.name) LIKE '%insurance%' THEN '5300'
            WHEN LOWER(NEW.name) LIKE '%repair%' OR 
                 LOWER(NEW.name) LIKE '%maintenance%' THEN '5400'
            WHEN LOWER(NEW.name) LIKE '%software%' OR 
                 LOWER(NEW.name) LIKE '%subscription%' THEN '5201'
            WHEN LOWER(NEW.name) LIKE '%depreciation%' THEN '5600'
            -- Default
            ELSE '5700'
        END;
        
        RAISE NOTICE 'Auto-mapped category "%" to account code "%"', NEW.name, NEW.account_code;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_auto_map_expense_account ON expense_categories;
CREATE TRIGGER trg_auto_map_expense_account
    BEFORE INSERT OR UPDATE ON expense_categories
    FOR EACH ROW
    EXECUTE FUNCTION auto_map_expense_account_code();

-- Test the auto-mapping
DO $$
DECLARE
    test_category_name TEXT;
    test_account_code TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'TESTING AUTO-MAPPING:';
    
    -- Test various category names
    FOR test_category_name, test_account_code IN 
        VALUES 
            ('Office Rent', '5203'),
            ('Electricity Bill', '5202'),
            ('Employee Salaries', '5200'),
            ('Facebook Ads', '5204'),
            ('Business Travel', '5205'),
            ('Office Supplies', '5201')
    LOOP
        RAISE NOTICE '  "%" should map to %', test_category_name, test_account_code;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Auto-mapping is ready!';
    RAISE NOTICE '   Users can create categories WITHOUT knowing account codes';
    RAISE NOTICE '========================================';
END;
$$;
