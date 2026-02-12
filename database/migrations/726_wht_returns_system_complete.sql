-- Migration: 726_wht_returns_system_complete.sql
-- Description: Complete WHT Returns Filing System (Phase 5)
-- Created: February 12, 2026
-- Dependencies: Requires migration 725 (WHT Certificates)

BEGIN;

-- ============================================================================
-- 1. ENHANCE EXISTING wht_returns TABLE (if it exists, else create)
-- ============================================================================

-- Drop if exists for clean slate
DROP TABLE IF EXISTS wht_return_amendments CASCADE;
DROP TABLE IF EXISTS wht_return_approvals CASCADE;
DROP TABLE IF EXISTS wht_return_payments CASCADE;
DROP TABLE IF EXISTS wht_return_items CASCADE;
DROP TABLE IF EXISTS wht_returns CASCADE;

-- ============================================================================
-- 2. CREATE MAIN wht_returns TABLE
-- ============================================================================

CREATE TABLE wht_returns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Return identification
    return_number VARCHAR(50) UNIQUE NOT NULL,
    return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('monthly', 'quarterly')),
    
    -- Period details
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    due_date DATE NOT NULL,
    tax_period VARCHAR(7) GENERATED ALWAYS AS (
        TO_CHAR(period_start, 'YYYY-MM')
    ) STORED,
    
    -- Status and workflow
    status VARCHAR(20) NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'calculated', 'pending_approval', 'approved', 'submitted', 'paid', 'void', 'amended')),
    
    -- Financial amounts
    total_wht_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_penalty DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_interest DECIMAL(15,2) NOT NULL DEFAULT 0,
    net_payable DECIMAL(15,2) GENERATED ALWAYS AS (
        total_wht_amount + total_penalty + total_interest
    ) STORED,
    
    -- URA submission
    ura_receipt_number VARCHAR(100),
    ura_submission_response JSONB,
    submitted_at TIMESTAMPTZ,
    submitted_by UUID REFERENCES users(id),
    
    -- Approval workflow
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    approval_notes TEXT,
    
    -- Payment tracking
    paid_at TIMESTAMPTZ,
    paid_amount DECIMAL(15,2),
    payment_reference VARCHAR(100),
    
    -- Audit trail
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    -- Constraints
    CONSTRAINT valid_period CHECK (period_end >= period_start),
    CONSTRAINT valid_dates CHECK (due_date >= period_end)
);

-- ============================================================================
-- 3. CREATE wht_return_items TABLE (Links certificates to returns)
-- ============================================================================

CREATE TABLE wht_return_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wht_return_id UUID NOT NULL REFERENCES wht_returns(id) ON DELETE CASCADE,
    certificate_id UUID NOT NULL REFERENCES withholding_tax_certificates(id),
    
    -- Denormalized certificate data (snapshot at time of return)
    supplier_id UUID NOT NULL REFERENCES customers(id),
    supplier_name VARCHAR(255) NOT NULL,
    supplier_tin VARCHAR(50),
    certificate_number VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    wht_rate DECIMAL(5,2) NOT NULL,
    wht_amount DECIMAL(15,2) NOT NULL,
    tax_type_code VARCHAR(20) NOT NULL,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure certificate only added once per return
    UNIQUE(wht_return_id, certificate_id)
);

-- ============================================================================
-- 4. CREATE wht_return_payments TABLE
-- ============================================================================

CREATE TABLE wht_return_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wht_return_id UUID NOT NULL REFERENCES wht_returns(id) ON DELETE CASCADE,
    
    -- Payment details
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_amount DECIMAL(15,2) NOT NULL CHECK (payment_amount > 0),
    payment_method VARCHAR(50) NOT NULL 
        CHECK (payment_method IN ('bank_transfer', 'mobile_money', 'cash', 'cheque', 'online')),
    reference_number VARCHAR(100),
    
    -- Bank details
    bank_account_id UUID REFERENCES bank_accounts(id),
    bank_name VARCHAR(100),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
    failure_reason TEXT,
    
    -- URA confirmation
    ura_payment_receipt VARCHAR(100),
    ura_confirmed_at TIMESTAMPTZ,
    
    -- Audit
    paid_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. CREATE wht_return_approvals TABLE (Multi-level approval)
-- ============================================================================

