-- Migration: 729_vat_returns_system.sql
-- Description: Complete VAT Returns System (URA Form 4)
-- Created: February 13, 2026
-- Dependencies: Requires migrations 701-728

BEGIN;

-- ============================================================================
-- 1. DROP EXISTING TABLES (CLEAN SLATE)
-- ============================================================================

DROP TABLE IF EXISTS vat_credit_carryforward CASCADE;
DROP TABLE IF EXISTS vat_return_summary CASCADE;
DROP TABLE IF EXISTS vat_return_purchases CASCADE;
DROP TABLE IF EXISTS vat_return_sales CASCADE;
DROP TABLE IF EXISTS vat_returns CASCADE;

-- ============================================================================
-- 2. CREATE MAIN vat_returns TABLE
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
    
    -- VAT calculations (URA Form 4)
    -- Output tax (sales)
    total_sales_exclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_sales_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_sales_inclusive DECIMAL(15,2) GENERATED ALWAYS AS (total_sales_exclusive + total_sales_vat) STORED,
    
    -- Input tax (purchases)
    total_purchases_exclusive DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_purchases_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_purchases_inclusive DECIMAL(15,2) GENERATED ALWAYS AS (total_purchases_exclusive + total_purchases_vat) STORED,
    
    -- Net VAT position
    net_vat_payable DECIMAL(15,2) GENERATED ALWAYS AS (total_sales_vat - total_purchases_vat) STORED,
    
    -- Credit carried forward
    credit_brought_forward DECIMAL(15,2) DEFAULT 0,
    credit_carried_forward DECIMAL(15,2) DEFAULT 0,
    
    -- Penalties & interest
    late_filing_penalty DECIMAL(15,2) DEFAULT 0,
    late_payment_penalty DECIMAL(15,2) DEFAULT 0,
    interest_amount DECIMAL(15,2) DEFAULT 0,
    total_amount_due DECIMAL(15,2) GENERATED ALWAYS AS (
        GREATEST(net_vat_payable - credit_brought_forward, 0) + 
        late_filing_penalty + late_payment_penalty + interest_amount
    ) STORED,
    
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
-- 3. CREATE vat_return_sales TABLE (Output VAT)
-- ============================================================================

CREATE TABLE vat_return_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    -- Source document
    invoice_id UUID REFERENCES invoices(id),
    pos_transaction_id UUID REFERENCES pos_transactions(id),
    transaction_date DATE NOT NULL,
    
    -- Customer details
    customer_id UUID REFERENCES customers(id),
    customer_name VARCHAR(255),
    customer_tin VARCHAR(50),
    
    -- Invoice details
    invoice_number VARCHAR(50),
    description TEXT,
    
    -- VAT categories (URA Form 4 classifications)
    vat_category VARCHAR(30) NOT NULL 
        CHECK (vat_category IN (
            'standard_rated',    -- 20% VAT
            'zero_rated',        -- 0% VAT
            'exempt',            -- No VAT
            'import_services'    -- Reverse charge
        )),
    
    -- Amounts
    amount_exclusive DECIMAL(15,2) NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL,
    vat_amount DECIMAL(15,2) NOT NULL,
    amount_inclusive DECIMAL(15,2) GENERATED ALWAYS AS (amount_exclusive + vat_amount) STORED,
    
    -- Tax details
    tax_type_id UUID REFERENCES tax_types(id),
    tax_type_code VARCHAR(20),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_vat_amount CHECK (vat_amount >= 0)
);

-- ============================================================================
-- 4. CREATE vat_return_purchases TABLE (Input VAT)
-- ============================================================================

