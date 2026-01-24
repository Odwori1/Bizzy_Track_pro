-- Migration: 703_fix_tax_calculation_corrected.sql
-- Description: CORRECTED VERSION - Fix tax calculation bug
-- Created: $(date +"%Y-%m-%d %H:%M:%S")
-- Author: System Migration
-- Status: Applied
-- 
-- CORRECTIONS MADE:
-- 1. Fixed RAISE NOTICE syntax
-- 2. Fixed constraint violation by checking existing data
-- 3. Fixed table constraint syntax
-- 4. Simplified approach - focus on fixing the bug first

-- ============================================================================
-- PART 1: BACKUP CURRENT DATA FOR SAFETY
-- ============================================================================

-- Create backup of current tax rates
CREATE TABLE IF NOT EXISTS backup_country_tax_rates_703 AS 
SELECT * FROM country_tax_rates;

COMMENT ON TABLE backup_country_tax_rates_703 IS 
'Backup of country_tax_rates before migration 703 - for rollback safety';

-- ============================================================================
-- PART 2: CLEAN UP EXISTING RATES TO AVOID CONSTRAINTS
-- ============================================================================

-- First, check what rates we have
DO $$
DECLARE
    v_vat_std_id UUID;
    v_has_2024_rate BOOLEAN;
    v_has_2026_rate BOOLEAN;
BEGIN
    -- Get VAT_STD tax type ID
    SELECT id INTO v_vat_std_id 
    FROM tax_types 
    WHERE tax_code = 'VAT_STD';
    
    -- Check for 2024 rate
    SELECT EXISTS (
        SELECT 1 FROM country_tax_rates 
        WHERE country_code = 'UG' 
          AND tax_type_id = v_vat_std_id 
          AND effective_from = '2024-07-01'
    ) INTO v_has_2024_rate;
    
    -- Check for 2026 rate  
    SELECT EXISTS (
        SELECT 1 FROM country_tax_rates 
        WHERE country_code = 'UG' 
          AND tax_type_id = v_vat_std_id 
          AND effective_from = '2026-07-01'
    ) INTO v_has_2026_rate;
    
    RAISE NOTICE 'VAT_STD ID: %', v_vat_std_id;
    RAISE NOTICE 'Has 2024 rate (July 1): %', v_has_2024_rate;
    RAISE NOTICE 'Has 2026 rate (July 1): %', v_has_2026_rate;
    
    -- If we already have a rate starting July 1, 2024, we need to handle it
    IF v_has_2024_rate THEN
        -- Update the 18% rate to end June 30, 2024 (if it doesn't already)
        UPDATE country_tax_rates 
        SET effective_to = '2024-06-30'
        WHERE country_code = 'UG'
          AND tax_type_id = v_vat_std_id
          AND effective_from = '2024-01-01'
          AND (effective_to IS NULL OR effective_to > '2024-06-30');
          
        RAISE NOTICE 'Updated 18%% rate to end on 2024-06-30';
    END IF;
    
    -- If we already have a 2026 rate, we can't add another one
    IF v_has_2026_rate THEN
        RAISE NOTICE '2026 rate already exists, skipping insertion';
    ELSE
        -- Add 20% rate for 2026 testing
        INSERT INTO country_tax_rates 
        (country_code, tax_type_id, tax_rate, effective_from, version, is_default, notes)
        VALUES 
        ('UG', 
         v_vat_std_id,
         20.00, 
         '2026-07-01', 
         2,
         true,
         '2026/27 Budget change - Migration 703');
        RAISE NOTICE 'Added 20%% rate for 2026 testing';
    END IF;
END $$;

-- ============================================================================
-- PART 3: FIX THE calculate_item_tax() FUNCTION (SIMPLIFIED)
-- ============================================================================

-- First drop the function if it exists
DROP FUNCTION IF EXISTS calculate_item_tax(
    UUID, VARCHAR, VARCHAR, DECIMAL, VARCHAR, VARCHAR, BOOLEAN, DATE
);

-- Create the fixed function (SIMPLIFIED - no debug RAISE statements that caused errors)
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
) AS $$
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
    -- First, check for specific product category mapping
    SELECT cptm.tax_type_id, ctr.tax_rate, tt.tax_code, tt.tax_name
    INTO v_tax_type_id, v_tax_rate, v_tax_type_code, v_tax_type_name
    FROM country_product_tax_mappings cptm
    JOIN tax_types tt ON tt.id = cptm.tax_type_id
    LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        AND ctr.country_code = p_country_code
        AND ctr.effective_from <= p_date
        AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
        -- FIXED: Removed "AND ctr.is_default = true" 
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
            -- FIXED: Removed "AND ctr.is_default = true"
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_item_tax IS 'Calculate tax for an item. FIXED: Now correctly finds historical rates (not just is_default=true)';