CREATE TABLE wht_return_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wht_return_id UUID NOT NULL REFERENCES wht_returns(id) ON DELETE CASCADE,
    
    -- Approval details
    approver_id UUID NOT NULL REFERENCES users(id),
    approval_level INTEGER NOT NULL CHECK (approval_level IN (1, 2, 3)),
    level_name VARCHAR(50) NOT NULL,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    comments TEXT,
    
    -- Timestamps
    action_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- One approval per level per return
    UNIQUE(wht_return_id, approval_level)
);

-- ============================================================================
-- 6. CREATE wht_return_amendments TABLE (Corrections)
-- ============================================================================

CREATE TABLE wht_return_amendments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_return_id UUID NOT NULL REFERENCES wht_returns(id),
    amended_return_id UUID REFERENCES wht_returns(id),
    
    -- Amendment details
    amendment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amendment_reason TEXT NOT NULL,
    amendment_type VARCHAR(30) NOT NULL 
        CHECK (amendment_type IN ('correction', 'additional', 'late_filing', 'objection')),
    
    -- Before/after values
    previous_amount DECIMAL(15,2) NOT NULL,
    new_amount DECIMAL(15,2) NOT NULL,
    difference_amount DECIMAL(15,2) GENERATED ALWAYS AS (new_amount - previous_amount) STORED,
    
    -- URA acknowledgement
    ura_amendment_receipt VARCHAR(100),
    
    -- Audit
    amended_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Notes
    notes TEXT
);

-- ============================================================================
-- 7. CREATE STATUS HISTORY TABLE (Audit trail)
-- ============================================================================

CREATE TABLE wht_return_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wht_return_id UUID NOT NULL REFERENCES wht_returns(id) ON DELETE CASCADE,
    
    old_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users(id),
    change_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 8. CREATE INDEXES (Performance)
-- ============================================================================

-- wht_returns indexes
CREATE INDEX idx_wht_returns_business_id ON wht_returns(business_id);
CREATE INDEX idx_wht_returns_return_number ON wht_returns(return_number);
CREATE INDEX idx_wht_returns_period_start ON wht_returns(period_start);
CREATE INDEX idx_wht_returns_period_end ON wht_returns(period_end);
CREATE INDEX idx_wht_returns_due_date ON wht_returns(due_date);
CREATE INDEX idx_wht_returns_status ON wht_returns(status);
CREATE INDEX idx_wht_returns_tax_period ON wht_returns(tax_period);
CREATE INDEX idx_wht_returns_submitted_at ON wht_returns(submitted_at);
CREATE INDEX idx_wht_returns_ura_receipt ON wht_returns(ura_receipt_number);

-- wht_return_items indexes
CREATE INDEX idx_wht_return_items_return_id ON wht_return_items(wht_return_id);
CREATE INDEX idx_wht_return_items_certificate_id ON wht_return_items(certificate_id);
CREATE INDEX idx_wht_return_items_supplier_id ON wht_return_items(supplier_id);
CREATE INDEX idx_wht_return_items_transaction_date ON wht_return_items(transaction_date);
CREATE INDEX idx_wht_return_items_tax_type ON wht_return_items(tax_type_code);

-- wht_return_payments indexes
CREATE INDEX idx_wht_return_payments_return_id ON wht_return_payments(wht_return_id);
CREATE INDEX idx_wht_return_payments_status ON wht_return_payments(status);
CREATE INDEX idx_wht_return_payments_payment_date ON wht_return_payments(payment_date);
CREATE INDEX idx_wht_return_payments_reference ON wht_return_payments(reference_number);

-- wht_return_approvals indexes
CREATE INDEX idx_wht_return_approvals_return_id ON wht_return_approvals(wht_return_id);
CREATE INDEX idx_wht_return_approvals_approver_id ON wht_return_approvals(approver_id);
CREATE INDEX idx_wht_return_approvals_status ON wht_return_approvals(status);

-- wht_return_amendments indexes
CREATE INDEX idx_wht_return_amendments_original_id ON wht_return_amendments(original_return_id);
CREATE INDEX idx_wht_return_amendments_amended_id ON wht_return_amendments(amended_return_id);
CREATE INDEX idx_wht_return_amendments_date ON wht_return_amendments(amendment_date);

-- wht_return_status_history indexes
CREATE INDEX idx_wht_return_status_history_return_id ON wht_return_status_history(wht_return_id);
CREATE INDEX idx_wht_return_status_history_created_at ON wht_return_status_history(created_at);

-- ============================================================================
-- 9. CREATE RLS POLICIES (Business Isolation)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE wht_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_return_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_return_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_return_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wht_return_status_history ENABLE ROW LEVEL SECURITY;

