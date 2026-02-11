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
    v_wht_threshold DECIMAL(15,2) DEFAULT 1000000;
BEGIN
    -- Get business WHT threshold (customizable per business)
    SELECT COALESCE(threshold_amount, 1000000)
    INTO v_wht_threshold
    FROM wht_thresholds
    WHERE business_id = p_business_id
        AND effective_from <= p_date
        AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;

    -- Check for WHT exemption
    IF EXISTS (
        SELECT 1 FROM wht_exemptions we
        WHERE we.business_id = p_business_id
            AND (we.supplier_id IS NOT NULL OR we.supplier_tin IS NOT NULL)
            AND we.valid_from <= p_date
            AND (we.valid_to IS NULL OR we.valid_to >= p_date)
    ) THEN
        -- Supplier is exempt from WHT, skip to normal VAT calculation
        v_is_withholding := false;
    END IF;

    -- PRIORITY 1: Check for WHT applicability (services > threshold to company customers)
    IF NOT v_is_withholding AND p_product_category_code = 'SERVICES' 
       AND p_customer_type = 'company' 
       AND p_amount >= v_wht_threshold 
       AND p_transaction_type = 'sale' THEN
        
        SELECT tt.id, ctr.tax_rate, tt.tax_code, tt.tax_name
        INTO v_tax_type_id, v_tax_rate, v_tax_type_code, v_tax_type_name
        FROM tax_types tt
        JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
        WHERE tt.tax_code = 'WHT_SERVICES'
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        LIMIT 1;

        IF v_tax_type_id IS NOT NULL THEN
            v_is_withholding := true;
            v_threshold_applied := true;
        END IF;
    END IF;

    -- PRIORITY 2: Normal tax mapping (if no WHT applies)
    IF NOT v_is_withholding THEN
        -- Original logic from calculate_item_tax...
        -- (copy existing logic here for non-WHT cases)
        SELECT cptm.tax_type_id, ctr.tax_rate, tt.tax_code, tt.tax_name
        INTO v_tax_type_id, v_tax_rate, v_tax_type_code, v_tax_type_name
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
                OR p_customer_type = ANY(ARRAY(SELECT jsonb_array_elements_text(cptm.conditions->'customer_types')))
            )
            AND (
                cptm.conditions->>'is_export' IS NULL
                OR (cptm.conditions->>'is_export')::BOOLEAN = p_is_export
            )
        ORDER BY cptm.priority
        LIMIT 1;

        -- If no specific mapping, use default VAT
        IF v_tax_type_id IS NULL THEN
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
        v_is_withholding := false;
    END IF;

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
    taxable_amount := p_amount;
    tax_amount := ROUND(p_amount * COALESCE(v_tax_rate, 0.00) / 100, 2);
    is_exempt := v_is_exempt;
    is_zero_rated := v_is_zero_rated;
    ledger_account := v_ledger_account;
    applicable_rule_id := v_rule_id;
    is_withholding := v_is_withholding;
    threshold_applied := v_threshold_applied;

    RETURN NEXT;
END;
$$;
