-- Migration: 704_final_fix_tax_calculation.sql
-- Description: FINAL fix for tax calculation - remove is_default condition completely
-- Created: $(date +"%Y-%m-%d %H:%M:%S")
-- Author: System Migration

-- ============================================================================
-- PART 1: FIX THE DATE OVERLAP PROBLEM FIRST
-- ============================================================================

-- We need to END the 20% rate that starts in 2024 so we can add proper 2026 rates
DO $$
DECLARE
    v_vat_std_id UUID;
    v_2024_rate_id UUID;
BEGIN
    -- Get VAT_STD tax type ID
    SELECT id INTO v_vat_std_id 
    FROM tax_types 
    WHERE tax_code = 'VAT_STD';

    -- Find the 20% rate that starts in 2024
    SELECT id INTO v_2024_rate_id
    FROM country_tax_rates
    WHERE country_code = 'UG'
      AND tax_type_id = v_vat_std_id
      AND effective_from = '2024-07-01'
      AND effective_to IS NULL;

    -- If it exists, end it in 2026 (so we can test 2026 scenarios)
    IF v_2024_rate_id IS NOT NULL THEN
        UPDATE country_tax_rates 
        SET effective_to = '2026-06-30',
            is_default = false
        WHERE id = v_2024_rate_id;
        
        RAISE NOTICE 'Ended 2024-07-01 rate at 2026-06-30';
    END IF;
END $$;

-- ============================================================================
-- PART 2: ADD PROPER 2026 RATES FOR TESTING
-- ============================================================================

DO $$
DECLARE
    v_vat_std_id UUID;
BEGIN
    -- Get VAT_STD tax type ID
    SELECT id INTO v_vat_std_id 
    FROM tax_types 
    WHERE tax_code = 'VAT_STD';

    -- Make sure we have 18% rate ending June 30, 2026
    UPDATE country_tax_rates 
    SET effective_to = '2026-06-30',
        is_default = false
    WHERE country_code = 'UG'
      AND tax_type_id = v_vat_std_id
      AND tax_rate = 18.00
      AND (effective_to IS NULL OR effective_to > '2026-06-30');

    -- Add 20% rate starting July 1, 2026
    INSERT INTO country_tax_rates 
    (country_code, tax_type_id, tax_rate, effective_from, version, is_default, notes)
    SELECT 
        'UG',
        v_vat_std_id,
        20.00,
        '2026-07-01',
        3,
        true,
        '2026/27 Budget change - Migration 704'
    WHERE NOT EXISTS (
        SELECT 1 FROM country_tax_rates 
        WHERE country_code = 'UG'
          AND tax_type_id = v_vat_std_id
          AND effective_from = '2026-07-01'
    );
    
    RAISE NOTICE 'Added 2026 rates: 18%% until June 30, 20%% from July 1';
END $$;

-- ============================================================================
-- PART 3: COMPLETELY RECREATE THE FUNCTION WITHOUT is_default CONDITION
-- ============================================================================

-- First, get the current function source to see the exact problem
CREATE OR REPLACE FUNCTION debug_get_function_source()
RETURNS TEXT AS $$
DECLARE
    v_source TEXT;
BEGIN
    SELECT prosrc INTO v_source
    FROM pg_proc 
    WHERE proname = 'calculate_item_tax';
    
    RETURN v_source;
END;
$$ LANGUAGE plpgsql;

-- Now drop and recreate with CORRECTED logic
DROP FUNCTION IF EXISTS calculate_item_tax(
    UUID, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, BOOLEAN, DATE
);

-- CREATE THE FIXED FUNCTION - CAREFULLY WRITTEN
CREATE OR REPLACE FUNCTION calculate_item_tax(
    p_business_id UUID,
    p_country_code VARCHAR(2),
    p_product_category_code VARCHAR(50),
    p_amount DECIMAL(18,2),
    p_transaction_type VARCHAR(20),
    p_customer_type VARCHAR(50),
    p_is_export BOOLEAN,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    tax_type_id UUID,
    tax_type_code VARCHAR(20),
    tax_type_name VARCHAR(100),
    tax_rate DECIMAL(5,2),
    taxable_amount DECIMAL(18,2),
    tax_amount DECIMAL(18,2),
    is_exempt BOOLEAN,
    is_zero_rated BOOLEAN,
    ledger_account VARCHAR(10),
    applicable_rule_id UUID
) AS $function_body$
DECLARE
    v_tax_type_id UUID;
    v_tax_rate DECIMAL(5,2);
    v_ledger_account VARCHAR(10);
    v_rule_id UUID;
    v_is_exempt BOOLEAN;
    v_is_zero_rated BOOLEAN;
    v_tax_type_code VARCHAR(20);
    v_tax_type_name VARCHAR(100);
