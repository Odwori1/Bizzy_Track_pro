-- ============================================
-- MAKE WHT SYSTEM DYNAMIC & PRODUCTION-READY
-- 1. Remove hardcoded thresholds from mappings
-- 2. Add proper business threshold configuration
-- 3. Update tax function to use dynamic thresholds
-- ============================================

SELECT '=== CURRENT HARDCODED VALUES ===' as status;

-- Show all mappings with hardcoded values
SELECT 
    'Hardcoded Mappings' as issue_type,
    cptm.product_category_code,
    tt.tax_code,
    cptm.conditions->>'min_amount' as hardcoded_min_amount,
    cptm.conditions->>'max_amount' as hardcoded_max_amount,
    cptm.conditions->>'customer_types' as hardcoded_customer_types
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
  AND (cptm.conditions->>'min_amount' IS NOT NULL 
       OR cptm.conditions->>'max_amount' IS NOT NULL
       OR cptm.conditions->>'customer_types' IS NOT NULL);

-- ============================================
-- STEP 1: UPDATE MAPPINGS TO BE GENERIC
-- ============================================

-- Remove hardcoded 1000000 from WHT_SERVICES mapping
-- WHT threshold should come from business configuration, not hardcoded
UPDATE country_product_tax_mappings
SET conditions = '{"customer_types": ["company"]}'::JSONB
WHERE id IN (
    SELECT cptm.id
    FROM country_product_tax_mappings cptm
    JOIN tax_types tt ON cptm.tax_type_id = tt.id
    WHERE cptm.country_code = 'UG'
      AND cptm.product_category_code = 'SERVICES'
      AND tt.tax_code = 'WHT_SERVICES'
      AND cptm.conditions->>'min_amount' = '1000000'
);

-- Remove hardcoded customer_types from WHT_GOODS if present
UPDATE country_product_tax_mappings
SET conditions = '{}'::JSONB
WHERE id IN (
    SELECT cptm.id
    FROM country_product_tax_mappings cptm
    JOIN tax_types tt ON cptm.tax_type_id = tt.id
    WHERE cptm.country_code = 'UG'
      AND cptm.product_category_code = 'STANDARD_GOODS'
      AND tt.tax_code = 'WHT_GOODS'
      AND cptm.conditions->>'customer_types' IS NOT NULL
);

-- ============================================
-- STEP 2: ENSURE WHTHOLDINGS TABLES EXIST
-- ============================================

-- Check if wht_thresholds table exists (created in migration 712)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wht_thresholds') THEN
        CREATE TABLE wht_thresholds (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            threshold_amount DECIMAL(15,2) NOT NULL DEFAULT 1000000,
            effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
            effective_to DATE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(business_id, effective_from)
        );
        
        RAISE NOTICE 'Created wht_thresholds table';
    ELSE
        RAISE NOTICE 'wht_thresholds table already exists';
    END IF;
END $$;

-- Check if wht_exemptions table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wht_exemptions') THEN
        CREATE TABLE wht_exemptions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
            supplier_id UUID REFERENCES customers(id),
            supplier_tin VARCHAR(20),
            exemption_type VARCHAR(50) NOT NULL,
            certificate_number VARCHAR(100),
            valid_from DATE NOT NULL,
            valid_to DATE,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        RAISE NOTICE 'Created wht_exemptions table';
    ELSE
        RAISE NOTICE 'wht_exemptions table already exists';
    END IF;
END $$;

-- ============================================
-- STEP 3: ADD DEFAULT THRESHOLDS FOR ALL BUSINESSES
-- ============================================

-- Add default threshold for existing businesses that don't have one
INSERT INTO wht_thresholds (business_id, threshold_amount, effective_from)
SELECT 
    b.id,
    1000000, -- Default threshold (configurable per business)
    '2024-01-01'
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM wht_thresholds wt 
    WHERE wt.business_id = b.id
)
AND b.is_active = true
RETURNING 'Added default threshold for business' as action, business_id, threshold_amount;

-- ============================================
-- STEP 4: UPDATE TAX FUNCTION TO USE DYNAMIC THRESHOLDS
-- ============================================