CREATE TABLE vat_return_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    -- Source document
    purchase_order_id UUID REFERENCES purchase_orders(id),
    supplier_invoice_id UUID,
    transaction_date DATE NOT NULL,
    
    -- Supplier details
    supplier_id UUID REFERENCES customers(id),
    supplier_name VARCHAR(255) NOT NULL,
    supplier_tin VARCHAR(50),
    
    -- Invoice details
    invoice_number VARCHAR(100),
    description TEXT,
    
    -- VAT categories
    vat_category VARCHAR(30) NOT NULL 
        CHECK (vat_category IN (
            'standard_rated',    -- 20% VAT, reclaimable
            'zero_rated',        -- 0% VAT
            'exempt',            -- No VAT reclaim
            'capital_goods',     -- Special rules
            'import'            -- Import VAT
        )),
    
    -- Amounts
    amount_exclusive DECIMAL(15,2) NOT NULL,
    vat_rate DECIMAL(5,2) NOT NULL,
    vat_amount DECIMAL(15,2) NOT NULL,
    amount_inclusive DECIMAL(15,2) GENERATED ALWAYS AS (amount_exclusive + vat_amount) STORED,
    
    -- Reclaimable VAT (may be restricted)
    vat_reclaimable BOOLEAN DEFAULT true,
    vat_reclaimed DECIMAL(15,2) GENERATED ALWAYS AS (
        CASE WHEN vat_reclaimable THEN vat_amount ELSE 0 END
    ) STORED,
    
    -- Tax details
    tax_type_id UUID REFERENCES tax_types(id),
    tax_type_code VARCHAR(20),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_vat_amount CHECK (vat_amount >= 0)
);

-- ============================================================================
-- 5. CREATE vat_return_summary TABLE (URA Form 4 Line Items)
-- ============================================================================

CREATE TABLE vat_return_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vat_return_id UUID NOT NULL REFERENCES vat_returns(id) ON DELETE CASCADE,
    
    -- URA Form 4 Line Numbers
    line_number INTEGER NOT NULL,
    line_description VARCHAR(200) NOT NULL,
    
    -- Values
    sales_value DECIMAL(15,2) DEFAULT 0,
    vat_value DECIMAL(15,2) DEFAULT 0,
    purchases_value DECIMAL(15,2) DEFAULT 0,
    
    -- Classification
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
    
    -- Period tracking
    from_return_id UUID REFERENCES vat_returns(id),
    to_return_id UUID REFERENCES vat_returns(id),
    
    -- Credit amount
    credit_amount DECIMAL(15,2) NOT NULL,
    
    -- Status
    utilized_amount DECIMAL(15,2) DEFAULT 0,
    remaining_amount DECIMAL(15,2) GENERATED ALWAYS AS (credit_amount - utilized_amount) STORED,
    expiry_date DATE,
    
    -- Audit
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

-- vat_returns indexes
CREATE INDEX idx_vat_returns_business_id ON vat_returns(business_id);
CREATE INDEX idx_vat_returns_return_number ON vat_returns(return_number);
CREATE INDEX idx_vat_returns_period_start ON vat_returns(period_start);
CREATE INDEX idx_vat_returns_period_end ON vat_returns(period_end);
CREATE INDEX idx_vat_returns_status ON vat_returns(status);
CREATE INDEX idx_vat_returns_due_date ON vat_returns(due_date);
CREATE INDEX idx_vat_returns_submitted_at ON vat_returns(submitted_at);

-- vat_return_sales indexes
CREATE INDEX idx_vat_return_sales_return_id ON vat_return_sales(vat_return_id);
CREATE INDEX idx_vat_return_sales_invoice_id ON vat_return_sales(invoice_id);
CREATE INDEX idx_vat_return_sales_transaction_date ON vat_return_sales(transaction_date);
CREATE INDEX idx_vat_return_sales_vat_category ON vat_return_sales(vat_category);

-- vat_return_purchases indexes
CREATE INDEX idx_vat_return_purchases_return_id ON vat_return_purchases(vat_return_id);
CREATE INDEX idx_vat_return_purchases_supplier_id ON vat_return_purchases(supplier_id);
CREATE INDEX idx_vat_return_purchases_transaction_date ON vat_return_purchases(transaction_date);
CREATE INDEX idx_vat_return_purchases_vat_category ON vat_return_purchases(vat_category);