BEGIN
    -- DEBUG: First let's see what rates are available
    -- SELECT tax_rate INTO v_tax_rate
    -- FROM country_tax_rates ctr
    -- JOIN tax_types tt ON tt.id = ctr.tax_type_id
    -- WHERE tt.tax_code = 'VAT_STD'
    --   AND ctr.country_code = p_country_code
    --   AND ctr.effective_from <= p_date
    --   AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
    -- LIMIT 1;

    -- First, check for specific product category mapping
    -- CRITICAL FIX: Removed ALL references to is_default
    SELECT cptm.tax_type_id, ctr.tax_rate, tt.tax_code, tt.tax_name
    INTO v_tax_type_id, v_tax_rate, v_tax_type_code, v_tax_type_name
    FROM country_product_tax_mappings cptm
    JOIN tax_types tt ON tt.id = cptm.tax_type_id
    LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        AND ctr.country_code = p_country_code
        AND ctr.effective_from <= p_date
        AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
        -- NO is_default condition here!
    WHERE cptm.country_code = p_country_code
        AND cptm.product_category_code = p_product_category_code
        AND cptm.is_active = true
        AND (
            cptm.conditions->>'customer_types' IS NULL
            OR p_customer_type = ANY(ARRAY(SELECT jsonb_array_elements_text(cptm.conditions->'customer_types')))
        )
        AND (
            cptm.conditions->>'is_export' IS NULL
            OR (cptm.conditions->>'is_export')::BOOLEAN = p_is_export
        )
    ORDER BY cptm.priority
    LIMIT 1;

    -- If no specific mapping, use default VAT for the country
    IF v_tax_type_id IS NULL THEN
        SELECT tt.id, ctr.tax_rate, tt.tax_code, tt.tax_name
        INTO v_tax_type_id, v_tax_rate, v_tax_type_code, v_tax_type_name
        FROM tax_types tt
        JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        WHERE tt.tax_code = 'VAT_STD'
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            -- NO is_default condition here either!
        LIMIT 1;
    END IF;

    -- Determine if exempt or zero-rated
    SELECT
        ptc.global_treatment = 'exempt',
        ptc.global_treatment = 'zero_rated'
    INTO v_is_exempt, v_is_zero_rated
    FROM product_tax_categories ptc
    WHERE ptc.category_code = p_product_category_code;

    -- Override rate for zero-rated or exempt
    IF v_is_exempt OR v_is_zero_rated THEN
        v_tax_rate := 0.00;
    END IF;

    -- Determine ledger account
    IF p_transaction_type = 'sale' THEN
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
    taxable_amount := p_amount;
    tax_amount := ROUND(p_amount * COALESCE(v_tax_rate, 0.00) / 100, 2);
    is_exempt := v_is_exempt;
    is_zero_rated := v_is_zero_rated;
    ledger_account := v_ledger_account;
    applicable_rule_id := v_rule_id;

    RETURN NEXT;
END;
$function_body$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: CREATE SIMPLE TEST
-- ============================================================================

CREATE OR REPLACE FUNCTION test_final_tax_fix()
RETURNS TABLE(test_description TEXT, result TEXT) AS $$
DECLARE
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    v_rate DECIMAL;
    v_amount DECIMAL;
BEGIN
    -- Test June 2026
    SELECT tax_rate, tax_amount INTO v_rate, v_amount
    FROM calculate_item_tax(
        v_business_id, 'UG', 'STANDARD_GOODS', 1000.00,
        'sale', 'company', false, '2026-06-15'
    );
    
    IF v_rate = 18.00 AND v_amount = 180.00 THEN
        test_description := 'June 2026 (should be 18%)';
        result := '✅ PASS - ' || v_rate || '% = ' || v_amount;
    ELSE
        test_description := 'June 2026 (should be 18%)';
        result := '❌ FAIL - ' || v_rate || '% = ' || v_amount || ' (expected 18% = 180)';
    END IF;
    RETURN NEXT;
    
    -- Test July 2026
    SELECT tax_rate, tax_amount INTO v_rate, v_amount
    FROM calculate_item_tax(
        v_business_id, 'UG', 'STANDARD_GOODS', 1000.00,
        'sale', 'company', false, '2026-07-15'
    );
    
    IF v_rate = 20.00 AND v_amount = 200.00 THEN
        test_description := 'July 2026 (should be 20%)';
        result := '✅ PASS - ' || v_rate || '% = ' || v_amount;
    ELSE
        test_description := 'July 2026 (should be 20%)';
        result := '❌ FAIL - ' || v_rate || '% = ' || v_amount || ' (expected 20% = 200)';
    END IF;
    RETURN NEXT;
    
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: VERIFY FIX
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 704: FINAL TAX FIX';
    RAISE NOTICE '========================================';
    RAISE NOTICE '1. Fixed date ranges for 2026 testing';
    RAISE NOTICE '2. Completely removed is_default condition';
    RAISE NOTICE '3. Created clean test function';
    RAISE NOTICE '';
    RAISE NOTICE 'To test: SELECT * FROM test_final_tax_fix();';
    RAISE NOTICE '========================================';
END $$;
