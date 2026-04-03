-- ============================================================================
-- MIGRATION: 1011_refund_system.sql
-- Purpose: Add refund system with full accounting integration
-- Follows patterns from: 032_create_accounting_foundation.sql, 1003_discount_accounting_additions_fixed.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REFUNDS TABLE (Core refund tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    refund_number VARCHAR(50) NOT NULL,
    
    -- Original transaction details
    original_transaction_id UUID NOT NULL,
    original_transaction_type VARCHAR(20) NOT NULL CHECK (original_transaction_type IN ('POS', 'INVOICE')),
    
    -- Refund details
    refund_type VARCHAR(20) NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL', 'ITEM')),
    refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT_NOTE', 'MOBILE_MONEY')),
    
    -- Financial breakdown
    subtotal_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    discount_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_refunded NUMERIC(15,2) NOT NULL DEFAULT 0,
    
    -- Accounting integration (follows discount pattern)
    journal_entry_id UUID REFERENCES journal_entries(id),
    
    -- Approval workflow (follows discount pattern)
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'VOID')),
    approval_id UUID REFERENCES discount_approvals(id),
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_threshold_amount NUMERIC(15,2),
    
    -- Reason and notes
    refund_reason TEXT NOT NULL,
    notes TEXT,
    
    -- Audit trail
    created_by UUID NOT NULL REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    voided_by UUID REFERENCES users(id),
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT refunds_business_number_unique UNIQUE (business_id, refund_number),
    CONSTRAINT refunds_amount_positive CHECK (total_refunded > 0)
);

-- Indexes (follow naming pattern from your system)
CREATE INDEX idx_refunds_business_id ON refunds(business_id);
CREATE INDEX idx_refunds_original_transaction ON refunds(original_transaction_id, original_transaction_type);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_journal_entry ON refunds(journal_entry_id);
CREATE INDEX idx_refunds_approval ON refunds(approval_id);
CREATE INDEX idx_refunds_created_at ON refunds(created_at);

-- ============================================================================
-- 2. REFUND ITEMS TABLE (Line-level tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS refund_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Original line item reference
    original_line_item_id UUID NOT NULL,
    original_line_type VARCHAR(20) NOT NULL CHECK (original_line_type IN ('POS_ITEM', 'INVOICE_LINE')),
    
    -- Item details
    product_id UUID,
    service_id UUID,
    item_name VARCHAR(200) NOT NULL,
    quantity_refunded NUMERIC(10,2) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    
    -- Financial breakdown
    subtotal_refunded NUMERIC(15,2) NOT NULL,
    discount_refunded NUMERIC(15,2) DEFAULT 0,
    tax_refunded NUMERIC(15,2) DEFAULT 0,
    total_refunded NUMERIC(15,2) NOT NULL,
    
    -- Links to other systems (follows discount pattern)
    discount_allocation_line_id UUID REFERENCES discount_allocation_lines(id),
    
    -- Reason
    reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT refund_items_quantity_positive CHECK (quantity_refunded > 0)
);

CREATE INDEX idx_refund_items_refund_id ON refund_items(refund_id);
CREATE INDEX idx_refund_items_original_line ON refund_items(original_line_item_id, original_line_type);

-- ============================================================================
-- 3. ENHANCE EXISTING TABLES (Follows pattern from 1003 migration)
-- ============================================================================

-- Add refund tracking to POS transactions
ALTER TABLE pos_transactions 
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PARTIAL', 'FULL', 'CANCELLED'));

-- Add refund tracking to invoices
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PARTIAL', 'FULL', 'CANCELLED'));

-- Add refund links to discount allocations (follows reversal pattern from discountAccountingService)
ALTER TABLE discount_allocations 
ADD COLUMN IF NOT EXISTS original_allocation_id UUID REFERENCES discount_allocations(id),
ADD COLUMN IF NOT EXISTS is_refund_reversal BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS refund_id UUID REFERENCES refunds(id);

-- ============================================================================
-- 4. ADD REFUND ACCOUNTS TO CHART OF ACCOUNTS (follows pattern from 032 migration)
-- ============================================================================
-- This will be handled by the business setup function below

-- ============================================================================
-- 5. REFUND NUMBER GENERATOR FUNCTION (follows pattern from discount system)
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_refund_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year_prefix VARCHAR(4);
    v_sequence_num INTEGER;
    v_refund_number VARCHAR(50);
