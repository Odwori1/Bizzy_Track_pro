-- Fix Withholding Tax Mappings for Uganda
BEGIN;

-- Check current SERVICES mapping (should be WHT_SERVICES, not VAT_STD)
SELECT 'Current SERVICES mapping:' as info, 
       ctm.*, 
       tt.tax_code, 
       tt.tax_name 
FROM country_product_tax_mappings ctm
JOIN tax_types tt ON ctm.tax_type_id = tt.id
WHERE ctm.country_code = 'UG' 
  AND ctm.product_category_code = 'SERVICES';

-- Delete incorrect mapping
DELETE FROM country_product_tax_mappings 
WHERE country_code = 'UG' 
  AND product_category_code = 'SERVICES'
  AND tax_type_id IN (SELECT id FROM tax_types WHERE tax_code = 'VAT_STD');

-- Add correct WHT_SERVICES mapping
INSERT INTO country_product_tax_mappings 
(country_code, product_category_code, tax_type_id, conditions, priority, is_active)
SELECT 
    'UG',
    'SERVICES',
    id,
    '{"max_amount": null, "min_amount": null, "customer_types": ["company"]}'::jsonb,
    10,
    true
FROM tax_types 
WHERE tax_code = 'WHT_SERVICES'
ON CONFLICT DO NOTHING;

-- Also add for WHT_GOODS
INSERT INTO country_product_tax_mappings 
(country_code, product_category_code, tax_type_id, conditions, priority, is_active)
SELECT 
    'UG',
    'STANDARD_GOODS',  -- Assuming goods also have WHT
    id,
    '{"max_amount": null, "min_amount": null, "customer_types": ["company"]}'::jsonb,
    5,  -- Lower priority than VAT mapping
    true
FROM tax_types 
WHERE tax_code = 'WHT_GOODS'
ON CONFLICT DO NOTHING;

-- Verify fixes
SELECT 'Updated mappings:' as info,
       ctm.product_category_code,
       tt.tax_code,
       tt.tax_name,
       ctm.priority
FROM country_product_tax_mappings ctm
JOIN tax_types tt ON ctm.tax_type_id = tt.id
WHERE ctm.country_code = 'UG'
ORDER BY ctm.product_category_code, ctm.priority;

COMMIT;
