-- Add WHT mappings with HIGHER priority than VAT for company customers
INSERT INTO country_product_tax_mappings (
    country_code, 
    product_category_code, 
    tax_type_id, 
    conditions, 
    priority
)
SELECT 
    'UG',
    'SERVICES',
    tt.id,
    '{"customer_types": ["company"], "min_amount": 1000000}'::JSONB,
    1 -- HIGHEST priority (WHT overrides VAT for services > 1M UGX to company)
FROM tax_types tt 
WHERE tt.tax_code = 'WHT_SERVICES'
ON CONFLICT (country_code, product_category_code, tax_type_id) 
DO UPDATE SET 
    priority = 1,
    conditions = '{"customer_types": ["company"], "min_amount": 1000000}'::JSONB;

-- Update existing VAT mappings to have LOWER priority
UPDATE country_product_tax_mappings 
SET priority = 10 
WHERE country_code = 'UG' 
  AND product_category_code = 'SERVICES'
  AND tax_type_id IN (SELECT id FROM tax_types WHERE tax_code = 'VAT_STD');
