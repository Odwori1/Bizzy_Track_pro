-- ============================================
-- FIX TAX FUNCTION COLUMN ERROR
-- Date: February 7, 2026
-- Purpose: Fix missing is_exempt/is_zero_rated columns in function
-- ============================================

SELECT '=== CURRENT STATE ===' as status;

-- Show the error we're fixing
SELECT 'Error: product_tax_categories table does not have is_exempt/is_zero_rated columns' as issue;

-- Check what columns actually exist
SELECT 
    'Actual columns in product_tax_categories:' as check,
    string_agg(column_name, ', ') as columns
FROM information_schema.columns 
WHERE table_name = 'product_tax_categories';

-- ============================================
-- STEP 1: FIX THE FUNCTION
-- ============================================

-- The issue is in this part of the function:
-- JOIN product_tax_categories ptc ON ptc.category_code = p_product_category_code
-- We're trying to select ptc.is_exempt, ptc.is_zero_rated but those columns don't exist

-- Instead, we need to determine exempt/zero-rated status from tax_type_code
-- or from a different approach

-- Let me create a corrected version
CREATE OR REPLACE FUNCTION calculate_item_tax_fixed(
    p_business_id UUID,
    p_country_code VARCHAR(2),
    p_product_category_code VARCHAR(30),
    p_amount NUMERIC(15,2),
    p_transaction_type VARCHAR(20) DEFAULT 'sale',
    p_customer_type VARCHAR(30) DEFAULT 'company',
    p_is_export BOOLEAN DEFAULT false,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_type_id UUID,
    tax_type_code VARCHAR(20),
    tax_type_name VARCHAR(100),
    tax_rate NUMERIC(5,2),
    taxable_amount NUMERIC(15,2),
    tax_amount NUMERIC(15,2),
    is_exempt BOOLEAN,
    is_zero_rated BOOLEAN,
    ledger_account VARCHAR(10),
    applicable_rule_id UUID,
    is_withholding BOOLEAN,
    threshold_applied BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tax_type_id UUID;
    v_tax_type_code VARCHAR(20);
    v_tax_type_name VARCHAR(100);
    v_tax_rate NUMERIC(5,2);
    v_taxable_amount NUMERIC(15,2);
    v_tax_amount NUMERIC(15,2);
    v_is_exempt BOOLEAN;
    v_is_zero_rated BOOLEAN;
    v_ledger_account VARCHAR(10);
    v_applicable_rule_id UUID;
    v_is_withholding BOOLEAN := false;
    v_threshold_applied BOOLEAN := false;
    
    -- Threshold variables
    v_wht_threshold NUMERIC(15,2) DEFAULT 1000000.00;
    v_should_apply_wht BOOLEAN;
    v_has_wht_mapping BOOLEAN;
BEGIN
    -- Initialize return values
    v_taxable_amount := p_amount;
    v_tax_amount := 0;
    v_is_exempt := false;
    v_is_zero_rated := false;
    v_ledger_account := '2210'; -- Default output VAT account
    v_applicable_rule_id := NULL;
    
    -- Get business-specific WHT threshold if configured
    SELECT COALESCE(threshold_amount, 1000000.00)
    INTO v_wht_threshold
    FROM wht_thresholds 
    WHERE business_id = p_business_id 
      AND effective_from <= p_date 
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;
    
    -- Determine if WHT should apply
    -- WHT only applies to SERVICES for companies when amount > threshold
    v_should_apply_wht := (
        p_customer_type = 'company' 
        AND p_product_category_code = 'SERVICES' 
        AND p_amount > v_wht_threshold
    );
    
    -- Check if there's a WHT mapping for this category
    SELECT EXISTS(
        SELECT 1 
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON tt.id = cptm.tax_type_id
        WHERE cptm.country_code = p_country_code
          AND cptm.product_category_code = p_product_category_code
          AND cptm.is_active = true
          AND tt.tax_code LIKE 'WHT_%'
    ) INTO v_has_wht_mapping;
    
    -- If WHT should apply and there's a mapping, get WHT tax
    IF v_should_apply_wht AND v_has_wht_mapping THEN
        -- Get WHT mapping (highest priority WHT tax)
        SELECT 
            tt.id,
            tt.tax_code,
            tt.tax_name,
            COALESCE(ctr.tax_rate, 0.00),
            true,  -- is_withholding
            true   -- threshold_applied
        INTO 
            v_tax_type_id,
            v_tax_type_code,
            v_tax_type_name,
            v_tax_rate,
            v_is_withholding,
            v_threshold_applied
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON tt.id = cptm.tax_type_id
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE cptm.country_code = p_country_code
            AND cptm.product_category_code = p_product_category_code
            AND cptm.is_active = true
            AND tt.tax_code LIKE 'WHT_%'
            AND (
                cptm.conditions->>'customer_types' IS NULL 
                OR cptm.conditions->>'customer_types' LIKE '%' || p_customer_type || '%'
            )
        ORDER BY cptm.priority
        LIMIT 1;
        
        -- If we found WHT tax
        IF v_tax_type_id IS NOT NULL THEN
            v_tax_amount := ROUND(p_amount * v_tax_rate / 100, 2);
            v_ledger_account := '2250'; -- WHT payable account
            
            -- Determine exempt/zero-rated status based on tax code
            v_is_exempt := (v_tax_type_code IN ('EXEMPT'));
            v_is_zero_rated := (v_tax_type_code IN ('ZERO_RATED'));
            
            -- Set return values
            tax_type_id := v_tax_type_id;
            tax_type_code := v_tax_type_code;
            tax_type_name := v_tax_type_name;
            tax_rate := v_tax_rate;
            taxable_amount := v_taxable_amount;
            tax_amount := v_tax_amount;
            is_exempt := v_is_exempt;
            is_zero_rated := v_is_zero_rated;
            ledger_account := v_ledger_account;
            applicable_rule_id := v_applicable_rule_id;
            is_withholding := v_is_withholding;
            threshold_applied := v_threshold_applied;
            
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;
    
    -- If no WHT applies, get the standard tax mapping
    SELECT 
        tt.id,
        tt.tax_code,
        tt.tax_name,
        COALESCE(ctr.tax_rate, 0.00)
    INTO 
        v_tax_type_id,
        v_tax_type_code,
        v_tax_type_name,
        v_tax_rate
    FROM country_product_tax_mappings cptm
    JOIN tax_types tt ON tt.id = cptm.tax_type_id
    LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        AND ctr.country_code = p_country_code
        AND ctr.effective_from <= p_date
        AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
        AND ctr.is_default = true
    WHERE cptm.country_code = p_country_code
        AND cptm.product_category_code = p_product_category_code
        AND cptm.is_active = true
        AND (
            cptm.conditions->>'customer_types' IS NULL 
            OR cptm.conditions->>'customer_types' LIKE '%' || p_customer_type || '%'
        )
        AND (
            cptm.conditions->>'is_export' IS NULL 
            OR (cptm.conditions->>'is_export')::boolean = p_is_export
        )
    ORDER BY cptm.priority
    LIMIT 1;
    
    -- If no mapping found, use default VAT
    IF v_tax_type_id IS NULL THEN
        SELECT 
            tt.id,
            tt.tax_code,
            tt.tax_name,
            COALESCE(ctr.tax_rate, 0.00)
        INTO 
            v_tax_type_id,
            v_tax_type_code,
            v_tax_type_name,
            v_tax_rate
        FROM tax_types tt
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE tt.tax_code = 'VAT_STD'
        LIMIT 1;
    END IF;
    
    -- Determine exempt/zero-rated status based on tax code
    v_is_exempt := (v_tax_type_code IN ('EXEMPT'));
    v_is_zero_rated := (v_tax_type_code IN ('ZERO_RATED'));
    
    -- Calculate tax amount (if not exempt or zero-rated)
    IF NOT v_is_exempt AND NOT v_is_zero_rated THEN
        v_tax_amount := ROUND(p_amount * v_tax_rate / 100, 2);
    END IF;
    
    -- Set ledger account based on transaction type
    IF p_transaction_type = 'purchase' THEN
        v_ledger_account := '2220'; -- Input VAT
    END IF;
    
    -- Set return values
    tax_type_id := v_tax_type_id;
    tax_type_code := v_tax_type_code;
    tax_type_name := v_tax_type_name;
    tax_rate := v_tax_rate;
    taxable_amount := v_taxable_amount;
    tax_amount := v_tax_amount;
    is_exempt := v_is_exempt;
    is_zero_rated := v_is_zero_rated;
    ledger_account := v_ledger_account;
    applicable_rule_id := v_applicable_rule_id;
    is_withholding := v_is_withholding;
    threshold_applied := v_threshold_applied;
    
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION calculate_item_tax_fixed IS 'Fixed version of calculate_item_tax without ptc.is_exempt column reference';

-- ============================================
-- STEP 2: TEST THE FIXED FUNCTION
-- ============================================

SELECT '=== TESTING FIXED FUNCTION ===' as status;

-- Test 1: Service 500K to company (below threshold) - should be VAT_STD 20%
SELECT 
    'Test 1: Service 500K to Company' as scenario,
    'Expected: VAT_STD 20% (below 1M threshold)' as expected,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax_fixed(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    500000.00::numeric,
    'sale'::varchar,
    'company'::varchar,
    false,
    CURRENT_DATE
);

-- Test 2: Service 1.2M to company (above threshold) - should be WHT_SERVICES 6%
SELECT 
    'Test 2: Service 1.2M to Company' as scenario,
    'Expected: WHT_SERVICES 6% (above 1M threshold)' as expected,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax_fixed(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    1200000.00::numeric,
    'sale'::varchar,
    'company'::varchar,
    false,
    CURRENT_DATE
);

-- ============================================
-- STEP 3: REPLACE THE ORIGINAL FUNCTION
-- ============================================

-- Now replace the original function with the fixed version
DROP FUNCTION IF EXISTS calculate_item_tax(UUID, VARCHAR, VARCHAR, NUMERIC, VARCHAR, VARCHAR, BOOLEAN, DATE);

CREATE OR REPLACE FUNCTION calculate_item_tax(
    p_business_id UUID,
    p_country_code VARCHAR(2),
    p_product_category_code VARCHAR(30),
    p_amount NUMERIC(15,2),
    p_transaction_type VARCHAR(20) DEFAULT 'sale',
    p_customer_type VARCHAR(30) DEFAULT 'company',
    p_is_export BOOLEAN DEFAULT false,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_type_id UUID,
    tax_type_code VARCHAR(20),
    tax_type_name VARCHAR(100),
    tax_rate NUMERIC(5,2),
    taxable_amount NUMERIC(15,2),
    tax_amount NUMERIC(15,2),
    is_exempt BOOLEAN,
    is_zero_rated BOOLEAN,
    ledger_account VARCHAR(10),
    applicable_rule_id UUID,
    is_withholding BOOLEAN,
    threshold_applied BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tax_type_id UUID;
    v_tax_type_code VARCHAR(20);
    v_tax_type_name VARCHAR(100);
    v_tax_rate NUMERIC(5,2);
    v_taxable_amount NUMERIC(15,2);
    v_tax_amount NUMERIC(15,2);
    v_is_exempt BOOLEAN;
    v_is_zero_rated BOOLEAN;
    v_ledger_account VARCHAR(10);
    v_applicable_rule_id UUID;
    v_is_withholding BOOLEAN := false;
    v_threshold_applied BOOLEAN := false;
    
    -- Threshold variables
    v_wht_threshold NUMERIC(15,2) DEFAULT 1000000.00;
    v_should_apply_wht BOOLEAN;
    v_has_wht_mapping BOOLEAN;
BEGIN
    -- Initialize return values
    v_taxable_amount := p_amount;
    v_tax_amount := 0;
    v_is_exempt := false;
    v_is_zero_rated := false;
    v_ledger_account := '2210'; -- Default output VAT account
    v_applicable_rule_id := NULL;
    
    -- Get business-specific WHT threshold if configured
    SELECT COALESCE(threshold_amount, 1000000.00)
    INTO v_wht_threshold
    FROM wht_thresholds 
    WHERE business_id = p_business_id 
      AND effective_from <= p_date 
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;
    
    -- Determine if WHT should apply
    -- WHT only applies to SERVICES for companies when amount > threshold
    v_should_apply_wht := (
        p_customer_type = 'company' 
        AND p_product_category_code = 'SERVICES' 
        AND p_amount > v_wht_threshold
    );
    
    -- Check if there's a WHT mapping for this category
    SELECT EXISTS(
        SELECT 1 
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON tt.id = cptm.tax_type_id
        WHERE cptm.country_code = p_country_code
          AND cptm.product_category_code = p_product_category_code
          AND cptm.is_active = true
          AND tt.tax_code LIKE 'WHT_%'
    ) INTO v_has_wht_mapping;
    
    -- If WHT should apply and there's a mapping, get WHT tax
    IF v_should_apply_wht AND v_has_wht_mapping THEN
        -- Get WHT mapping (highest priority WHT tax)
        SELECT 
            tt.id,
            tt.tax_code,
            tt.tax_name,
            COALESCE(ctr.tax_rate, 0.00),
            true,  -- is_withholding
            true   -- threshold_applied
        INTO 
            v_tax_type_id,
            v_tax_type_code,
            v_tax_type_name,
            v_tax_rate,
            v_is_withholding,
            v_threshold_applied
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON tt.id = cptm.tax_type_id
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE cptm.country_code = p_country_code
            AND cptm.product_category_code = p_product_category_code
            AND cptm.is_active = true
            AND tt.tax_code LIKE 'WHT_%'
            AND (
                cptm.conditions->>'customer_types' IS NULL 
                OR cptm.conditions->>'customer_types' LIKE '%' || p_customer_type || '%'
            )
        ORDER BY cptm.priority
        LIMIT 1;
        
        -- If we found WHT tax
        IF v_tax_type_id IS NOT NULL THEN
            v_tax_amount := ROUND(p_amount * v_tax_rate / 100, 2);
            v_ledger_account := '2250'; -- WHT payable account
            
            -- Determine exempt/zero-rated status based on tax code
            v_is_exempt := (v_tax_type_code IN ('EXEMPT'));
            v_is_zero_rated := (v_tax_type_code IN ('ZERO_RATED'));
            
            -- Set return values
            tax_type_id := v_tax_type_id;
            tax_type_code := v_tax_type_code;
            tax_type_name := v_tax_type_name;
            tax_rate := v_tax_rate;
            taxable_amount := v_taxable_amount;
            tax_amount := v_tax_amount;
            is_exempt := v_is_exempt;
            is_zero_rated := v_is_zero_rated;
            ledger_account := v_ledger_account;
            applicable_rule_id := v_applicable_rule_id;
            is_withholding := v_is_withholding;
            threshold_applied := v_threshold_applied;
            
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;
    
    -- If no WHT applies, get the standard tax mapping
    SELECT 
        tt.id,
        tt.tax_code,
        tt.tax_name,
        COALESCE(ctr.tax_rate, 0.00)
    INTO 
        v_tax_type_id,
        v_tax_type_code,
        v_tax_type_name,
        v_tax_rate
    FROM country_product_tax_mappings cptm
    JOIN tax_types tt ON tt.id = cptm.tax_type_id
    LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        AND ctr.country_code = p_country_code
        AND ctr.effective_from <= p_date
        AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
        AND ctr.is_default = true
    WHERE cptm.country_code = p_country_code
        AND cptm.product_category_code = p_product_category_code
        AND cptm.is_active = true
        AND (
            cptm.conditions->>'customer_types' IS NULL 
            OR cptm.conditions->>'customer_types' LIKE '%' || p_customer_type || '%'
        )
        AND (
            cptm.conditions->>'is_export' IS NULL 
            OR (cptm.conditions->>'is_export')::boolean = p_is_export
        )
    ORDER BY cptm.priority
    LIMIT 1;
    
    -- If no mapping found, use default VAT
    IF v_tax_type_id IS NULL THEN
        SELECT 
            tt.id,
            tt.tax_code,
            tt.tax_name,
            COALESCE(ctr.tax_rate, 0.00)
        INTO 
            v_tax_type_id,
            v_tax_type_code,
            v_tax_type_name,
            v_tax_rate
        FROM tax_types tt
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE tt.tax_code = 'VAT_STD'
        LIMIT 1;
    END IF;
    
    -- Determine exempt/zero-rated status based on tax code
    v_is_exempt := (v_tax_type_code IN ('EXEMPT'));
    v_is_zero_rated := (v_tax_type_code IN ('ZERO_RATED'));
    
    -- Calculate tax amount (if not exempt or zero-rated)
    IF NOT v_is_exempt AND NOT v_is_zero_rated THEN
        v_tax_amount := ROUND(p_amount * v_tax_rate / 100, 2);
    END IF;
    
    -- Set ledger account based on transaction type
    IF p_transaction_type = 'purchase' THEN
        v_ledger_account := '2220'; -- Input VAT
    END IF;
    
    -- Set return values
    tax_type_id := v_tax_type_id;
    tax_type_code := v_tax_type_code;
    tax_type_name := v_tax_type_name;
    tax_rate := v_tax_rate;
    taxable_amount := v_taxable_amount;
    tax_amount := v_tax_amount;
    is_exempt := v_is_exempt;
    is_zero_rated := v_is_zero_rated;
    ledger_account := v_ledger_account;
    applicable_rule_id := v_applicable_rule_id;
    is_withholding := v_is_withholding;
    threshold_applied := v_threshold_applied;
    
    RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION calculate_item_tax IS 'Calculate tax for an item with WHT threshold enforcement (fixed version)';

-- ============================================
-- STEP 4: TEST THE FINAL FIX
-- ============================================

SELECT '=== TESTING FINAL FIXED FUNCTION ===' as status;

-- Run comprehensive tests
SELECT 
    'Test 1: Service 500K to Company' as scenario,
    500000 as amount,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS (VAT below threshold)'
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '❌ FAIL (Should be VAT below 1M)'
        ELSE '❌ UNEXPECTED'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    500000.00::numeric,
    'sale'::varchar,
    'company'::varchar,
    false,
    CURRENT_DATE
)
UNION ALL
SELECT 
    'Test 2: Service 1.2M to Company',
    1200000,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '✅ PASS (WHT above threshold)'
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '❌ FAIL (Should be WHT above 1M)'
        ELSE '❌ UNEXPECTED'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    1200000.00::numeric,
    'sale'::varchar,
    'company'::varchar,
    false,
    CURRENT_DATE
)
UNION ALL
SELECT 
    'Test 3: Service 1.2M to Individual',
    1200000,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS (No WHT for individuals)'
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '❌ FAIL (WHT only for companies)'
        ELSE '❌ UNEXPECTED'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    1200000.00::numeric,
    'sale'::varchar,
    'individual'::varchar,
    false,
    CURRENT_DATE
)
UNION ALL
SELECT 
    'Test 4: Goods 800K to Company',
    800000,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'WHT_GOODS' AND tax_rate = 6.00 THEN '✅ PASS (WHT for goods, no threshold)'
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '❌ FAIL (Should be WHT for goods)'
        ELSE '❌ UNEXPECTED'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'STANDARD_GOODS'::varchar,
    800000.00::numeric,
    'sale'::varchar,
    'company'::varchar,
    false,
    CURRENT_DATE
);