-- vat_return_summary indexes
CREATE INDEX idx_vat_return_summary_return_id ON vat_return_summary(vat_return_id);
CREATE INDEX idx_vat_return_summary_line_number ON vat_return_summary(line_number);

-- vat_credit_carryforward indexes
CREATE INDEX idx_vat_credit_business_id ON vat_credit_carryforward(business_id);
CREATE INDEX idx_vat_credit_expiry ON vat_credit_carryforward(expiry_date);

-- vat_return_status_history indexes
CREATE INDEX idx_vat_return_status_history_return_id ON vat_return_status_history(vat_return_id);
CREATE INDEX idx_vat_return_status_history_created_at ON vat_return_status_history(created_at);

-- ============================================================================
-- 9. RLS POLICIES (Business Isolation)
-- ============================================================================

-- Enable RLS
ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_credit_carryforward ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_return_status_history ENABLE ROW LEVEL SECURITY;

-- vat_returns policy
CREATE POLICY vat_returns_isolation_policy ON vat_returns
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- vat_return_sales policy (through return)
CREATE POLICY vat_return_sales_isolation_policy ON vat_return_sales
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_sales.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- vat_return_purchases policy (through return)
CREATE POLICY vat_return_purchases_isolation_policy ON vat_return_purchases
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_purchases.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- vat_return_summary policy (through return)
CREATE POLICY vat_return_summary_isolation_policy ON vat_return_summary
    USING (EXISTS (
        SELECT 1 FROM vat_returns vr
        WHERE vr.id = vat_return_summary.vat_return_id
        AND vr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- vat_credit_carryforward policy
CREATE POLICY vat_credit_carryforward_isolation_policy ON vat_credit_carryforward
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- vat_return_status_history policy (through return)
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
    
    SELECT COALESCE(MAX(CAST(SPLIT_PART(return_number, '-', 5) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM vat_returns
    WHERE business_id = p_business_id
        AND return_number LIKE 'VAT-' || v_year || '-' || v_month || '-%';
    
    v_return_number := 'VAT-' || v_year || '-' || v_month || '-' || LPAD(v_sequence::VARCHAR, 3, '0');
    RETURN v_return_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. GENERATE VAT RETURN FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_vat_return(
    p_business_id UUID,
    p_period_start DATE,
    p_period_end DATE,
    p_return_type VARCHAR(20),
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_return_id UUID;
    v_return_number VARCHAR(50);
    v_due_date DATE;
    v_sales_vat DECIMAL(15,2);
    v_purchases_vat DECIMAL(15,2);
    v_credit_bf DECIMAL(15,2);
BEGIN
    -- Generate return number
    v_return_number := generate_vat_return_number(p_business_id, p_period_start);
    
    -- Calculate due date (15th of following month)
    v_due_date := (p_period_end + INTERVAL '1 month')::DATE;
    v_due_date := DATE_TRUNC('month', v_due_date)::DATE + 14;
    
    -- Get credit brought forward
    SELECT COALESCE(SUM(remaining_amount), 0)
    INTO v_credit_bf
    FROM vat_credit_carryforward
    WHERE business_id = p_business_id
        AND remaining_amount > 0
        AND (expiry_date IS NULL OR expiry_date > NOW());
    
    -- Create return header
    INSERT INTO vat_returns (
        business_id,
        return_number,
        return_type,
        period_start,
        period_end,
        due_date,
        status,
        credit_brought_forward,
        created_by
    ) VALUES (
        p_business_id,
        v_return_number,
        p_return_type,
        p_period_start,
        p_period_end,
        v_due_date,
        'draft',
        v_credit_bf,
        p_created_by
    ) RETURNING id INTO v_return_id;
    
    -- Insert sales (output VAT) from invoices
    INSERT INTO vat_return_sales (
        vat_return_id,
        invoice_id,
        transaction_date,
        customer_id,
        customer_name,
        customer_tin,
        invoice_number,
        description,
        vat_category,
        amount_exclusive,
        vat_rate,
        vat_amount,
        tax_type_id,
        tax_type_code
    )
    SELECT
        v_return_id,
        i.id,
        i.invoice_date,
        i.customer_id,
        c.company_name,
        c.tax_number,
        i.invoice_number,
        'Sales Invoice',
        CASE 
            WHEN ptc.category_code = 'STANDARD_GOODS' THEN 'standard_rated'
            WHEN ptc.category_code = 'EXPORT' THEN 'zero_rated'
            WHEN ptc.category_code = 'ESSENTIAL_GOODS' THEN 'zero_rated'
            WHEN ptc.category_code = 'FINANCIAL_SERVICES' THEN 'exempt'
            ELSE 'standard_rated'
        END,
        i.total_amount,
        COALESCE(tt.tax_rate, 20.00),
        i.tax_amount,
        tt.id,
        tt.tax_code
    FROM invoices i
    LEFT JOIN customers c ON i.customer_id = c.id
    LEFT JOIN transaction_taxes tt ON i.id = tt.invoice_id
    LEFT JOIN product_tax_categories ptc ON tt.product_category_code = ptc.category_code
    WHERE i.business_id = p_business_id
        AND i.invoice_date BETWEEN p_period_start AND p_period_end
        AND i.status != 'cancelled'
        AND i.invoice_type = 'sale';
    
    -- Insert purchases (input VAT)
    INSERT INTO vat_return_purchases (
        vat_return_id,
        purchase_order_id,
        transaction_date,
        supplier_id,
        supplier_name,
        supplier_tin,
        invoice_number,
        description,
        vat_category,
        amount_exclusive,
        vat_rate,
        vat_amount,
        vat_reclaimable,
        tax_type_id,
        tax_type_code
    )
    SELECT
        v_return_id,
        po.id,
        po.order_date,
        po.supplier_id,
        s.company_name,
        s.tax_number,
        po.reference_number,
        'Purchase Order',
        'standard_rated',
        po.total_amount,
        20.00,
        po.total_amount * 0.20,
        true,
        tt.id,
        tt.tax_code
    FROM purchase_orders po
    LEFT JOIN customers s ON po.supplier_id = s.id
    LEFT JOIN transaction_taxes tt ON po.id = tt.purchase_order_id
    WHERE po.business_id = p_business_id
        AND po.order_date BETWEEN p_period_start AND p_period_end
        AND po.status = 'received';
    
    -- Calculate totals
    SELECT COALESCE(SUM(vat_amount), 0)
    INTO v_sales_vat
    FROM vat_return_sales
    WHERE vat_return_id = v_return_id;
    
    SELECT COALESCE(SUM(vat_reclaimed), 0)
    INTO v_purchases_vat
    FROM vat_return_purchases
    WHERE vat_return_id = v_return_id;
    
    -- Update return with totals
    UPDATE vat_returns
    SET 
        total_sales_exclusive = COALESCE((SELECT SUM(amount_exclusive) FROM vat_return_sales WHERE vat_return_id = v_return_id), 0),
        total_sales_vat = v_sales_vat,
        total_purchases_exclusive = COALESCE((SELECT SUM(amount_exclusive) FROM vat_return_purchases WHERE vat_return_id = v_return_id), 0),
        total_purchases_vat = v_purchases_vat,
        status = 'calculated',
        updated_at = NOW()
    WHERE id = v_return_id;
    
    -- Insert URA Form 4 summary lines
    INSERT INTO vat_return_summary (vat_return_id, line_number, line_description, sales_value, vat_value) VALUES
        (v_return_id, 1, 'Standard rated supplies (20%)', 
            (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_sales WHERE vat_return_id = v_return_id AND vat_category = 'standard_rated'),
            (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_return_sales WHERE vat_return_id = v_return_id AND vat_category = 'standard_rated')),
        (v_return_id, 2, 'Zero rated supplies (0%)',
            (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_sales WHERE vat_return_id = v_return_id AND vat_category = 'zero_rated'), 0),
        (v_return_id, 3, 'Exempt supplies',
            (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_sales WHERE vat_return_id = v_return_id AND vat_category = 'exempt'), 0);
    
    INSERT INTO vat_return_summary (vat_return_id, line_number, line_description, purchases_value, vat_value) VALUES
        (v_return_id, 4, 'Standard rated purchases (20%)',
            (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_purchases WHERE vat_return_id = v_return_id AND vat_category = 'standard_rated'),
            (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_return_purchases WHERE vat_return_id = v_return_id AND vat_category = 'standard_rated')),
        (v_return_id, 5, 'Capital goods purchases',
            (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_purchases WHERE vat_return_id = v_return_id AND vat_category = 'capital_goods'),
            (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_return_purchases WHERE vat_return_id = v_return_id AND vat_category = 'capital_goods')),
        (v_return_id, 6, 'Import VAT',
            (SELECT COALESCE(SUM(amount_exclusive), 0) FROM vat_return_purchases WHERE vat_return_id = v_return_id AND vat_category = 'import'),
            (SELECT COALESCE(SUM(vat_amount), 0) FROM vat_return_purchases WHERE vat_return_id = v_return_id AND vat_category = 'import'));
    
    -- Log status change
    INSERT INTO vat_return_status_history (
        vat_return_id,
        new_status,
        changed_by,
        change_reason
    ) VALUES (
        v_return_id,
        'calculated',
        p_created_by,
        'VAT return automatically generated from invoices and purchases'
    );
    
    RETURN v_return_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. SUBMIT VAT RETURN TO URA (MOCK)
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_vat_return_to_ura(
    p_return_id UUID,
    p_submitted_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_return vat_returns%ROWTYPE;
    v_receipt_number VARCHAR(100);
    v_response JSONB;
BEGIN
    SELECT * INTO v_return FROM vat_returns WHERE id = p_return_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'VAT return not found';
    END IF;
    
    -- Mock URA submission
    v_receipt_number := 'VAT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
        LPAD(FLOOR(RANDOM() * 10000)::INTEGER::VARCHAR, 4, '0');
    
    v_response := jsonb_build_object(
        'receipt_number', v_receipt_number,
        'submission_date', NOW(),
        'status', 'ACCEPTED',
        'form_type', 'URA Form 4',
        'period', TO_CHAR(v_return.period_start, 'YYYY-MM'),
        'net_vat', v_return.net_vat_payable,
        'message', 'VAT return accepted by URA',
        'mock_submission', true
    );
    
    UPDATE vat_returns
    SET 
        status = 'submitted',
        ura_receipt_number = v_receipt_number,
        ura_submission_response = v_response,
        submitted_at = NOW(),
        submitted_by = p_submitted_by,
        filing_date = NOW(),
        updated_at = NOW()
    WHERE id = p_return_id;
    
    INSERT INTO vat_return_status_history (
        vat_return_id,
        old_status,
        new_status,
        changed_by,
        change_reason
    ) VALUES (
        p_return_id,
        v_return.status,
        'submitted',
        p_submitted_by,
        'Submitted to URA, Receipt: ' || v_receipt_number
    );
    
    RETURN v_response;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. UPDATE UPDATED_AT TRIGGER
-- ============================================================================

CREATE TRIGGER update_vat_returns_updated_at
    BEFORE UPDATE ON vat_returns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vat_credit_carryforward_updated_at
    BEFORE UPDATE ON vat_credit_carryforward
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 14. INSERT URA FORM 4 DEFAULT TEMPLATE
-- ============================================================================

INSERT INTO wht_certificate_templates (
    business_id,
    template_name,
    template_type,
    language,
    header_content,
    body_content,
    footer_content,
    styles,
    is_active,
    is_default
)
SELECT 
    b.id,
    'URA Form 4 - VAT Return',
    'URA_FORM_4',
    'en',
    '<div style="text-align: center; font-family: Arial, sans-serif;">
        <h1>UGANDA REVENUE AUTHORITY</h1>
        <h2>VALUE ADDED TAX RETURN</h2>
        <h3>FORM 4</h3>
        <hr>
        <p><strong>Tax Period:</strong> {{period_start}} to {{period_end}}</p>
        <p><strong>Due Date:</strong> {{due_date}}</p>
    </div>',
    '<div style="font-family: Arial, sans-serif;">
        <h3>PART A: TAXPAYER DETAILS</h3>
        <table style="width: 100%;">
            <tr><td><strong>Name:</strong></td><td>{{business_name}}</td></tr>
            <tr><td><strong>TIN:</strong></td><td>{{business_tin}}</td></tr>
            <tr><td><strong>Address:</strong></td><td>{{business_address}}</td></tr>
        </table>
        
        <h3>PART B: OUTPUT VAT (SALES)</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #eee;">
                    <th style="border: 1px solid #000; padding: 8px;">Description</th>
                    <th style="border: 1px solid #000; padding: 8px;">Value (UGX)</th>
                    <th style="border: 1px solid #000; padding: 8px;">VAT (UGX)</th>
                </tr>
            </thead>
            <tbody>
                {{#summary_lines}}
                <tr>
                    <td style="border: 1px solid #000; padding: 8px;">{{line_description}}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: right;">{{sales_value}}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: right;">{{vat_value}}</td>
                </tr>
                {{/summary_lines}}
            </tbody>
        </table>
        
        <h3>PART C: INPUT VAT (PURCHASES)</h3>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #eee;">
                    <th style="border: 1px solid #000; padding: 8px;">Description</th>
                    <th style="border: 1px solid #000; padding: 8px;">Value (UGX)</th>
                    <th style="border: 1px solid #000; padding: 8px;">VAT (UGX)</th>
                </tr>
            </thead>
            <tbody>
                {{#purchase_lines}}
                <tr>
                    <td style="border: 1px solid #000; padding: 8px;">{{line_description}}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: right;">{{purchases_value}}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: right;">{{vat_value}}</td>
                </tr>
                {{/purchase_lines}}
            </tbody>
        </table>
        
        <h3>PART D: VAT SUMMARY</h3>
        <table style="width: 100%;">
            <tr><td><strong>Total Output VAT:</strong></td><td style="text-align: right;">{{total_sales_vat}}</td></tr>
            <tr><td><strong>Total Input VAT:</strong></td><td style="text-align: right;">{{total_purchases_vat}}</td></tr>
            <tr><td><strong>Credit Brought Forward:</strong></td><td style="text-align: right;">{{credit_brought_forward}}</td></tr>
            <tr style="font-weight: bold; background: #f0f0f0;">
                <td><strong>NET VAT PAYABLE:</strong></td>
                <td style="text-align: right; font-size: 14px;"><strong>{{net_vat_payable}} UGX</strong></td>
            </tr>
        </table>
    </div>',
    '<div style="font-family: Arial, sans-serif; font-size: 10px; text-align: center; margin-top: 20px;">
        <p><strong>URA Receipt Number:</strong> {{ura_receipt_number}}</p>
        <p><strong>Date Submitted:</strong> {{submitted_at}}</p>
        <p><em>This is a computer-generated document. No signature required.</em></p>
        <p>Generated by BizzyTrack Pro Tax System</p>
    </div>',
    '{"fontFamily": "Arial", "fontSize": "11px", "margin": "30px"}',
    true,
    false
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM wht_certificate_templates wt 
    WHERE wt.business_id = b.id AND wt.template_type = 'URA_FORM_4'
);

COMMIT;

-- ============================================================================
-- 15. VERIFICATION QUERY
-- ============================================================================

/*
SELECT 'Tables created successfully' as status;
SELECT tablename FROM pg_tables WHERE tablename LIKE 'vat_%';
SELECT proname FROM pg_proc WHERE proname LIKE '%vat%';
*/
