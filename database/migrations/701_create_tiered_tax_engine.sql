-- ============================================
-- TIERED TAX ENGINE - COMPETITIVE ARCHITECTURE
-- Migration: 701_create_tiered_tax_engine_fixed.sql
-- Date: $(date)
-- ============================================

-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TAX COUNTRIES (Global country registry)
CREATE TABLE tax_countries (
    country_code VARCHAR(2) PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    timezone VARCHAR(50) NOT NULL,
    tax_system_type VARCHAR(20) NOT NULL DEFAULT 'vat', -- vat, gst, sales_tax
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TAX TYPES (Global tax definitions)
CREATE TABLE tax_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tax_code VARCHAR(20) UNIQUE NOT NULL,      -- VAT_STD, WHT_SERVICES, EXCISE
    tax_name VARCHAR(100) NOT NULL,
    description TEXT,
    tax_category VARCHAR(30) NOT NULL,         -- sales_tax, withholding, excise, income
    is_recoverable BOOLEAN DEFAULT false,      -- Can be claimed as input tax
    requires_tax_id BOOLEAN DEFAULT false,     -- Requires tax identification number
    accounting_treatment JSONB DEFAULT '{
        "debit_account": null,
        "credit_account": null,
        "posting_method": "auto"
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COUNTRY TAX RATES (Versioned, immutable)
CREATE TABLE country_tax_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code VARCHAR(2) REFERENCES tax_countries(country_code) ON DELETE CASCADE,
    tax_type_id UUID REFERENCES tax_types(id) ON DELETE CASCADE,
    tax_rate DECIMAL(5,2) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
    effective_from DATE NOT NULL,
    effective_to DATE,                         -- NULL = currently effective
    version INTEGER DEFAULT 1,
    is_default BOOLEAN DEFAULT true,
    notes TEXT,
    created_by UUID,                           -- User who created this rate
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PRODUCT TAX CATEGORIES (Global taxonomy)
CREATE TABLE product_tax_categories (
    category_code VARCHAR(30) PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL,
    description TEXT,
    global_treatment VARCHAR(20) NOT NULL DEFAULT 'taxable', -- taxable, zero_rated, exempt
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. COUNTRY PRODUCT TAX MAPPINGS (Country-specific overrides)
CREATE TABLE country_product_tax_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    country_code VARCHAR(2) REFERENCES tax_countries(country_code) ON DELETE CASCADE,
    product_category_code VARCHAR(30) REFERENCES product_tax_categories(category_code) ON DELETE CASCADE,
    tax_type_id UUID REFERENCES tax_types(id) ON DELETE CASCADE,
    
    -- Conditions for when this mapping applies
    conditions JSONB DEFAULT '{
        "customer_types": [],
        "min_amount": null,
        "max_amount": null,
        "is_export": false
    }',
    
    priority INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint separately
ALTER TABLE country_product_tax_mappings 
ADD CONSTRAINT unique_country_product_tax 
UNIQUE (country_code, product_category_code, tax_type_id);

-- 6. TAX RULES ENGINE (Complex business rules)
CREATE TABLE tax_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    country_code VARCHAR(2) REFERENCES tax_countries(country_code),
    rule_code VARCHAR(50) NOT NULL,            -- EXPORT_ZERO_RATED, GOVERNMENT_WHT
    rule_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- JSONB for flexible conditions
    conditions JSONB NOT NULL DEFAULT '{}',    -- {"amount_greater_than": 1000000, "customer_type": "government"}
    actions JSONB NOT NULL DEFAULT '{}',       -- {"apply_tax": "WHT_SERVICES", "rate": 6, "override_base_rate": true}
    
    priority INTEGER NOT NULL DEFAULT 100,     -- Lower number = higher priority
    is_active BOOLEAN DEFAULT true,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    
    -- Compiled version for performance (stored as text that can be eval'd)
    compiled_conditions TEXT,
    compiled_actions TEXT,
    last_compiled_at TIMESTAMPTZ,
    compilation_hash VARCHAR(64),              -- SHA256 of source for cache invalidation
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. TAX CALCULATION CACHE (Performance optimization)
CREATE TABLE tax_calculation_cache (
    cache_key VARCHAR(255) PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    product_category_code VARCHAR(30),
    customer_type VARCHAR(30),
    amount_range VARCHAR(50),                  -- e.g., "0-1000000", "1000000-5000000"
    
    -- Compiled rules for this combination
    applicable_tax_types JSONB NOT NULL,       -- Array of tax types that apply
    compiled_rules JSONB,                      -- Pre-compiled rule logic
    calculation_template JSONB,                -- Template for fast calculation
    
    hits BIGINT DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TRANSACTION TAXES (Complete audit trail)
CREATE TABLE transaction_taxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL,               -- Links to invoices, purchases, expenses
    transaction_type VARCHAR(20) NOT NULL,      -- sale, purchase, expense, payment
    transaction_date DATE NOT NULL,
    
    -- Tax calculation context
    tax_type_id UUID NOT NULL REFERENCES tax_types(id),
    tax_rate_id UUID REFERENCES country_tax_rates(id),
    tax_rule_id UUID REFERENCES tax_rules(id),
    
    -- Tax details
    taxable_amount DECIMAL(15,2) NOT NULL CHECK (taxable_amount >= 0),
    tax_rate DECIMAL(5,2) NOT NULL CHECK (tax_rate >= 0 AND tax_rate <= 100),
    tax_amount DECIMAL(15,2) NOT NULL CHECK (tax_amount >= 0),
    
    -- Jurisdiction
    country_code VARCHAR(2) NOT NULL REFERENCES tax_countries(country_code),
    jurisdiction_level VARCHAR(20) DEFAULT 'national', -- national, state, county, city
    
    -- Product classification
    product_category_code VARCHAR(30) REFERENCES product_tax_categories(category_code),
    
    -- Accounting integration
    tax_ledger_account VARCHAR(10),             -- e.g., '2210' for Output VAT
    is_posted_to_ledger BOOLEAN DEFAULT false,
    journal_entry_id UUID,                      -- Links to journal_entries table
    
    -- Compliance tracking
    tax_period DATE NOT NULL,                   -- YYYY-MM-01 for monthly returns
    is_paid BOOLEAN DEFAULT false,
    paid_at TIMESTAMPTZ,
    
    -- Full audit trail
    calculation_context JSONB NOT NULL,         -- Complete input snapshot
    calculation_version VARCHAR(50),            -- Rule/rate version used
    calculation_metadata JSONB DEFAULT '{
        "cache_used": false,
        "cache_key": null,
        "calculation_time_ms": 0,
        "rules_evaluated": []
    }',
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TAX RETURNS (Compliance reporting)
CREATE TABLE tax_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    return_type VARCHAR(20) NOT NULL,           -- vat, wht, excise, income_tax
    country_code VARCHAR(2) NOT NULL REFERENCES tax_countries(country_code),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Return calculations
    total_sales DECIMAL(15,2) DEFAULT 0,
    total_purchases DECIMAL(15,2) DEFAULT 0,
    output_tax DECIMAL(15,2) DEFAULT 0,
    input_tax DECIMAL(15,2) DEFAULT 0,
    net_tax_payable DECIMAL(15,2) DEFAULT 0,
    adjustments DECIMAL(15,2) DEFAULT 0,
    penalty_amount DECIMAL(15,2) DEFAULT 0,
    interest_amount DECIMAL(15,2) DEFAULT 0,
    total_amount_payable DECIMAL(15,2) DEFAULT 0,
    
    -- Status workflow
    status VARCHAR(20) DEFAULT 'draft',         -- draft, calculated, submitted, approved, paid
    submitted_at TIMESTAMPTZ,
    approval_reference VARCHAR(100),            -- URA/KRA reference number
    paid_at TIMESTAMPTZ,
    
    -- Detailed breakdown (JSON for flexibility)
    breakdown JSONB DEFAULT '{
        "sales_by_category": {},
        "purchases_by_category": {},
        "tax_liabilities": {},
        "tax_credits": {}
    }',
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add check constraint for tax_returns
ALTER TABLE tax_returns 
ADD CONSTRAINT check_tax_return_period 
CHECK (period_start <= period_end);

-- Add unique constraint for tax_returns
ALTER TABLE tax_returns 
ADD CONSTRAINT unique_tax_return 
UNIQUE (business_id, return_type, period_start, period_end);

-- 10. TAX PAYMENTS
CREATE TABLE tax_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    return_id UUID REFERENCES tax_returns(id),
    payment_date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL,        -- bank_transfer, mobile_money, cash
    reference_number VARCHAR(100),
    bank_transaction_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',       -- pending, confirmed, failed
    confirmed_at TIMESTAMPTZ,
    notes TEXT,
    
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES AFTER TABLES ARE CREATED
-- ============================================

-- Index for tax rate lookups
CREATE INDEX idx_country_tax_rates_lookup 
    ON country_tax_rates(country_code, tax_type_id, effective_from, effective_to, is_default);

-- Index for product tax mapping lookups
CREATE INDEX idx_country_product_tax_mappings_lookup 
    ON country_product_tax_mappings(country_code, product_category_code, is_active, priority);

-- Index for rule lookups
CREATE INDEX idx_tax_rules_active 
    ON tax_rules(country_code, is_active, effective_from, effective_to, priority);

-- Index for transaction tax reporting
CREATE INDEX idx_transaction_taxes_reporting 
    ON transaction_taxes(business_id, tax_period, transaction_type, country_code);

-- Index for tax return lookups
CREATE INDEX idx_tax_returns_period 
    ON tax_returns(business_id, return_type, period_start, period_end);

-- Index for tax cache lookups
CREATE INDEX idx_tax_cache_lookup 
    ON tax_calculation_cache(country_code, product_category_code, customer_type, amount_range);

-- ============================================
-- ADD EXCLUDE CONSTRAINT FOR DATE RANGES
-- ============================================

-- Add exclusion constraint for country_tax_rates (prevents overlapping date ranges)
-- First, we need btree_gist extension
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Now add the exclusion constraint
ALTER TABLE country_tax_rates 
ADD CONSTRAINT exclude_overlapping_tax_rates 
EXCLUDE USING gist (
    country_code WITH =,
    tax_type_id WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity')) WITH &&
);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Tax rules are business-specific
ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_rules_isolation_policy ON tax_rules
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- Transaction taxes are business-specific
ALTER TABLE transaction_taxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY transaction_taxes_isolation_policy ON transaction_taxes
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- Tax returns are business-specific
ALTER TABLE tax_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_returns_isolation_policy ON tax_returns
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- Tax payments are business-specific
ALTER TABLE tax_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tax_payments_isolation_policy ON tax_payments
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- Note: Tax configuration tables (countries, types, rates, categories) are GLOBAL
-- and accessible to all businesses for reference data

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to get effective tax rate for a country, tax type, and date
CREATE OR REPLACE FUNCTION get_effective_tax_rate(
    p_country_code VARCHAR(2),
    p_tax_type_code VARCHAR(20),
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_rate DECIMAL(5,2);
BEGIN
    SELECT ctr.tax_rate INTO v_rate
    FROM country_tax_rates ctr
    JOIN tax_types tt ON tt.id = ctr.tax_type_id
    WHERE ctr.country_code = p_country_code
        AND tt.tax_code = p_tax_type_code
        AND ctr.effective_from <= p_date
        AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
        AND ctr.is_default = true
    ORDER BY ctr.effective_from DESC
    LIMIT 1;
    
    RETURN COALESCE(v_rate, 0.00);
END;
$$;

-- Function to calculate tax for an item
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
    applicable_rule_id UUID
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
            AND ctr.is_default = true
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
$$;

-- Trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_tax_countries_updated_at
    BEFORE UPDATE ON tax_countries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_types_updated_at
    BEFORE UPDATE ON tax_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_country_tax_rates_updated_at
    BEFORE UPDATE ON country_tax_rates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_country_product_tax_mappings_updated_at
    BEFORE UPDATE ON country_product_tax_mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_rules_updated_at
    BEFORE UPDATE ON tax_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transaction_taxes_updated_at
    BEFORE UPDATE ON transaction_taxes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_returns_updated_at
    BEFORE UPDATE ON tax_returns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_payments_updated_at
    BEFORE UPDATE ON tax_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA SETUP
-- ============================================

-- Insert countries
INSERT INTO tax_countries (country_code, country_name, currency_code, timezone, tax_system_type) VALUES
('UG', 'Uganda', 'UGX', 'Africa/Kampala', 'vat'),
('KE', 'Kenya', 'KES', 'Africa/Nairobi', 'vat'),
('TZ', 'Tanzania', 'TZS', 'Africa/Dar_es_Salaam', 'vat'),
('RW', 'Rwanda', 'RWF', 'Africa/Kigali', 'vat'),
('US', 'United States', 'USD', 'America/New_York', 'sales_tax')
ON CONFLICT (country_code) DO UPDATE SET
    country_name = EXCLUDED.country_name,
    updated_at = NOW();

-- Insert tax types (global)
INSERT INTO tax_types (tax_code, tax_name, tax_category, is_recoverable, requires_tax_id, description) VALUES
('VAT_STD', 'Value Added Tax - Standard', 'sales_tax', true, true, 'Standard rate Value Added Tax'),
('VAT_ZERO', 'VAT Zero Rated', 'sales_tax', true, true, 'Zero rated VAT (0%) - exports, essential goods'),
('VAT_EXEMPT', 'VAT Exempt', 'sales_tax', false, false, 'Exempt from VAT (financial services, education)'),
('WHT_SERVICES', 'Withholding Tax - Services', 'withholding', false, true, 'Withholding tax on services (6%)'),
('WHT_GOODS', 'Withholding Tax - Goods', 'withholding', false, true, 'Withholding tax on goods supply (6%)'),
('EXCISE', 'Excise Duty', 'excise', false, true, 'Excise duty on specific goods (varies)'),
('INCOME_CORP', 'Corporate Income Tax', 'income', false, true, 'Corporate income tax (30%)'),
('PAYE', 'Pay As You Earn', 'income', false, true, 'Personal income tax on employment')
ON CONFLICT (tax_code) DO UPDATE SET
    tax_name = EXCLUDED.tax_name,
    updated_at = NOW();

-- Insert Uganda tax rates
INSERT INTO country_tax_rates (country_code, tax_type_id, tax_rate, effective_from, is_default, version)
SELECT 
    'UG',
    tt.id,
    CASE tt.tax_code
        WHEN 'VAT_STD' THEN 18.00
        WHEN 'WHT_SERVICES' THEN 6.00
        WHEN 'WHT_GOODS' THEN 6.00
        WHEN 'EXCISE' THEN 12.00  -- Example: phone services
        WHEN 'INCOME_CORP' THEN 30.00
        WHEN 'PAYE' THEN 0.00     -- Progressive rates handled differently
        ELSE 0.00
    END,
    '2024-01-01',
    true,
    1
FROM tax_types tt
WHERE tt.tax_code IN ('VAT_STD', 'WHT_SERVICES', 'WHT_GOODS', 'EXCISE', 'INCOME_CORP', 'PAYE')
ON CONFLICT DO NOTHING;

-- Insert product tax categories
INSERT INTO product_tax_categories (category_code, category_name, description, global_treatment) VALUES
('STANDARD_GOODS', 'Standard Goods', 'Most goods and services - taxable', 'taxable'),
('ESSENTIAL_GOODS', 'Essential Goods', 'Basic necessities (food, medicine) - zero-rated', 'zero_rated'),
('PHARMACEUTICALS', 'Pharmaceuticals', 'Medical drugs and supplies', 'taxable'),
('DIGITAL_SERVICES', 'Digital Services', 'Software, streaming, digital products', 'taxable'),
('FINANCIAL_SERVICES', 'Financial Services', 'Banking, insurance, financial services - exempt', 'exempt'),
('EDUCATION_SERVICES', 'Education Services', 'Educational services - exempt', 'exempt'),
('AGRICULTURAL', 'Agricultural Products', 'Farm produce and inputs - zero-rated', 'zero_rated'),
('EXPORT_GOODS', 'Export Goods', 'Goods for export - zero-rated', 'zero_rated'),
('SERVICES', 'Services', 'General services', 'taxable')
ON CONFLICT (category_code) DO UPDATE SET
    category_name = EXCLUDED.category_name,
    updated_at = NOW();

-- Map Uganda product categories to tax types
INSERT INTO country_product_tax_mappings (country_code, product_category_code, tax_type_id, conditions, priority)
SELECT 
    'UG',
    ptc.category_code,
    tt.id,
    CASE 
        WHEN ptc.category_code IN ('ESSENTIAL_GOODS', 'AGRICULTURAL', 'EXPORT_GOODS') THEN 
            '{"is_export": false}'::JSONB
        ELSE '{}'::JSONB
    END,
    CASE 
        WHEN ptc.category_code IN ('EXPORT_GOODS') THEN 5  -- High priority for exports
        ELSE 10
    END
FROM product_tax_categories ptc
CROSS JOIN tax_types tt
WHERE tt.tax_code = 'VAT_STD'
    AND ptc.category_code IN ('STANDARD_GOODS', 'PHARMACEUTICALS', 'DIGITAL_SERVICES', 'SERVICES')
    
UNION ALL

SELECT 
    'UG',
    ptc.category_code,
    tt.id,
    '{"is_export": true}'::JSONB,
    1  -- Highest priority for exports
FROM product_tax_categories ptc
CROSS JOIN tax_types tt
WHERE tt.tax_code = 'VAT_ZERO'
    AND ptc.category_code IN ('EXPORT_GOODS')
    
UNION ALL

SELECT 
    'UG',
    ptc.category_code,
    tt.id,
    '{}'::JSONB,
    10
FROM product_tax_categories ptc
CROSS JOIN tax_types tt
WHERE tt.tax_code = 'VAT_ZERO'
    AND ptc.category_code IN ('ESSENTIAL_GOODS', 'AGRICULTURAL')
    
UNION ALL

SELECT 
    'UG',
    ptc.category_code,
    tt.id,
    '{}'::JSONB,
    10
FROM product_tax_categories ptc
CROSS JOIN tax_types tt
WHERE tt.tax_code = 'VAT_EXEMPT'
    AND ptc.category_code IN ('FINANCIAL_SERVICES', 'EDUCATION_SERVICES')
ON CONFLICT (country_code, product_category_code, tax_type_id) DO UPDATE SET
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