BEGIN
    v_year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(refund_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence_num
    FROM refunds
    WHERE business_id = p_business_id 
      AND refund_number LIKE 'RF-' || v_year_prefix || '-%';
    
    v_refund_number := 'RF-' || v_year_prefix || '-' || LPAD(v_sequence_num::TEXT, 6, '0');
    RETURN v_refund_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. FUNCTION TO SETUP REFUND ACCOUNTS FOR NEW BUSINESS
-- ============================================================================
CREATE OR REPLACE FUNCTION setup_business_refund_accounts(p_business_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Add refund-specific accounts (follows pattern from 032 migration)
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, created_by)
    VALUES 
        (p_business_id, '4150', 'Sales Returns & Allowances', 'revenue', p_user_id),
        (p_business_id, '2150', 'Refund Liability', 'liability', p_user_id),
        (p_business_id, '1115', 'Credit Notes Receivable', 'asset', p_user_id)
    ON CONFLICT (business_id, account_code) DO NOTHING;
    
    RAISE NOTICE 'Refund accounts setup for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. FUNCTION TO CREATE REFUND JOURNAL ENTRY (CORE ACCOUNTING LOGIC)
-- ============================================================================
CREATE OR REPLACE FUNCTION create_refund_journal_entry(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_refund_number VARCHAR(50);
    v_total_refunded NUMERIC(15,2);
    v_subtotal_refunded NUMERIC(15,2);
    v_discount_refunded NUMERIC(15,2);
    v_tax_refunded NUMERIC(15,2);
    v_original_transaction_id UUID;
    v_original_transaction_type VARCHAR(20);
    v_refund_method VARCHAR(20);
    v_journal_entry_id UUID;
    v_cash_account_id UUID;
    v_sales_returns_account_id UUID;
    v_discount_account_id UUID;
    v_tax_account_id UUID;
    v_revenue_account_id UUID;
    v_reference_number VARCHAR(50);
BEGIN
    -- Get refund details
    SELECT 
        business_id, refund_number, total_refunded, subtotal_refunded,
        discount_refunded, tax_refunded, original_transaction_id,
        original_transaction_type, refund_method
    INTO 
        v_business_id, v_refund_number, v_total_refunded, v_subtotal_refunded,
        v_discount_refunded, v_tax_refunded, v_original_transaction_id,
        v_original_transaction_type, v_refund_method
    FROM refunds 
    WHERE id = p_refund_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found: %', p_refund_id;
    END IF;
    
    -- Get account IDs (follows pattern from discountAccountingService)
    -- Cash/Bank account based on refund method
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id 
      AND account_code = CASE v_refund_method
          WHEN 'CASH' THEN '1110'
          WHEN 'CARD' THEN '1120'
          WHEN 'MOBILE_MONEY' THEN '1130'
          ELSE '1120' -- Bank Account default
      END
      AND is_active = true
    LIMIT 1;
    
    -- Sales Returns account (contra revenue)
    SELECT id INTO v_sales_returns_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '4150' AND is_active = true;
    
    -- Discount account (follows discount pattern)
    SELECT id INTO v_discount_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '4110' AND is_active = true;
    
    -- Tax account (if tax refunded)
    IF v_tax_refunded > 0 THEN
        SELECT id INTO v_tax_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id AND account_code = '2120' AND is_active = true;
    END IF;
    
    -- Generate reference number
    v_reference_number := 'REF-' || v_refund_number;
    
    -- Create journal entry
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type,
        reference_id, description, total_amount, status, created_by, posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        v_reference_number,
        'REFUND',
        p_refund_id,
        'Refund: ' || v_refund_number || ' for ' || v_original_transaction_type || ' transaction',
        v_total_refunded,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Create debit line: Sales Returns (reduces revenue)
    PERFORM create_journal_entry_line(
        v_journal_entry_id, v_business_id, v_sales_returns_account_id,
        'debit', v_subtotal_refunded, 'Refunded sales amount'
    );
    
    -- Create debit line: Discounts (if any)
    IF v_discount_refunded > 0 THEN
        PERFORM create_journal_entry_line(
            v_journal_entry_id, v_business_id, v_discount_account_id,
            'debit', v_discount_refunded, 'Refunded discount amount'
        );
    END IF;
    
    -- Create debit line: Tax (if any)
    IF v_tax_refunded > 0 AND v_tax_account_id IS NOT NULL THEN
        PERFORM create_journal_entry_line(
            v_journal_entry_id, v_business_id, v_tax_account_id,
            'debit', v_tax_refunded, 'Refunded tax amount'
        );
    END IF;
    
    -- Create credit line: Cash/Bank
    PERFORM create_journal_entry_line(
        v_journal_entry_id, v_business_id, v_cash_account_id,
        'credit', v_total_refunded, 'Refund payment to customer'
    );
    
    -- Update refund with journal entry ID
    UPDATE refunds 
    SET journal_entry_id = v_journal_entry_id,
        completed_at = NOW(),
        status = 'COMPLETED'
    WHERE id = p_refund_id;
    
    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. HELPER FUNCTION FOR JOURNAL ENTRY LINES
-- ============================================================================
CREATE OR REPLACE FUNCTION create_journal_entry_line(
    p_journal_entry_id UUID,
    p_business_id UUID,
    p_account_id UUID,
    p_line_type VARCHAR(10),
    p_amount NUMERIC(15,2),
    p_description TEXT
)
RETURNS UUID AS $$
DECLARE
    v_line_id UUID;
BEGIN
    INSERT INTO journal_entry_lines (
        journal_entry_id, business_id, account_id, line_type, amount, description
    ) VALUES (
        p_journal_entry_id, p_business_id, p_account_id, p_line_type, p_amount, p_description
    ) RETURNING id INTO v_line_id;
    
    RETURN v_line_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. UPDATE TRIGGER (follows pattern from discount system)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_refund_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refunds_updated_at
    BEFORE UPDATE ON refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_refund_updated_at();

-- ============================================================================
-- 10. ADD TO ACCOUNTING EVENT REGISTRY (follows pattern from 040 migration)
-- ============================================================================
-- This function will be called during business setup
CREATE OR REPLACE FUNCTION setup_refund_accounting_events(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Add refund events to accounting registry
    INSERT INTO accounting_event_registry (
        business_id, source_table, event_type, trigger_condition, 
        accounting_function, enabled, description
    ) VALUES
        (p_business_id, 'refunds', 'UPDATE', 
         'NEW.status = ''APPROVED'' AND OLD.status != ''APPROVED''',
         'create_refund_journal_entry',
         true, 'Create refund journal entry when approved')
    ON CONFLICT (business_id, source_table, event_type, trigger_condition) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. INTEGRATE WITH BUSINESS SETUP (follows pattern from 040 migration)
-- ============================================================================
-- This ensures new businesses get refund accounts automatically
CREATE OR REPLACE FUNCTION setup_business_refund_system(p_business_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Setup refund accounts
    PERFORM setup_business_refund_accounts(p_business_id, p_user_id);
    
    -- Setup accounting events for refunds
    PERFORM setup_refund_accounting_events(p_business_id);
    
    RAISE NOTICE 'Refund system setup complete for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. ROW LEVEL SECURITY (follows pattern from 032 migration)
-- ============================================================================
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY refunds_business_isolation ON refunds
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY refund_items_business_isolation ON refund_items
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- 13. SETUP FOR EXISTING BUSINESSES
-- ============================================================================
DO $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
BEGIN
    -- Setup for test business
    v_business_id := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
    
    -- Get a user for this business
    SELECT id INTO v_user_id FROM users WHERE business_id = v_business_id LIMIT 1;
    
    IF v_user_id IS NOT NULL THEN
        PERFORM setup_business_refund_system(v_business_id, v_user_id);
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK (for safety)
-- ============================================================================
/*
-- To rollback:
DROP POLICY IF EXISTS refund_items_business_isolation ON refund_items;
DROP POLICY IF EXISTS refunds_business_isolation ON refunds;
DROP FUNCTION IF EXISTS setup_business_refund_system(UUID, UUID);
DROP FUNCTION IF EXISTS setup_refund_accounting_events(UUID);
DROP FUNCTION IF EXISTS create_journal_entry_line(UUID, UUID, UUID, VARCHAR, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS create_refund_journal_entry(UUID, UUID);
DROP FUNCTION IF EXISTS setup_business_refund_accounts(UUID, UUID);
DROP FUNCTION IF EXISTS generate_refund_number(UUID);
DROP FUNCTION IF EXISTS update_refund_updated_at();
DROP TABLE IF EXISTS refund_items CASCADE;
DROP TABLE IF EXISTS refunds CASCADE;
ALTER TABLE pos_transactions DROP COLUMN IF EXISTS refunded_amount, DROP COLUMN IF EXISTS refund_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS refunded_amount, DROP COLUMN IF EXISTS refund_status;
ALTER TABLE discount_allocations DROP COLUMN IF EXISTS original_allocation_id, DROP COLUMN IF EXISTS is_refund_reversal, DROP COLUMN IF EXISTS refund_id;
*/
