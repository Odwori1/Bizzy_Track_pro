-- ============================================
-- COMPLETE VAT FIXES
-- 1. Fix default VAT rate flag
-- 2. Add VAT_STD mapping for SERVICES
-- ============================================

SELECT '=== CURRENT STATE BEFORE FIX ===' as status;

-- 1. Check VAT rates
SELECT '1. Current VAT Rates:' as check_point;
SELECT 
    tt.tax_code,
    ctr.tax_rate,
    ctr.effective_from,
    ctr.effective_to,
    ctr.is_default,
    CASE 
        WHEN '2026-02-04' BETWEEN ctr.effective_from AND COALESCE(ctr.effective_to, '9999-12-31')
        THEN '✅ APPLIES TO TEST DATE'
        ELSE '❌ DOES NOT APPLY'
    END as applies_to_test
FROM tax_types tt
JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
WHERE tt.tax_code = 'VAT_STD'
  AND ctr.country_code = 'UG'
ORDER BY ctr.effective_from DESC;

-- 2. Check SERVICE mappings
SELECT '2. Current SERVICE Mappings:' as check_point;
SELECT 
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

-- ============================================
-- FIX 1: UPDATE VAT RATE DEFAULT FLAGS
-- ============================================

-- Set the CURRENT rate (2024-07-01 to 2026-06-30) as default
UPDATE country_tax_rates
SET is_default = true
WHERE id IN (
    SELECT ctr.id
    FROM country_tax_rates ctr
    JOIN tax_types tt ON ctr.tax_type_id = tt.id
    WHERE ctr.country_code = 'UG'
      AND tt.tax_code = 'VAT_STD'
      AND '2026-02-04' BETWEEN ctr.effective_from AND COALESCE(ctr.effective_to, '9999-12-31')
    ORDER BY ctr.effective_from DESC
    LIMIT 1
);

-- Remove default flag from future rate
UPDATE country_tax_rates
SET is_default = false
WHERE id IN (
    SELECT ctr.id
    FROM country_tax_rates ctr
    JOIN tax_types tt ON ctr.tax_type_id = tt.id
    WHERE ctr.country_code = 'UG'
      AND tt.tax_code = 'VAT_STD'
      AND ctr.effective_from > '2026-02-04'
);

-- ============================================
-- FIX 2: ADD VAT_STD MAPPING FOR SERVICES
-- ============================================

-- First, get the VAT_STD tax type ID
DO $$
DECLARE
    v_vat_tax_type_id UUID;
BEGIN
    -- Get VAT_STD tax type ID
    SELECT id INTO v_vat_tax_type_id
    FROM tax_types
    WHERE tax_code = 'VAT_STD';
    
    -- Add VAT_STD mapping for SERVICES (fallback when WHT doesn't apply)
    INSERT INTO country_product_tax_mappings (
        country_code,
        product_category_code,
        tax_type_id,
        priority,
        is_active,
        created_at,
        updated_at
    )
    SELECT 
        'UG',
        'SERVICES',
        v_vat_tax_type_id,
        10, -- Lower priority than WHT_SERVICES (1)
        true,
        NOW(),
        NOW()
    WHERE NOT EXISTS (
        SELECT 1 FROM country_product_tax_mappings cptm
        WHERE cptm.country_code = 'UG'
          AND cptm.product_category_code = 'SERVICES'
          AND cptm.tax_type_id = v_vat_tax_type_id
    );
    
    RAISE NOTICE 'Added VAT_STD mapping for SERVICES category';
END $$;

-- ============================================
-- VERIFY FIXES
-- ============================================

SELECT '=== AFTER FIXES ===' as status;

-- 1. Verify VAT rates
SELECT '1. Fixed VAT Rates:' as check_point;
SELECT 
    tt.tax_code,
    ctr.tax_rate,
    ctr.effective_from,
    ctr.effective_to,
    ctr.is_default,
    CASE 
        WHEN '2026-02-04' BETWEEN ctr.effective_from AND COALESCE(ctr.effective_to, '9999-12-31')
        THEN '✅ APPLIES TO TEST DATE'
        ELSE '❌ DOES NOT APPLY'
    END as applies_to_test,
    CASE 
        WHEN ctr.is_default = true AND '2026-02-04' BETWEEN ctr.effective_from AND COALESCE(ctr.effective_to, '9999-12-31')
        THEN '✅ CORRECT DEFAULT'
        ELSE '⚠️ CHECK DEFAULT'
    END as default_check
FROM tax_types tt
JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
WHERE tt.tax_code = 'VAT_STD'
  AND ctr.country_code = 'UG'
ORDER BY ctr.effective_from DESC;

-- 2. Verify SERVICE mappings
SELECT '2. Fixed SERVICE Mappings:' as check_point;
SELECT 
    cptm.product_category_code,
    tt.tax_code,
    tt.tax_name,
    cptm.priority,
    CASE 
        WHEN cptm.priority = 1 THEN '🔥 PRIMARY (WHT)'
        WHEN cptm.priority = 10 THEN '⏬ FALLBACK (VAT)'
        ELSE '⚡ OTHER'
    END as priority_note,
    cptm.conditions
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
  AND cptm.product_category_code = 'SERVICES'
ORDER BY cptm.priority;

-- ============================================
-- COMPREHENSIVE TESTING
-- ============================================

SELECT '=== COMPREHENSIVE TAX TESTS ===' as status;

-- Test 1: Service 500K to company (Should be VAT 20%)
SELECT 
    'Test 1: Service 500K to company' as scenario,
    'Expected: VAT_STD 20%' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    500000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 2: Service 1.5M to individual (Should be VAT 20%)
SELECT 
    'Test 2: Service 1.5M to individual' as scenario,
    'Expected: VAT_STD 20%' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    1500000,
    'sale',
    'individual',
    false,
    '2026-02-04'
);

-- Test 3: Service 1.5M to company (Should be WHT 6%)
SELECT 
    'Test 3: Service 1.5M to company' as scenario,
    'Expected: WHT_SERVICES 6%' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    threshold_applied as threshold_met,
    CASE 
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    1500000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 4: Standard Goods 1.5M to company (Should be WHT_GOODS 6%)
SELECT 
    'Test 4: Standard Goods 1.5M to company' as scenario,
    'Expected: WHT_GOODS 6%' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    CASE 
        WHEN tax_type_code = 'WHT_GOODS' AND tax_rate = 6.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'STANDARD_GOODS',
    1500000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 5: Essential Goods 1.5M to company (Should be 0% zero-rated)
SELECT 
    'Test 5: Essential Goods 1.5M to company' as scenario,
    'Expected: ZERO_RATED 0%' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_zero_rated as is_zero,
    CASE 
        WHEN (tax_type_code = 'ZERO_RATED' OR tax_rate = 0.00) AND is_zero_rated = true THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'ESSENTIAL_GOODS',
    1500000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test all categories summary
SELECT '=== ALL CATEGORIES SUMMARY ===' as status;

SELECT 
    pc.category_code,
    (SELECT tax_type_code FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1000000,  -- 1M UGX
        'sale',
        'company',
        false,
        '2026-02-04'
    )) as tax_code_company,
    (SELECT tax_rate FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1000000,
        'sale',
        'company',
        false,
        '2026-02-04'
    )) as tax_rate_company,
    (SELECT tax_type_code FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1000000,
        'sale',
        'individual',
        false,
        '2026-02-04'
    )) as tax_code_individual,
    (SELECT tax_rate FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1000000,
        'sale',
        'individual',
        false,
        '2026-02-04'
    )) as tax_rate_individual
FROM product_tax_categories pc
ORDER BY pc.category_code;