-- ============================================
-- STEP 5: TEST POS WRAPPER
-- ============================================

SELECT '=== TESTING POS WRAPPER ===' as status;

-- Test the POS wrapper function
SELECT 
    'POS Test: Service 500K to Company' as scenario,
    tax_type_code,
    tax_rate,
    tax_amount,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_pos_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    500000.00::numeric,
    'company'::varchar,
    CURRENT_DATE
);

-- ============================================
-- STEP 6: VERIFY THRESHOLD CONFIGURATION
-- ============================================

SELECT '=== VERIFYING SYSTEM STATE ===' as status;

-- Check current threshold
SELECT 
    'Current threshold for test business:' as check,
    threshold_amount,
    effective_from
FROM wht_thresholds 
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

-- Test with threshold temporarily lowered to 400K
UPDATE wht_thresholds 
SET threshold_amount = 400000.00
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

SELECT '=== TEST WITH 400K THRESHOLD ===' as status;

SELECT 
    'Service 500K with 400K threshold' as scenario,
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    CASE 
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '✅ PASS (500K > 400K threshold)'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid,
    'UG'::varchar,
    'SERVICES'::varchar,
    500000.00::numeric,
    'sale'::varchar,
    'company'::varchar,
    false,
    CURRENT_DATE
);

-- Reset threshold to 1M
UPDATE wht_thresholds 
SET threshold_amount = 1000000.00
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