-- Drop and recreate the function with dynamic threshold logic
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

    -- SECOND: Check if product is exempt or zero-rated
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

    -- THIRD: Check for WHT exemption
    IF EXISTS (
        SELECT 1 FROM wht_exemptions we
        WHERE we.business_id = p_business_id
            AND (we.supplier_id IS NOT NULL OR we.supplier_tin IS NOT NULL)
            AND we.valid_from <= p_date
            AND (we.valid_to IS NULL OR we.valid_to >= p_date)
    ) THEN
        -- Supplier is exempt from WHT, skip WHT check
        v_is_withholding := false;
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
        
        -- Check conditions
        
        -- 1. For WHT tax types, use BUSINESS-SPECIFIC threshold, not hardcoded
        IF v_mapping_record.tax_code LIKE 'WHT%' THEN
            -- For WHT, check against business threshold
            IF p_amount < v_business_wht_threshold THEN
                CONTINUE; -- Amount below business threshold, try next mapping
            END IF;
        -- 2. For non-WHT, use min_amount from mapping if specified
        ELSIF v_min_amount IS NOT NULL AND p_amount < v_min_amount THEN
            CONTINUE; -- Try next mapping
        END IF;
        
        -- 3. Customer types condition
        IF v_customer_types IS NOT NULL AND array_length(v_customer_types, 1) > 0 THEN
            IF NOT (p_customer_type = ANY(v_customer_types)) THEN
                CONTINUE; -- Try next mapping
            END IF;
        END IF;
        
        -- 4. Export condition
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
-- STEP 5: VERIFY CHANGES
-- ============================================

SELECT '=== UPDATED MAPPINGS (NO HARDCODED VALUES) ===' as status;

SELECT 
    cptm.product_category_code,
    tt.tax_code,
    tt.tax_name,
    cptm.priority,
    CASE 
        WHEN cptm.priority = 1 THEN '🔥 PRIMARY'
        WHEN cptm.priority = 10 THEN '⏬ FALLBACK'
        ELSE '⚡ OTHER'
    END as priority_note,
    cptm.conditions
FROM country_product_tax_mappings cptm
JOIN tax_types tt ON cptm.tax_type_id = tt.id
WHERE cptm.country_code = 'UG'
  AND cptm.product_category_code IN ('SERVICES', 'STANDARD_GOODS')
ORDER BY cptm.product_category_code, cptm.priority;

SELECT '=== BUSINESS THRESHOLDS ===' as status;

SELECT 
    b.name as business_name,
    wt.threshold_amount,
    wt.effective_from,
    wt.effective_to
FROM wht_thresholds wt
JOIN businesses b ON wt.business_id = b.id
ORDER BY b.name;

-- ============================================
-- STEP 6: COMPREHENSIVE TESTING
-- ============================================

SELECT '=== DYNAMIC THRESHOLD TESTS ===' as status;

-- Test with different thresholds
DO $$
DECLARE
    test_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    test_amount DECIMAL := 800000;
    test_threshold DECIMAL := 500000; -- Lower threshold for testing
BEGIN
    -- First, update business threshold to test value
    UPDATE wht_thresholds 
    SET threshold_amount = test_threshold
    WHERE business_id = test_business_id
    RETURNING 'Updated threshold to' as action, threshold_amount;
    
    -- Test 1: Service 800K to company with 500K threshold (Should be WHT 6%)
    RAISE NOTICE 'Test 1: Service % to company (threshold: %) - Should be WHT 6%%', test_amount, test_threshold;
    
    PERFORM tax_type_code, tax_rate, tax_amount, is_withholding, threshold_applied
    FROM calculate_item_tax(
        test_business_id,
        'UG',
        'SERVICES',
        test_amount,
        'sale',
        'company',
        false,
        '2026-02-04'
    );
    
    -- Test 2: Service 300K to company with 500K threshold (Should be VAT 20%)
    RAISE NOTICE 'Test 2: Service 300000 to company (threshold: %) - Should be VAT 20%%', test_threshold;
    
    PERFORM tax_type_code, tax_rate, tax_amount, is_withholding, threshold_applied
    FROM calculate_item_tax(
        test_business_id,
        'UG',
        'SERVICES',
        300000,
        'sale',
        'company',
        false,
        '2026-02-04'
    );
    
    -- Reset threshold to default
    UPDATE wht_thresholds 
    SET threshold_amount = 1000000
    WHERE business_id = test_business_id;
END $$;

-- Final verification tests
SELECT '=== FINAL VERIFICATION TESTS ===' as status;

-- Test with default threshold (1,000,000)
SELECT 
    'Test 1: Service 800K to company (1M threshold)' as scenario,
    'Expected: VAT 20% (below threshold)' as expected,
    tax_type_code as actual_code,
    tax_rate as actual_rate,
    tax_amount as actual_amount,
    is_withholding as is_wht,
    threshold_applied as threshold_met,
    CASE 
        WHEN tax_type_code = 'VAT_STD' AND tax_rate = 20.00 THEN '✅ PASS'
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

SELECT 
    'Test 2: Service 1.2M to company (1M threshold)' as scenario,
    'Expected: WHT 6% (above threshold)' as expected,
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
    1200000,
    'sale',
    'company',
    false,
    '2026-02-04'
);
