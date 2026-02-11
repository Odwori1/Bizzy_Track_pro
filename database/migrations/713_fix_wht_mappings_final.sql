-- First, check what mappings exist for Uganda
SELECT 
    'Current Uganda Mappings' as info,
    cptm.product_category_code,
    tt.tax_code,
    cptm.priority,
    cptm.conditions
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
ORDER BY cptm.product_category_code, cptm.priority;

-- Check if WHT_SERVICES tax type exists for Uganda
SELECT 
    'WHT Tax Type Check' as info,
    tt.id as tax_type_id,
    tt.tax_code,
    tt.tax_name,
    ctr.tax_rate,
    ctr.effective_from
FROM tax_types tt
LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id 
    AND ctr.country_code = 'UG'
    AND ctr.is_default = true
WHERE tt.tax_code = 'WHT_SERVICES';

-- Add WHT mapping for SERVICES with HIGH priority (1)
-- Only if it doesn't already exist
INSERT INTO country_product_tax_mappings (
    country_code, 
    product_category_code, 
    tax_type_id, 
    conditions, 
    priority,
    is_active
)
SELECT 
    'UG',
    'SERVICES',
    tt.id,
    '{"customer_types": ["company"], "min_amount": 1000000}'::JSONB,
    1, -- HIGHEST priority (WHT overrides VAT)
    true
FROM tax_types tt 
WHERE tt.tax_code = 'WHT_SERVICES'
AND NOT EXISTS (
    SELECT 1 FROM country_product_tax_mappings cptm
    WHERE cptm.country_code = 'UG'
      AND cptm.product_category_code = 'SERVICES'
      AND cptm.tax_type_id = tt.id
)
RETURNING 'Added WHT mapping' as action, id;

-- Update existing VAT mapping for SERVICES to have LOWER priority (10)
-- This ensures WHT (priority 1) takes precedence over VAT (priority 10)
UPDATE country_product_tax_mappings cptm
SET priority = 10
FROM tax_types tt
WHERE cptm.tax_type_id = tt.id
  AND cptm.country_code = 'UG'
  AND cptm.product_category_code = 'SERVICES'
  AND tt.tax_code = 'VAT_STD'
RETURNING 'Updated VAT priority' as action, id, priority;

-- Verify the changes
SELECT 
    'Final Uganda SERVICE Mappings' as info,
    cptm.product_category_code,
    tt.tax_code,
    tt.tax_name,
    cptm.priority,
    cptm.conditions
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
  AND cptm.product_category_code = 'SERVICES'
ORDER BY cptm.priority;

-- Check all Uganda mappings for reference
SELECT 
    'All Uganda Mappings' as info,
    cptm.product_category_code,
    tt.tax_code,
    cptm.priority,
    CASE 
        WHEN cptm.conditions IS NULL THEN '{}'
        ELSE cptm.conditions::text
    END as conditions
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
ORDER BY cptm.product_category_code, cptm.priority;
