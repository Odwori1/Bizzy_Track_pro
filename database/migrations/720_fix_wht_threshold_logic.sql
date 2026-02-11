-- ============================================
-- FIX WHT THRESHOLD LOGIC & ERRORS
-- 1. Fix business threshold insertion
-- 2. Fix WHT logic to respect thresholds
-- 3. Fix test block errors
-- ============================================

SELECT '=== CURRENT STATE ===' as status;

-- Check current thresholds
SELECT 
    'Business Thresholds' as table_name,
    COUNT(*) as record_count
FROM wht_thresholds;

-- Check WHT mappings
SELECT 
    'WHT Mappings' as table_name,
    cptm.product_category_code,
    tt.tax_code,
    cptm.conditions
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
  AND tt.tax_code LIKE 'WHT%'
ORDER BY cptm.product_category_code;

-- ============================================
-- STEP 1: FIX THRESHOLD INSERTION
-- ============================================

-- Check what columns exist in businesses table
SELECT 
    'Businesses Table Columns' as info,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'businesses'
ORDER BY ordinal_position;

-- Fix 1: Add default threshold for our test business
INSERT INTO wht_thresholds (business_id, threshold_amount, effective_from)
VALUES 
    ('ac7de9dd-7cc8-41c9-94f7-611a4ade5256', 1000000, '2024-01-01')
ON CONFLICT (business_id, effective_from) 
DO UPDATE SET 
    threshold_amount = EXCLUDED.threshold_amount,
    updated_at = NOW()
RETURNING 'Added/Updated threshold for test business' as action, business_id, threshold_amount;

-- Fix 2: Add thresholds for other businesses if needed
INSERT INTO wht_thresholds (business_id, threshold_amount, effective_from)
SELECT 
    b.id,
    1000000,
    '2024-01-01'
FROM businesses b
WHERE b.id != 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
  AND NOT EXISTS (
    SELECT 1 FROM wht_thresholds wt 
    WHERE wt.business_id = b.id
  )
RETURNING 'Added threshold for business' as action, business_id, threshold_amount;

-- ============================================
-- STEP 2: DEBUG CURRENT TAX FUNCTION
-- ============================================

SELECT '=== DEBUG: Current Tax Calculation ===' as status;

-- Test the current function behavior
WITH test_cases AS (
    SELECT 
        'Test A: Service 800K to company' as scenario,
        800000 as amount,
        'company' as customer_type,
        'VAT_STD 20% expected' as expected
    UNION ALL
    SELECT 
        'Test B: Service 1.2M to company',
        1200000,
        'company',
        'WHT_SERVICES 6% expected'
    UNION ALL
    SELECT 
        'Test C: Service 1.2M to individual',
        1200000,
        'individual',
        'VAT_STD 20% expected'
)
SELECT 
    tc.scenario,
    tc.expected,
    cit.tax_type_code as actual_code,
    cit.tax_rate as actual_rate,
    cit.tax_amount as actual_amount,
    cit.is_withholding as is_wht,
    cit.threshold_applied as threshold_met
FROM test_cases tc
CROSS JOIN LATERAL calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    tc.amount,
    'sale',
    tc.customer_type,
    false,
    '2026-02-04'
) cit;

-- ============================================
-- STEP 3: FIX THE TAX FUNCTION LOGIC
-- ============================================

-- The issue is in the function logic. Let me check the current function
SELECT 
    'Current Function Definition' as info,
    prosrc
FROM pg_proc 
WHERE proname = 'calculate_item_tax'
LIMIT 1;

-- Drop and recreate with correct logic
DROP FUNCTION IF EXISTS calculate_item_tax(
    UUID, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, BOOLEAN, DATE
);