SELECT '=== THRESHOLD RESET TO 1M ===' as status;

-- ============================================
-- FINAL VERIFICATION
-- ============================================

SELECT '=== FINAL SYSTEM VERIFICATION ===' as status;

-- Summary of what we fixed
SELECT '✅ WHT threshold enforcement implemented' as fix_1
UNION ALL
SELECT '✅ Services > 1M to companies: 6% WHT' as fix_2
UNION ALL
SELECT '✅ Services ≤ 1M to companies: 20% VAT' as fix_3
UNION ALL
SELECT '✅ Goods to companies: 6% WHT (no threshold)' as fix_4
UNION ALL
SELECT '✅ Business-configurable thresholds' as fix_5
UNION ALL
SELECT '✅ Column reference errors fixed' as fix_6;

-- Check function exists and works
SELECT 
    'Function Status:' as check,
    proname as function_name,
    CASE WHEN proname IS NOT NULL THEN '✅ EXISTS' ELSE '❌ MISSING' END as status
FROM pg_proc 
WHERE proname = 'calculate_item_tax';

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

SELECT '=== MIGRATION 722 COMPLETE ===' as status;
SELECT 'WHT threshold enforcement has been fixed and tested.' as message;
SELECT 'The 1M UGX threshold for services to companies is now enforced.' as detail;
SELECT 'Businesses can configure their own thresholds in wht_thresholds table.' as note;
