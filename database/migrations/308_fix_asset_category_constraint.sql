-- Migration 308: Fix asset category constraint
-- Date: 2026-01-12
-- Purpose: Fix the category check constraint to include all valid categories

BEGIN;

-- First, drop ALL existing category constraints
ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_category_check;

ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_category_check1;

ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_category_check2;

-- Now add the correct constraint with ALL valid categories
ALTER TABLE assets 
ADD CONSTRAINT assets_category_check 
CHECK (category IN (
    'land', 
    'building', 
    'vehicle', 
    'equipment', 
    'furniture', 
    'computer', 
    'software', 
    'other', 
    'electronics'  -- Added for compatibility
));

-- Also update the enhanced_asset_register view to handle the category mapping
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
    d.name as department_name,
    a.status,
    a.is_active,
    a.created_at,
    a.updated_at,
    -- Calculated fields
    CASE
        WHEN a.is_existing_asset THEN 'Existing Asset'
        WHEN a.acquisition_method = 'purchase' THEN 'New Purchase'
        ELSE INITCAP(a.acquisition_method)
    END as acquisition_type,
    (a.purchase_cost - a.salvage_value) as depreciable_cost,
    CASE
        WHEN a.useful_life_months > 0
        THEN (a.purchase_cost - a.salvage_value) / a.useful_life_months
        ELSE 0
    END as monthly_depreciation,
    CASE
        WHEN a.useful_life_months > 0 AND (a.purchase_cost - a.salvage_value) > 0
        THEN (a.accumulated_depreciation / (a.purchase_cost - a.salvage_value)) * 100
        ELSE 0
    END as percent_depreciated,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.acquisition_date)) * 12
    + EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.acquisition_date)) as months_since_acquisition,
    -- Net book value calculation
    a.current_book_value as net_book_value
FROM assets a
LEFT JOIN departments d ON a.department_id = d.id
WHERE a.is_active = true;

COMMIT;