-- ============================================================================
-- PART 4: CREATE VERIFICATION TEST
-- ============================================================================

-- Simple test function
CREATE OR REPLACE FUNCTION test_tax_fix_703()
RETURNS TABLE (test_result TEXT, expected TEXT, actual TEXT) AS $$
DECLARE
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::UUID;
    v_test_rate DECIMAL;
    v_test_amount DECIMAL;
BEGIN
    -- Test 1: June 2026 should use 18%
    SELECT tax_rate, tax_amount INTO v_test_rate, v_test_amount
    FROM calculate_item_tax(
        v_business_id, 'UG', 'STANDARD_GOODS', 1000000.00,
        'sale', 'company', false, '2026-06-15'
    );
    
    IF v_test_rate = 18.00 AND v_test_amount = 180000.00 THEN
        test_result := '✅ June 2026 VAT (18%)';
        expected := '18% = 180,000';
        actual := v_test_rate || '% = ' || v_test_amount;
        RETURN NEXT;
    ELSE
        test_result := '❌ June 2026 VAT (18%)';
        expected := '18% = 180,000';
        actual := v_test_rate || '% = ' || v_test_amount;
        RETURN NEXT;
    END IF;
    
    -- Test 2: July 2026 should use 20%
    SELECT tax_rate, tax_amount INTO v_test_rate, v_test_amount
    FROM calculate_item_tax(
        v_business_id, 'UG', 'STANDARD_GOODS', 1000000.00,
        'sale', 'company', false, '2026-07-15'
    );
    
    IF v_test_rate = 20.00 AND v_test_amount = 200000.00 THEN
        test_result := '✅ July 2026 VAT (20%)';
        expected := '20% = 200,000';
        actual := v_test_rate || '% = ' || v_test_amount;
        RETURN NEXT;
    ELSE
        test_result := '❌ July 2026 VAT (20%)';
        expected := '20% = 200,000';
        actual := v_test_rate || '% = ' || v_test_amount;
        RETURN NEXT;
    END IF;
    
    -- Test 3: Exempt product
    SELECT tax_rate, tax_amount INTO v_test_rate, v_test_amount
    FROM calculate_item_tax(
        v_business_id, 'UG', 'FINANCIAL_SERVICES', 500000.00,
        'sale', 'company', false, '2026-06-15'
    );
    
    IF v_test_rate = 0.00 AND v_test_amount = 0.00 THEN
        test_result := '✅ Exempt product (0%)';
        expected := '0% = 0';
        actual := v_test_rate || '% = ' || v_test_amount;
        RETURN NEXT;
    ELSE
        test_result := '❌ Exempt product (0%)';
        expected := '0% = 0';
        actual := v_test_rate || '% = ' || v_test_amount;
        RETURN NEXT;
    END IF;
    
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: LOG THE MIGRATION
-- ============================================================================

-- Ensure migration_log table exists
CREATE TABLE IF NOT EXISTS migration_log (
    id SERIAL PRIMARY KEY,
    migration_file VARCHAR(255) NOT NULL,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_by VARCHAR(100) DEFAULT CURRENT_USER,
    success BOOLEAN DEFAULT true,
    execution_time_ms INTEGER,
    notes TEXT
);

-- Log this corrected migration
INSERT INTO migration_log 
(migration_file, description, notes) 
VALUES 
(
    '703_fix_tax_calculation_corrected.sql',
    'Corrected tax calculation fix - removed debug statements, fixed constraints',
    'Simplified approach focusing only on fixing the is_default=true bug'
);

-- ============================================================================
-- PART 6: OUTPUT RESULTS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 703 (CORRECTED) APPLIED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fixed calculate_item_tax() function';
    RAISE NOTICE 'Removed is_default=true condition bug';
    RAISE NOTICE '';
    RAISE NOTICE 'To test: SELECT * FROM test_tax_fix_703();';
    RAISE NOTICE '========================================';
END $$;
