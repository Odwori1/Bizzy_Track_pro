-- ============================================
-- FIX TAX FUNCTION TO USE EXISTING WHT MAPPINGS
-- ============================================

-- First, let's see the current function signature
SELECT 
    'Current Function' as info,
    proname as function_name,
    pg_get_function_identity_arguments(oid) as arguments,
    prosrc as source_code
FROM pg_proc 
WHERE proname = 'calculate_item_tax'
LIMIT 1;

-- Drop the existing function (we'll recreate it correctly)
DROP FUNCTION IF EXISTS calculate_item_tax(
    UUID, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, BOOLEAN, DATE
);

-- Create the PROPER tax function that uses existing WHT mappings
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
    v_mapping_record RECORD;
    v_found_mapping BOOLEAN DEFAULT false;
    v_wht_threshold DECIMAL(15,2);
    v_min_amount DECIMAL(15,2);
    v_customer_types TEXT[];
    v_condition_is_export BOOLEAN;
BEGIN
    -- Default taxable amount
    taxable_amount := p_amount;
    
    -- Get product treatment first (exempt/zero-rated/taxable)
    SELECT 
        ptc.global_treatment = 'exempt',
        ptc.global_treatment = 'zero_rated',
        ptc.global_treatment
    INTO v_is_exempt, v_is_zero_rated, v_tax_type_name  -- Temporary use
    FROM product_tax_categories ptc
    WHERE ptc.category_code = p_product_category_code;

    -- If exempt or zero-rated, return zero tax immediately
    IF v_is_exempt OR v_is_zero_rated THEN
        tax_type_id := NULL;
        tax_type_code := CASE 
            WHEN v_is_exempt THEN 'EXEMPT'
            WHEN v_is_zero_rated THEN 'ZERO_RATED'
            ELSE 'NO_TAX'
        END;
        tax_type_name := v_tax_type_name;
        tax_rate := 0.00;
        tax_amount := 0.00;
        ledger_account := CASE 
            WHEN p_transaction_type = 'sale' THEN '2210'
            WHEN p_transaction_type = 'purchase' THEN '2220'
            ELSE '2290'
        END;
        is_withholding := false;
        threshold_applied := false;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Try to find the HIGHEST PRIORITY applicable tax mapping
    -- The database already has WHT_SERVICES (priority 1) and WHT_GOODS (priority 5)
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
        -- Check if conditions are met
        v_found_mapping := true;
        
        -- Extract conditions
        v_min_amount := (v_mapping_record.conditions->>'min_amount')::DECIMAL;
        v_customer_types := ARRAY(SELECT jsonb_array_elements_text(v_mapping_record.conditions->'customer_types'));
        v_condition_is_export := (v_mapping_record.conditions->>'is_export')::BOOLEAN;
        
        -- Check min_amount condition
        IF v_min_amount IS NOT NULL AND p_amount < v_min_amount THEN
            v_found_mapping := false;
            CONTINUE; -- Try next mapping
        END IF;
        
        -- Check customer_types condition
        IF v_customer_types IS NOT NULL AND array_length(v_customer_types, 1) > 0 THEN
            IF NOT (p_customer_type = ANY(v_customer_types)) THEN
                v_found_mapping := false;
                CONTINUE; -- Try next mapping
            END IF;
        END IF;
        
        -- Check is_export condition
        IF v_condition_is_export IS NOT NULL AND v_condition_is_export != p_is_export THEN
            v_found_mapping := false;
            CONTINUE; -- Try next mapping
        END IF;
        
        -- If we get here, all conditions are met!
        v_tax_type_id := v_mapping_record.tax_type_id;
        v_tax_type_code := v_mapping_record.tax_code;
        v_tax_type_name := v_mapping_record.tax_name;
        v_tax_rate := v_mapping_record.tax_rate;
        v_is_withholding := v_tax_type_code LIKE 'WHT%';
        
        -- For WHT, check if threshold was applied (min_amount condition)
        IF v_is_withholding AND v_min_amount IS NOT NULL AND p_amount >= v_min_amount THEN
            v_threshold_applied := true;
        END IF;
        
        EXIT; -- Use the first matching mapping (highest priority)
    END LOOP;

    -- If no specific mapping found, use default VAT for the country
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
-- TEST THE FIXED FUNCTION
-- ============================================
SELECT '=== TESTING FIXED TAX FUNCTION ===' as header;

-- Test 1: Services 1.5M to company (Should be WHT 6% - priority 1)
SELECT 'TEST 1: Services 1.5M to company (WHT 6%)' as test_case;
SELECT 
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    ledger_account
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256', -- business_id
    'UG',                                   -- country_code
    'SERVICES',                             -- product_category
    1500000,                                -- amount > 1M UGX
    'sale',                                 -- transaction_type
    'company',                              -- customer_type
    false,                                  -- is_export
    '2026-02-04'                            -- date
);

-- Test 2: Services 500K to company (Should be ???)
-- Since there's NO VAT_STD mapping for SERVICES with priority 10,
-- and WHT_SERVICES requires min_amount 1M, this should fall back to default VAT
SELECT 'TEST 2: Services 500K to company (Should be VAT 20% - fallback)' as test_case;
SELECT 
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    ledger_account
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    500000,                                 -- amount < 1M UGX
    'sale',
    'company',
    false,
    '2026-02-04'
);

-- Test 3: Services 1.5M to individual (Should be VAT 20% - WHT only for company)
SELECT 'TEST 3: Services 1.5M to individual (VAT 20% - WHT only for company)' as test_case;
SELECT 
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    ledger_account
FROM calculate_item_tax(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    'UG',
    'SERVICES',
    1500000,
    'sale',
    'individual',                           -- individual = no WHT
    false,
    '2026-02-04'
);

-- Test 4: Standard Goods 1.5M to company (Should be WHT_GOODS 6% - priority 5)
SELECT 'TEST 4: Standard Goods 1.5M to company (WHT_GOODS 6%)' as test_case;
SELECT 
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    ledger_account
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

-- Test 5: Essential Goods 1.5M to company (Should be 0% - zero-rated)
SELECT 'TEST 5: Essential Goods 1.5M to company (0% zero-rated)' as test_case;
SELECT 
    tax_type_code,
    tax_rate,
    tax_amount,
    is_withholding,
    threshold_applied,
    ledger_account,
    is_zero_rated
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

-- Test 6: Check all categories for company customers
SELECT 'TEST 6: All categories for company customer' as test_case;
SELECT 
    pc.category_code,
    (SELECT tax_type_code FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1500000,
        'sale',
        'company',
        false,
        '2026-02-04'
    )) as tax_code,
    (SELECT tax_rate FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1500000,
        'sale',
        'company',
        false,
        '2026-02-04'
    )) as tax_rate,
    (SELECT is_withholding FROM calculate_item_tax(
        'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
        'UG',
        pc.category_code,
        1500000,
        'sale',
        'company',
        false,
        '2026-02-04'
    )) as is_wht
FROM product_tax_categories pc
ORDER BY pc.category_code;