CREATE OR REPLACE FUNCTION calculate_item_tax(
    p_business_id UUID,
    p_country_code VARCHAR(2),
    p_product_category_code VARCHAR(30),
    p_amount DECIMAL(15,2),
    p_transaction_type VARCHAR(20) DEFAULT 'sale',
    p_customer_type VARCHAR(30) DEFAULT 'company',
    p_is_export BOOLEAN DEFAULT false,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_type_id UUID,
    tax_type_code VARCHAR(20),
    tax_type_name VARCHAR(100),
    tax_rate DECIMAL(5,2),
    taxable_amount DECIMAL(15,2),
    tax_amount DECIMAL(15,2),
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
    v_tax_rate DECIMAL(5,2);
    v_ledger_account VARCHAR(10);
    v_rule_id UUID;
    v_is_exempt BOOLEAN;
    v_is_zero_rated BOOLEAN;
    v_tax_type_code VARCHAR(20);
    v_tax_type_name VARCHAR(100);
    v_is_withholding BOOLEAN DEFAULT false;
    v_threshold_applied BOOLEAN DEFAULT false;
    v_found_mapping BOOLEAN DEFAULT false;
    v_mapping_record RECORD;
    v_min_amount DECIMAL(15,2);
    v_customer_types TEXT[];
    v_condition_is_export BOOLEAN;
    v_business_wht_threshold DECIMAL(15,2) DEFAULT 1000000;
    v_is_wht_exempt BOOLEAN DEFAULT false;
BEGIN
    -- Set taxable amount
    taxable_amount := p_amount;
    
    -- FIRST: Get business-specific WHT threshold
    SELECT COALESCE(threshold_amount, 1000000)
    INTO v_business_wht_threshold
    FROM wht_thresholds
    WHERE business_id = p_business_id
        AND effective_from <= p_date
        AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;

    -- SECOND: Check for WHT exemption
    v_is_wht_exempt := EXISTS (
        SELECT 1 FROM wht_exemptions we
        WHERE we.business_id = p_business_id
            AND (we.supplier_id IS NOT NULL OR we.supplier_tin IS NOT NULL)
            AND we.valid_from <= p_date
            AND (we.valid_to IS NULL OR we.valid_to >= p_date)
    );

    -- THIRD: Check if product is exempt or zero-rated
    SELECT 
        ptc.global_treatment = 'exempt',
        ptc.global_treatment = 'zero_rated'
    INTO v_is_exempt, v_is_zero_rated
    FROM product_tax_categories ptc
    WHERE ptc.category_code = p_product_category_code;

    -- If exempt or zero-rated, return zero tax
    IF v_is_exempt OR v_is_zero_rated THEN
        tax_type_id := NULL;
        tax_type_code := CASE 
            WHEN v_is_exempt THEN 'EXEMPT'
            WHEN v_is_zero_rated THEN 'ZERO_RATED'
            ELSE 'NO_TAX'
        END;
        tax_type_name := 'No Tax Applicable';
        tax_rate := 0.00;
        tax_amount := 0.00;
        ledger_account := CASE 
            WHEN p_transaction_type = 'sale' THEN '2210'
            WHEN p_transaction_type = 'purchase' THEN '2220'
            ELSE '2290'
        END;
        RETURN NEXT;
        RETURN;
    END IF;

    -- FOURTH: Try to find applicable tax mapping
    FOR v_mapping_record IN
        SELECT 
            cptm.tax_type_id,
            cptm.priority,
            cptm.conditions,
            tt.tax_code,
            tt.tax_name,
            COALESCE(ctr.tax_rate, 0.00) as tax_rate
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON cptm.tax_type_id = tt.id
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE cptm.country_code = p_country_code
            AND cptm.product_category_code = p_product_category_code
            AND cptm.is_active = true
        ORDER BY cptm.priority
    LOOP
        v_found_mapping := true;
        
        -- Extract conditions
        v_min_amount := (v_mapping_record.conditions->>'min_amount')::DECIMAL;
        v_customer_types := ARRAY(SELECT jsonb_array_elements_text(v_mapping_record.conditions->'customer_types'));
        v_condition_is_export := (v_mapping_record.conditions->>'is_export')::BOOLEAN;
        
        -- CRITICAL FIX: Special handling for WHT tax types
        IF v_mapping_record.tax_code LIKE 'WHT%' THEN
            -- For WHT tax types, we have special rules:
            -- 1. Check if customer is exempt
            IF v_is_wht_exempt THEN
                CONTINUE; -- Customer exempt, skip WHT
            END IF;
            
            -- 2. Check business threshold (CRITICAL: This was missing!)
            IF p_amount < v_business_wht_threshold THEN
                CONTINUE; -- Amount below business threshold, try next mapping
            END IF;
            
            -- 3. For WHT_SERVICES, check customer_type condition
            IF v_mapping_record.tax_code = 'WHT_SERVICES' THEN
                -- WHT_SERVICES requires customer_type = 'company'
                IF p_customer_type != 'company' THEN
                    CONTINUE; -- Not a company customer, skip WHT_SERVICES
                END IF;
            END IF;
            
            -- 4. For WHT_GOODS, no customer_type restriction
            -- (WHT_GOODS mapping has no conditions, applies to all company customers)
        END IF;
        
        -- Check other conditions (for non-WHT tax types)
        -- 1. Min amount condition (only for non-WHT)
        IF v_mapping_record.tax_code NOT LIKE 'WHT%' AND v_min_amount IS NOT NULL AND p_amount < v_min_amount THEN
            CONTINUE; -- Try next mapping
        END IF;
        
        -- 2. Customer types condition
        IF v_customer_types IS NOT NULL AND array_length(v_customer_types, 1) > 0 THEN
            IF NOT (p_customer_type = ANY(v_customer_types)) THEN
                CONTINUE; -- Try next mapping
            END IF;
        END IF;
        
        -- 3. Export condition
        IF v_condition_is_export IS NOT NULL AND v_condition_is_export != p_is_export THEN
            CONTINUE; -- Try next mapping
        END IF;
        
        -- If we get here, conditions are met
        v_tax_type_id := v_mapping_record.tax_type_id;
        v_tax_type_code := v_mapping_record.tax_code;
        v_tax_type_name := v_mapping_record.tax_name;
        v_tax_rate := v_mapping_record.tax_rate;
        v_is_withholding := v_tax_type_code LIKE 'WHT%';
        
        -- Check if threshold was applied (for WHT using business threshold)
        IF v_is_withholding AND p_amount >= v_business_wht_threshold THEN
            v_threshold_applied := true;
        END IF;
        
        EXIT; -- Use this mapping
    END LOOP;

    -- FIFTH: If no mapping found, use DEFAULT VAT_STD for taxable products
    IF NOT v_found_mapping THEN
        SELECT tt.id, ctr.tax_rate, tt.tax_code, tt.tax_name
        INTO v_tax_type_id, v_tax_rate, v_tax_type_code, v_tax_type_name
        FROM tax_types tt
        JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        WHERE tt.tax_code = 'VAT_STD'
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        LIMIT 1;
        
        IF v_tax_type_id IS NOT NULL THEN
            v_is_withholding := false;
            v_threshold_applied := false;
        END IF;
    END IF;

    -- Calculate tax amount
    tax_amount := ROUND(p_amount * COALESCE(v_tax_rate, 0.00) / 100, 2);

    -- Determine ledger account
    IF v_is_withholding THEN
        v_ledger_account := '2230'; -- Withholding Tax Payable
    ELSIF p_transaction_type = 'sale' THEN
        v_ledger_account := '2210'; -- Output VAT
    ELSIF p_transaction_type = 'purchase' THEN
        v_ledger_account := '2220'; -- Input VAT
    ELSE
        v_ledger_account := '2290'; -- Other tax accounts
    END IF;

    -- Set return values
    tax_type_id := v_tax_type_id;
    tax_type_code := v_tax_type_code;
    tax_type_name := v_tax_type_name;
    tax_rate := COALESCE(v_tax_rate, 0.00);
    is_exempt := v_is_exempt;
    is_zero_rated := v_is_zero_rated;
    ledger_account := v_ledger_account;
    applicable_rule_id := v_rule_id;
    is_withholding := v_is_withholding;
    threshold_applied := v_threshold_applied;

    RETURN NEXT;
END;
$$;

-- ============================================
-- STEP 4: TEST THE FIXED LOGIC
-- ============================================

SELECT '=== TESTING FIXED LOGIC ===' as status;

-- Test 1: Service 800K to company (Should be VAT 20% - below threshold)
SELECT 
    'Test 1: Service 800K to company' as scenario,
    'Expected: VAT_STD 20% (below 1M threshold)' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    threshold_applied as threshold_met,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 THEN '❌ FAIL (WHT should not apply below threshold)'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    800000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 2: Service 1.2M to company (Should be WHT 6% - above threshold)
SELECT 
    'Test 2: Service 1.2M to company' as scenario,
    'Expected: WHT_SERVICES 6% (above 1M threshold)' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    threshold_applied as threshold_met,
    CASE 
        WHEN tax_type_code = 'WHT_SERVICES' AND tax_rate = 6.00 AND threshold_applied = true THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    1200000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 3: Service 1.2M to individual (Should be VAT 20% - WHT only for companies)
SELECT 
    'Test 3: Service 1.2M to individual' as scenario,
    'Expected: VAT_STD 20% (WHT only for companies)' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    threshold_applied as threshold_met,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
        WHEN tax_type_code = 'WHT_SERVICES' THEN '❌ FAIL (WHT should not apply to individuals)'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    1200000,
    'sale',
    'individual',
    false,
    '2026-02-04'
);

