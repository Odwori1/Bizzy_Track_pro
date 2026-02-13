-- Migration: 729_vat_returns_system_fixed.sql
-- Description: Complete VAT Returns System - NO GENERATED COLUMN CHAINS
-- Created: February 13, 2026

BEGIN;

-- ============================================================================
-- 1. DROP EXISTING TABLES
-- ============================================================================

DROP TABLE IF EXISTS vat_credit_carryforward CASCADE;
DROP TABLE IF EXISTS vat_return_status_history CASCADE;
DROP TABLE IF EXISTS vat_return_summary CASCADE;
DROP TABLE IF EXISTS vat_return_purchases CASCADE;
DROP TABLE IF EXISTS vat_return_sales CASCADE;
DROP TABLE IF EXISTS vat_returns CASCADE;

-- ============================================================================
-- 2. CREATE MAIN vat_returns TABLE (NO GENERATED COLUMN REFERENCES)
-- ============================================================================

CREATE TABLE vat_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Return identification
    return_number VARCHAR(50) UNIQUE NOT NULL,
    return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('monthly', 'quarterly')),
    
    -- Period details
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    filing_date DATE,
    
    -- Status workflow
    status VARCHAR(20) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'calculated', 'reviewed', 'submitted', 'paid', 'void', 'amended')),
    
    -- VAT calculations (URA Form 4) - SIMPLE COLUMNS, NO GENERATED REFERENCES
    total_sales_exclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_sales_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_sales_inclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    total_purchases_exclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_purchases_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_purchases_inclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    net_vat_payable DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Credit carried forward
    credit_brought_forward DECIMAL(15,2) DEFAULT 0,
    credit_carried_forward DECIMAL(15,2) DEFAULT 0,
    
    -- Penalties & interest
    late_filing_penalty DECIMAL(15,2) DEFAULT 0,
    late_payment_penalty DECIMAL(15,2) DEFAULT 0,
    interest_amount DECIMAL(15,2) DEFAULT 0,
    total_amount_due DECIMAL(15,2) DEFAULT 0,
    
    -- URA submission
    ura_receipt_number VARCHAR(100),
    ura_submission_response JSONB,
    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES users(id),
    
    -- Approval
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    
    -- Payment tracking
    paid_at TIMESTAMPTZ,
    paid_amount DECIMAL(15,2),
    payment_reference VARCHAR(100),
    
    -- Audit
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_period CHECK (period_end >= period_start),
    CONSTRAINT valid_dates CHECK (due_date >= period_end)
);

-- ============================================================================
-- 3. CREATE vat_return_sales TABLE
-- ============================================================================

CREATE TABLE vat_return_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    invoice_id UUID REFERENCES invoices(id),
    pos_transaction_id UUID REFERENCES pos_transactions(id),
    transaction_date DATE NOT NULL,
    
    customer_id UUID REFERENCES customers(id),
    customer_name VARCHAR(255),
    customer_tin VARCHAR(50),
    
    invoice_number VARCHAR(50),
    description TEXT,
    
    vat_category VARCHAR(30) NOT NULL 
        CHECK (vat_category IN ('standard_rated', 'zero_rated', 'exempt', 'import_services')),
    
    amount_exclusive DECIMAL(15,2) NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL,
    vat_amount DECIMAL(15,2) NOT NULL,
    amount_inclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    tax_type_id UUID REFERENCES tax_types(id),
    tax_type_code VARCHAR(20),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_vat_amount CHECK (vat_amount >= 0)
);

-- ============================================================================
-- 4. CREATE vat_return_purchases TABLE
-- ============================================================================

CREATE TABLE vat_return_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    purchase_order_id UUID REFERENCES purchase_orders(id),
    supplier_invoice_id UUID,
    transaction_date DATE NOT NULL,
    
    supplier_id UUID REFERENCES customers(id),
    supplier_name VARCHAR(255) NOT NULL,
    supplier_tin VARCHAR(50),
    
    invoice_number VARCHAR(100),
    description TEXT,
    
    vat_category VARCHAR(30) NOT NULL 
        CHECK (vat_category IN ('standard_rated', 'zero_rated', 'exempt', 'capital_goods', 'import')),
    
    amount_exclusive DECIMAL(15,2) NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL,
    vat_amount DECIMAL(15,2) NOT NULL,
    amount_inclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    vat_reclaimable BOOLEAN DEFAULT true,
    vat_reclaimed DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    tax_type_id UUID REFERENCES tax_types(id),
    tax_type_code VARCHAR(20),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_vat_amount CHECK (vat_amount >= 0)
);

