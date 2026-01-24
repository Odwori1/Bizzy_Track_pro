-- ============================================
-- CLEAN FIX: ASSET REGISTER DIVISION BY ZERO
-- Minimal, focused fix for the reported bug
-- ============================================

-- First, let's check what we're working with
SELECT 
    asset_code,
    asset_name,
    purchase_cost,
    salvage_value,
    purchase_cost - salvage_value as depreciable_base,
    useful_life_months
FROM assets 
WHERE purchase_cost - salvage_value = 0 
  AND is_active = true;

-- Fix the problematic asset data
UPDATE assets
SET salvage_value = 0  -- Land should have 0 salvage value
WHERE asset_code = 'sys-0098'
  AND purchase_cost - salvage_value = 0
  AND category = 'land';

-- Now recreate the asset_register view with the fix
DROP VIEW IF EXISTS asset_register CASCADE;

CREATE OR REPLACE VIEW asset_register AS
SELECT
    a.id,
    a.business_id,
    a.asset_code,
    a.asset_name,
    a.asset_type,
    a.category,
    a.purchase_date,
    a.purchase_cost,
    a.salvage_value,
    a.useful_life_months,
    a.depreciation_method,
    a.depreciation_rate,
    a.current_book_value,
    a.accumulated_depreciation,
    a.serial_number,
    a.model,
    a.manufacturer,
    a.location,
    d.name AS department_name,
    a.status,
    a.is_active,
    a.created_at,
    a.updated_at,
    (a.purchase_cost - a.salvage_value) AS depreciable_cost,
    
    -- Monthly depreciation calculation
    CASE
        WHEN a.useful_life_months > 0 AND (a.purchase_cost - a.salvage_value) > 0
        THEN ((a.purchase_cost - a.salvage_value) / a.useful_life_months::numeric)
        ELSE 0
    END AS monthly_depreciation,
    
    -- ✅ FIXED: Percent depreciated calculation
    CASE
        WHEN a.useful_life_months > 0 
        AND (a.purchase_cost - a.salvage_value) > 0  -- THIS PREVENTS DIVISION BY ZERO
        THEN ((a.accumulated_depreciation / (a.purchase_cost - a.salvage_value)) * 100)
        ELSE 0
    END AS percent_depreciated,
    
    -- Months since purchase
    CASE
        WHEN a.purchase_date IS NOT NULL
        THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.purchase_date)) * 12 +
             EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.purchase_date))
        ELSE 0
    END AS months_since_purchase
    
FROM assets a
LEFT JOIN departments d ON a.department_id = d.id
WHERE a.is_active = true;

-- Recreate enhanced_asset_register view (since we used CASCADE)
CREATE OR REPLACE VIEW enhanced_asset_register AS
SELECT
    a.id,
    a.business_id,
    a.asset_code,
    a.asset_name,
    a.asset_type,
    a.category,
    a.acquisition_date,
    a.acquisition_method,
    a.is_existing_asset,
    a.purchase_date,
    a.purchase_cost,
    a.initial_book_value,
    a.existing_accumulated_depreciation,
    a.salvage_value,
    a.useful_life_months,
    a.depreciation_method,
    a.current_book_value,
    a.accumulated_depreciation,
    a.depreciation_start_date,
    a.historical_depreciation_calculated,
    a.serial_number,
    a.model,
    a.manufacturer,
    a.location,
    d.name AS department_name,
    a.status,
    a.is_active,
    a.created_at,
    a.updated_at,
    CASE
        WHEN a.is_existing_asset THEN 'Existing Asset'
        WHEN a.acquisition_method = 'purchase' THEN 'New Purchase'
        ELSE INITCAP(a.acquisition_method)
    END AS acquisition_type,
    (a.purchase_cost - a.salvage_value) AS depreciable_cost,
    CASE
        WHEN (a.useful_life_months > 0)
        THEN ((a.purchase_cost - a.salvage_value) / (a.useful_life_months)::numeric)
        ELSE (0)::numeric
    END AS monthly_depreciation,
    CASE
        WHEN ((a.useful_life_months > 0) AND ((a.purchase_cost - a.salvage_value) > (0)::numeric))
        THEN ((a.accumulated_depreciation / (a.purchase_cost - a.salvage_value)) * (100)::numeric)
        ELSE (0)::numeric
    END AS percent_depreciated,
    ((EXTRACT(year FROM age((CURRENT_DATE)::timestamp with time zone, (a.acquisition_date)::timestamp with time zone)) * (12)::numeric) + EXTRACT(month FROM age((CURRENT_DATE)::timestamp with time zone, (a.acquisition_date)::timestamp with time zone))) AS months_since_acquisition,
    a.current_book_value AS net_book_value
FROM assets a
LEFT JOIN departments d ON a.department_id = d.id
WHERE a.is_active = true;

-- Test the fix
DO $$
DECLARE
    problem_asset_count INTEGER;
    view_asset_count INTEGER;
    division_error_count INTEGER;
BEGIN
    -- Check problematic assets
    SELECT COUNT(*) INTO problem_asset_count
    FROM assets 
    WHERE purchase_cost - salvage_value = 0 
      AND is_active = true;
    
    -- Count assets in view
    SELECT COUNT(*) INTO view_asset_count 
    FROM asset_register;
    
    -- Check for division errors in the view
    SELECT COUNT(*) INTO division_error_count
    FROM asset_register
    WHERE monthly_depreciation < 0 
       OR percent_depreciated < 0 
       OR percent_depreciated > 100
       OR monthly_depreciation IS NULL
       OR percent_depreciated IS NULL;
    
    RAISE NOTICE '============================================';
    RAISE NOTICE 'FIX VERIFICATION RESULTS:';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Problematic assets (zero depreciable base): %', problem_asset_count;
    RAISE NOTICE 'Assets in register view: %', view_asset_count;
    RAISE NOTICE 'Calculation errors in view: %', division_error_count;
    
    -- Test specific problematic asset
    IF EXISTS (
        SELECT 1 FROM asset_register 
        WHERE asset_code = 'sys-0098' 
          AND percent_depreciated = 0
    ) THEN
        RAISE NOTICE 'Asset sys-0098: ✅ FIXED (percent_depreciated = 0)';
    ELSE
        RAISE NOTICE 'Asset sys-0098: ⚠️  Check needed';
    END IF;
    
    IF division_error_count = 0 AND problem_asset_count = 0 THEN
        RAISE NOTICE '✅ FIX SUCCESSFUL';
        RAISE NOTICE '   Division by zero error has been resolved.';
        RAISE NOTICE '   API endpoint /api/assets/reports/register should now work.';
    ELSE
        RAISE NOTICE '⚠️  Some issues remain:';
        RAISE NOTICE '   Check the counts above.';
    END IF;
    
    RAISE NOTICE '============================================';
END $$;

-- Final test: Try to select from the view
SELECT 'Final test - first 5 assets:' as test;
SELECT 
    asset_code, 
    asset_name,
    purchase_cost,
    salvage_value,
    monthly_depreciation,
    percent_depreciated
FROM asset_register 
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
LIMIT 5;