-- wht_returns: Direct business_id check
CREATE POLICY wht_returns_isolation_policy ON wht_returns
    USING (business_id = current_setting('app.current_business_id')::UUID);

-- wht_return_items: Through wht_returns
CREATE POLICY wht_return_items_isolation_policy ON wht_return_items
    USING (EXISTS (
        SELECT 1 FROM wht_returns wr
        WHERE wr.id = wht_return_items.wht_return_id
        AND wr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- wht_return_payments: Through wht_returns
CREATE POLICY wht_return_payments_isolation_policy ON wht_return_payments
    USING (EXISTS (
        SELECT 1 FROM wht_returns wr
        WHERE wr.id = wht_return_payments.wht_return_id
        AND wr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- wht_return_approvals: Through wht_returns
CREATE POLICY wht_return_approvals_isolation_policy ON wht_return_approvals
    USING (EXISTS (
        SELECT 1 FROM wht_returns wr
        WHERE wr.id = wht_return_approvals.wht_return_id
        AND wr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- wht_return_amendments: Through wht_returns
CREATE POLICY wht_return_amendments_isolation_policy ON wht_return_amendments
    USING (EXISTS (
        SELECT 1 FROM wht_returns wr
        WHERE wr.id = wht_return_amendments.original_return_id
        AND wr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- wht_return_status_history: Through wht_returns
CREATE POLICY wht_return_status_history_isolation_policy ON wht_return_status_history
    USING (EXISTS (
        SELECT 1 FROM wht_returns wr
        WHERE wr.id = wht_return_status_history.wht_return_id
        AND wr.business_id = current_setting('app.current_business_id')::UUID
    ));

-- ============================================================================
-- 10. CREATE RETURN NUMBERING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_wht_return_number(
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
    -- Extract year and month
    v_year := EXTRACT(YEAR FROM p_period_start)::VARCHAR;
    v_month := LPAD(EXTRACT(MONTH FROM p_period_start)::VARCHAR, 2, '0');
    
    -- Get next sequence for this business, year, month
    SELECT COALESCE(MAX(CAST(SPLIT_PART(return_number, '-', 5) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM wht_returns
    WHERE business_id = p_business_id
        AND return_number LIKE 'WHT-RET-' || v_year || '-' || v_month || '-%';
    
    -- Generate return number: WHT-RET-2026-02-001
    v_return_number := 'WHT-RET-' || v_year || '-' || v_month || '-' || LPAD(v_sequence::VARCHAR, 3, '0');
    
    RETURN v_return_number;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback: timestamp-based number
        v_return_number := 'WHT-RET-' || v_year || '-' || v_month || '-' || 
            LPAD(EXTRACT(EPOCH FROM NOW())::INTEGER % 1000::VARCHAR, 3, '0');
        RETURN v_return_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. CREATE FUNCTION TO GENERATE RETURN FROM CERTIFICATES
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_wht_return_from_certificates(
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
    v_total_wht DECIMAL(15,2);
BEGIN
    -- Generate return number
    v_return_number := generate_wht_return_number(p_business_id, p_period_start);
    
    -- Calculate due date (15th of following month)
    v_due_date := (p_period_end + INTERVAL '1 month')::DATE;
    v_due_date := DATE_TRUNC('month', v_due_date)::DATE + 14;
    
    -- Create return header
    INSERT INTO wht_returns (
        business_id,
        return_number,
        return_type,
        period_start,
        period_end,
        due_date,
        status,
        created_by
    ) VALUES (
        p_business_id,
        v_return_number,
        p_return_type,
        p_period_start,
        p_period_end,
        v_due_date,
        'draft',
        p_created_by
    ) RETURNING id INTO v_return_id;
    
    -- Insert items from certificates in period
    INSERT INTO wht_return_items (
        wht_return_id,
        certificate_id,
        supplier_id,
        supplier_name,
        supplier_tin,
        certificate_number,
        transaction_date,
        transaction_type,
        amount,
        wht_rate,
        wht_amount,
        tax_type_code
    )
    SELECT
        v_return_id,
        wc.id,
        wc.supplier_id,
        wc.supplier_name,
        wc.supplier_tin,
        wc.certificate_number,
        wc.transaction_date,
        wc.transaction_type,
        wc.service_amount,
        wc.withholding_rate,
        wc.withholding_amount,
        'WHT_SERVICES'  -- Default, should come from certificate items
    FROM withholding_tax_certificates wc
    WHERE wc.business_id = p_business_id
        AND wc.transaction_date BETWEEN p_period_start AND p_period_end
        AND wc.status NOT IN ('voided', 'cancelled');
    
    -- Calculate total WHT amount
    SELECT COALESCE(SUM(wht_amount), 0)
    INTO v_total_wht
    FROM wht_return_items
    WHERE wht_return_id = v_return_id;
    
    -- Update return with total
    UPDATE wht_returns
    SET total_wht_amount = v_total_wht,
        status = 'calculated',
        updated_at = NOW()
    WHERE id = v_return_id;
    
    -- Log status change
    INSERT INTO wht_return_status_history (
        wht_return_id,
        new_status,
        changed_by,
        change_reason
    ) VALUES (
        v_return_id,
        'calculated',
        p_created_by,
        'Return automatically generated from certificates'
    );
    
    RETURN v_return_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. CREATE FUNCTION TO SUBMIT RETURN TO URA (MOCK)
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_wht_return_to_ura(
    p_return_id UUID,
    p_submitted_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_return wht_returns%ROWTYPE;
    v_receipt_number VARCHAR(100);
    v_response JSONB;
BEGIN
    -- Get return
    SELECT * INTO v_return FROM wht_returns WHERE id = p_return_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Return not found';
    END IF;
    
    -- Mock URA submission (Phase 5.2 will implement real API)
    v_receipt_number := 'URA-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
        LPAD(FLOOR(RANDOM() * 10000)::INTEGER::VARCHAR, 4, '0');
    
    v_response := jsonb_build_object(
        'receipt_number', v_receipt_number,
        'submission_date', NOW(),
        'status', 'ACCEPTED',
        'message', 'Return accepted by URA',
        'mock_submission', true
    );
    
    -- Update return
    UPDATE wht_returns
    SET 
        status = 'submitted',
        ura_receipt_number = v_receipt_number,
        ura_submission_response = v_response,
        submitted_at = NOW(),
        submitted_by = p_submitted_by,
        updated_at = NOW()
    WHERE id = p_return_id;
    
    -- Log status change
    INSERT INTO wht_return_status_history (
        wht_return_id,
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
-- 13. CREATE FUNCTION TO CALCULATE PENALTIES
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_late_filing_penalty(
    p_return_id UUID
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_return wht_returns%ROWTYPE;
    v_days_late INTEGER;
    v_penalty DECIMAL(15,2);
BEGIN
    SELECT * INTO v_return FROM wht_returns WHERE id = p_return_id;
    
    IF v_return.submitted_at IS NULL THEN
        v_days_late := EXTRACT(DAY FROM NOW() - v_return.due_date);
    ELSE
        v_days_late := EXTRACT(DAY FROM v_return.submitted_at - v_return.due_date);
    END IF;
    
    IF v_days_late <= 0 THEN
        v_penalty := 0;
    ELSE
        -- Uganda penalty: 2% per month or part thereof
        v_penalty := v_return.total_wht_amount * (0.02 * CEIL(v_days_late / 30.0));
    END IF;
    
    UPDATE wht_returns
    SET total_penalty = v_penalty,
        net_payable = v_return.total_wht_amount + v_penalty + v_return.total_interest
    WHERE id = p_return_id;
    
    RETURN v_penalty;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. CREATE TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wht_returns_updated_at
    BEFORE UPDATE ON wht_returns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wht_return_payments_updated_at
    BEFORE UPDATE ON wht_return_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wht_return_approvals_updated_at
    BEFORE UPDATE ON wht_return_approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 15. VERIFICATION QUERIES (Run after migration)
-- ============================================================================

/*
-- Verify tables created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'wht_return%'
ORDER BY table_name;

-- Verify RLS enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE tablename LIKE 'wht_return%';

-- Test return generation
SELECT generate_wht_return_from_certificates(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::UUID,
    '2026-02-01'::DATE,
    '2026-02-28'::DATE,
    'monthly',
    (SELECT id FROM users LIMIT 1)
);

-- Check created return
SELECT return_number, period_start, period_end, total_wht_amount, status
FROM wht_returns
ORDER BY created_at DESC
LIMIT 1;

-- Test URA submission
SELECT submit_wht_return_to_ura(
    (SELECT id FROM wht_returns ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM users LIMIT 1)
);
*/

COMMIT;