-- ============================================================================
-- 5. CREATE vat_return_summary TABLE
-- ============================================================================

CREATE TABLE vat_return_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    line_number INTEGER NOT NULL,
    line_description VARCHAR(200) NOT NULL,
    
    sales_value DECIMAL(15,2) DEFAULT 0,
    vat_value DECIMAL(15,2) DEFAULT 0,
    purchases_value DECIMAL(15,2) DEFAULT 0,
    
    category VARCHAR(50),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vat_return_id, line_number)
);

-- ============================================================================
-- 6. CREATE vat_credit_carryforward TABLE
-- ============================================================================

CREATE TABLE vat_credit_carryforward (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    from_return_id UUID REFERENCES vat_returns(id),
    to_return_id UUID REFERENCES vat_returns(id),
    
    credit_amount DECIMAL(15,2) NOT NULL,
    utilized_amount DECIMAL(15,2) DEFAULT 0,
    remaining_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    expiry_date DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT positive_credit CHECK (credit_amount > 0)
);

-- ============================================================================
-- 7. CREATE STATUS HISTORY TABLE
-- ============================================================================

CREATE TABLE vat_return_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_vat_returns_business_id ON vat_returns(business_id);
CREATE INDEX idx_vat_returns_return_number ON vat_returns(return_number);
CREATE INDEX idx_vat_returns_period_start ON vat_returns(period_start);
CREATE INDEX idx_vat_returns_period_end ON vat_returns(period_end);
CREATE INDEX idx_vat_returns_status ON vat_returns(status);
CREATE INDEX idx_vat_returns_due_date ON vat_returns(due_date);

CREATE INDEX idx_vat_return_sales_return_id ON vat_return_sales(vat_return_id);
CREATE INDEX idx_vat_return_sales_invoice_id ON vat_return_sales(invoice_id);
CREATE INDEX idx_vat_return_sales_transaction_date ON vat_return_sales(transaction_date);
CREATE INDEX idx_vat_return_sales_vat_category ON vat_return_sales(vat_category);

CREATE INDEX idx_vat_return_purchases_return_id ON vat_return_purchases(vat_return_id);
CREATE INDEX idx_vat_return_purchases_supplier_id ON vat_return_purchases(supplier_id);
CREATE INDEX idx_vat_return_purchases_transaction_date ON vat_return_purchases(transaction_date);
CREATE INDEX idx_vat_return_purchases_vat_category ON vat_return_purchases(vat_category);

CREATE INDEX idx_vat_return_summary_return_id ON vat_return_summary(vat_return_id);
CREATE INDEX idx_vat_credit_business_id ON vat_credit_carryforward(business_id);
CREATE INDEX idx_vat_return_status_history_return_id ON vat_return_status_history(vat_return_id);

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_credit_carryforward ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY vat_returns_isolation_policy ON vat_returns
    USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY vat_return_sales_isolation_policy ON vat_return_sales
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_sales.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

CREATE POLICY vat_return_purchases_isolation_policy ON vat_return_purchases
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_purchases.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

CREATE POLICY vat_return_summary_isolation_policy ON vat_return_summary
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_summary.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

CREATE POLICY vat_credit_carryforward_isolation_policy ON vat_credit_carryforward
    USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY vat_return_status_history_isolation_policy ON vat_return_status_history
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_status_history.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- ============================================================================
-- 10. VAT RETURN NUMBERING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_vat_return_number(
    p_business_id UUID,
    p_period_start DATE
)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year VARCHAR(4);
    v_month VARCHAR(2);
    v_sequence INTEGER;
    v_return_number VARCHAR(50);
BEGIN
    v_year := EXTRACT(YEAR FROM p_period_start)::VARCHAR;
    v_month := LPAD(EXTRACT(MONTH FROM p_period_start)::VARCHAR, 2, '0');
    
    SELECT COALESCE(MAX(CAST(SPLIT_PART(return_number, '-', 4) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM vat_returns
    WHERE business_id = p_business_id
        AND return_number LIKE 'VAT-' || v_year || '-' || v_month || '-%';
    
    v_return_number := 'VAT-' || v_year || '-' || v_month || '-' || LPAD(v_sequence::VARCHAR, 3, '0');
    RETURN v_return_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vat_returns_updated_at
    BEFORE UPDATE ON vat_returns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vat_credit_carryforward_updated_at
    BEFORE UPDATE ON vat_credit_carryforward
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 12. VERIFICATION
-- ============================================================================

COMMIT;