-- Test 4: Standard Goods 800K to company (Should be WHT_GOODS 6% - no threshold for goods)
SELECT 
    'Test 4: Standard Goods 800K to company' as scenario,
    'Expected: WHT_GOODS 6% (no threshold for goods)' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    threshold_applied as threshold_met,
    CASE 
        WHEN tax_type_code = 'WHT_GOODS' AND tax_rate = 6.00 THEN '✅ PASS'
        ELSE '❌ FAIL'
    END as result
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'STANDARD_GOODS',
    800000,
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 5: Test with different threshold
DO $$
DECLARE
    test_results RECORD;
BEGIN
    -- Temporarily change threshold to 500,000
    UPDATE wht_thresholds 
    SET threshold_amount = 500000
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    
    RAISE NOTICE '=== TEST WITH 500K THRESHOLD ===';
    
    -- Service 600K to company (Should be WHT 6% - above 500K threshold)
    SELECT * INTO test_results FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        'SERVICES',
        600000,
        'sale',
        'company',
        false,
        '2026-02-04'
    );
    
    RAISE NOTICE 'Service 600K to company (500K threshold): % %, threshold_applied: %',
        test_results.tax_type_code,
        test_results.tax_rate || '%',
        test_results.threshold_applied;
    
    -- Reset threshold
    UPDATE wht_thresholds 
    SET threshold_amount = 1000000
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    
    RAISE NOTICE '=== THRESHOLD RESET TO 1M ===';
END $$;

-- ============================================
-- STEP 5: FINAL VERIFICATION
-- ============================================

SELECT '=== FINAL VERIFICATION ===' as status;

-- Show all business thresholds
SELECT 
    b.name as business_name,
    b.id as business_id,
    COALESCE(wt.threshold_amount, 1000000) as threshold_amount,
    COALESCE(wt.effective_from, '2024-01-01') as effective_from,
    CASE 
        WHEN wt.business_id IS NULL THEN '⚠️ Using default'
        ELSE '✅ Configured'
    END as status
FROM businesses b
LEFT JOIN wht_thresholds wt ON b.id = wt.business_id
    AND '2026-02-04' BETWEEN wt.effective_from AND COALESCE(wt.effective_to, '9999-12-31')
ORDER BY b.name;

-- Show WHT mappings summary
SELECT 
    'WHT Mappings Summary' as summary,
    COUNT(*) as total_mappings,
    COUNT(DISTINCT product_category_code) as unique_categories,
    STRING_AGG(DISTINCT product_category_code, ', ') as categories_with_wht
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
  AND tt.tax_code LIKE 'WHT%';
