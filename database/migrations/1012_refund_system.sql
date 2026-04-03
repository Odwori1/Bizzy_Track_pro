-- ============================================================================
-- MIGRATION: 1012_refund_system_fixed.sql
-- Purpose: Add refund system with full accounting integration
-- Fixed: Removed dependency on migrations table structure
-- Date: March 25, 2026
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: REFUNDS TABLE (Core refund tracking)
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
    
    -- Accounting integration
    journal_entry_id UUID REFERENCES journal_entries(id),
    
    -- Approval workflow
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_refunds_business_id ON refunds(business_id);
CREATE INDEX IF NOT EXISTS idx_refunds_original_transaction ON refunds(original_transaction_id, original_transaction_type);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
CREATE INDEX IF NOT EXISTS idx_refunds_journal_entry ON refunds(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_refunds_approval ON refunds(approval_id);
CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at);

-- ============================================================================
-- SECTION 2: REFUND ITEMS TABLE (Line-level tracking)
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
    
    -- Links to other systems
    discount_allocation_line_id UUID REFERENCES discount_allocation_lines(id),
    
    -- Reason
    reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT refund_items_quantity_positive CHECK (quantity_refunded > 0)
);

CREATE INDEX IF NOT EXISTS idx_refund_items_refund_id ON refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_original_line ON refund_items(original_line_item_id, original_line_type);
CREATE INDEX IF NOT EXISTS idx_refund_items_product ON refund_items(product_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_service ON refund_items(service_id);

-- ============================================================================
-- SECTION 3: ENHANCE EXISTING TABLES
-- ============================================================================

-- Add refund tracking to POS transactions
ALTER TABLE pos_transactions 
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PARTIAL', 'FULL', 'CANCELLED'));

-- Add refund tracking to invoices
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'NONE' CHECK (refund_status IN ('NONE', 'PARTIAL', 'FULL', 'CANCELLED'));

-- Add refund links to discount allocations
ALTER TABLE discount_allocations 
ADD COLUMN IF NOT EXISTS original_allocation_id UUID REFERENCES discount_allocations(id),
ADD COLUMN IF NOT EXISTS is_refund_reversal BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS refund_id UUID REFERENCES refunds(id);

-- ============================================================================
-- SECTION 4: HELPER FUNCTIONS
-- ============================================================================

-- Generate refund number
CREATE OR REPLACE FUNCTION generate_refund_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year_prefix VARCHAR(4);
    v_month_prefix VARCHAR(2);
    v_sequence_num INTEGER;
    v_refund_number VARCHAR(50);
BEGIN
    v_year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_month_prefix := TO_CHAR(CURRENT_DATE, 'MM');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(refund_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_sequence_num
    FROM refunds
    WHERE business_id = p_business_id 
      AND refund_number LIKE 'RF-' || v_year_prefix || '-' || v_month_prefix || '-%';
    
    v_refund_number := 'RF-' || v_year_prefix || '-' || v_month_prefix || '-' || LPAD(v_sequence_num::TEXT, 5, '0');
    RETURN v_refund_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 5: ACCOUNT SETUP FUNCTIONS
-- ============================================================================

-- Function to setup refund accounts for a business
CREATE OR REPLACE FUNCTION setup_business_refund_accounts(p_business_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_root_revenue UUID;
BEGIN
    -- Get root revenue account
    SELECT id INTO v_root_revenue FROM chart_of_accounts 
    WHERE business_id = p_business_id AND account_code = '4000' LIMIT 1;
    
    -- Add refund-specific accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES 
        (p_business_id, '4150', 'Sales Returns & Allowances', 'revenue', v_root_revenue, p_user_id),
        (p_business_id, '2150', 'Refund Liability', 'liability', NULL, p_user_id),
        (p_business_id, '1115', 'Credit Notes Receivable', 'asset', NULL, p_user_id)
    ON CONFLICT (business_id, account_code) DO NOTHING;
    
    RAISE NOTICE 'Refund accounts setup for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 6: CORE REFUND ACCOUNTING FUNCTION
-- ============================================================================

-- Function to create journal entry for a refund
CREATE OR REPLACE FUNCTION create_refund_journal_entry(
    p_refund_id UUID,
    p_user_id UUID
)
RETURNS TABLE(success BOOLEAN, message TEXT, journal_entry_id UUID) AS $$
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
    v_reference_number VARCHAR(50);
    v_line_count INTEGER;
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
        success := FALSE;
        message := 'Refund not found: ' || p_refund_id;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Check if already processed
    IF EXISTS (SELECT 1 FROM refunds WHERE id = p_refund_id AND journal_entry_id IS NOT NULL) THEN
        success := FALSE;
        message := 'Refund already has journal entry';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Get cash/bank account based on refund method
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id 
      AND account_code = CASE v_refund_method
          WHEN 'CASH' THEN '1110'
          WHEN 'CARD' THEN '1120'
          WHEN 'MOBILE_MONEY' THEN '1130'
          WHEN 'BANK_TRANSFER' THEN '1120'
          ELSE '1120'
      END
      AND is_active = true
    LIMIT 1;
    
    IF v_cash_account_id IS NULL THEN
        success := FALSE;
        message := 'Cash/Bank account not found for refund method: ' || v_refund_method;
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Get sales returns account
    SELECT id INTO v_sales_returns_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id AND account_code = '4150' AND is_active = true;
    
    IF v_sales_returns_account_id IS NULL THEN
        -- Try to create it
        PERFORM setup_business_refund_accounts(v_business_id, p_user_id);
        
        SELECT id INTO v_sales_returns_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id AND account_code = '4150' AND is_active = true;
        
        IF v_sales_returns_account_id IS NULL THEN
            success := FALSE;
            message := 'Sales Returns account (4150) not found and could not be created';
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;
    
    -- Get discount account (if discounts refunded)
    IF v_discount_refunded > 0 THEN
        SELECT id INTO v_discount_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id AND account_code = '4110' AND is_active = true;
    END IF;
    
    -- Get tax account (if tax refunded)
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
        p_refund_id::TEXT,
        'Refund: ' || v_refund_number || ' for ' || v_original_transaction_type || ' transaction',
        v_total_refunded,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;
    
    -- Create debit line: Sales Returns
    INSERT INTO journal_entry_lines (
        journal_entry_id, business_id, account_id, line_type, amount, description
    ) VALUES (
        v_journal_entry_id, v_business_id, v_sales_returns_account_id,
        'debit', v_subtotal_refunded, 'Refunded sales amount'
    );
    
    v_line_count := 1;
    
    -- Create debit line: Discounts (if any)
    IF v_discount_refunded > 0 AND v_discount_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, business_id, account_id, line_type, amount, description
        ) VALUES (
            v_journal_entry_id, v_business_id, v_discount_account_id,
            'debit', v_discount_refunded, 'Refunded discount amount'
        );
        v_line_count := v_line_count + 1;
    END IF;
    
    -- Create debit line: Tax (if any)
    IF v_tax_refunded > 0 AND v_tax_account_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, business_id, account_id, line_type, amount, description
        ) VALUES (
            v_journal_entry_id, v_business_id, v_tax_account_id,
            'debit', v_tax_refunded, 'Refunded tax amount'
        );
        v_line_count := v_line_count + 1;
    END IF;
    
    -- Create credit line: Cash/Bank
    INSERT INTO journal_entry_lines (
        journal_entry_id, business_id, account_id, line_type, amount, description
    ) VALUES (
        v_journal_entry_id, v_business_id, v_cash_account_id,
        'credit', v_total_refunded, 'Refund payment to customer'
    );
    
    -- Update refund with journal entry ID
    UPDATE refunds 
    SET journal_entry_id = v_journal_entry_id,
        completed_at = NOW(),
        status = 'COMPLETED'
    WHERE id = p_refund_id;
    
    success := TRUE;
    message := 'Journal entry created with ' || v_line_count || ' lines';
    journal_entry_id := v_journal_entry_id;
    RETURN NEXT;
    
EXCEPTION WHEN OTHERS THEN
    success := FALSE;
    message := SQLERRM;
    journal_entry_id := NULL;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: REFUND TRIGGER (Follows pattern from POS accounting)
-- ============================================================================

-- Function to auto-create journal entry when refund is approved
CREATE OR REPLACE FUNCTION process_refund_accounting()
RETURNS TRIGGER AS $$
DECLARE
    v_result RECORD;
BEGIN
    -- When refund status changes to APPROVED
    IF NEW.status = 'APPROVED' AND (TG_OP = 'INSERT' OR OLD.status != 'APPROVED') THEN
        -- Create journal entry
        SELECT * INTO v_result FROM create_refund_journal_entry(NEW.id, NEW.approved_by);
        
        IF NOT v_result.success THEN
            RAISE WARNING 'Refund accounting failed for %: %', NEW.refund_number, v_result.message;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on refunds table
DROP TRIGGER IF EXISTS trigger_refund_accounting ON refunds;
CREATE TRIGGER trigger_refund_accounting
    AFTER UPDATE OF status ON refunds
    FOR EACH ROW
    WHEN (NEW.status = 'APPROVED')
    EXECUTE FUNCTION process_refund_accounting();

-- ============================================================================
-- SECTION 8: ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refunds_business_isolation ON refunds;
CREATE POLICY refunds_business_isolation ON refunds
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

DROP POLICY IF EXISTS refund_items_business_isolation ON refund_items;
CREATE POLICY refund_items_business_isolation ON refund_items
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- SECTION 9: SETUP FOR EXISTING BUSINESSES
-- ============================================================================
DO $$
DECLARE
    v_business_record RECORD;
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    -- Setup for all existing businesses
    FOR v_business_record IN SELECT id FROM businesses LOOP
        -- Get a user for this business
        SELECT id INTO v_user_id FROM users WHERE business_id = v_business_record.id LIMIT 1;
        
        IF v_user_id IS NOT NULL THEN
            PERFORM setup_business_refund_accounts(v_business_record.id, v_user_id);
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Refund accounts setup completed for % businesses', v_count;
END $$;

-- ============================================================================
-- SECTION 10: RECORD MIGRATION (Safe version - check structure first)
-- ============================================================================
DO $$
BEGIN
    -- Check if migrations table exists and has the expected structure
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations') THEN
        -- Check if name column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'migrations' AND column_name = 'name') THEN
            -- Insert migration record if not exists
            INSERT INTO migrations (name) 
            VALUES ('1012_refund_system_fixed')
            ON CONFLICT (name) DO NOTHING;
        ELSE
            RAISE NOTICE 'Migrations table exists but without name column, skipping migration record';
        END IF;
    ELSE
        RAISE NOTICE 'Migrations table not found, skipping migration record';
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_table_count INTEGER;
    v_account_count INTEGER;
    v_trigger_exists BOOLEAN;
    v_business_id UUID := 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
BEGIN
    SELECT COUNT(*) INTO v_table_count 
    FROM information_schema.tables 
    WHERE table_name IN ('refunds', 'refund_items');
    
    SELECT COUNT(*) INTO v_account_count 
    FROM chart_of_accounts 
    WHERE business_id = v_business_id
      AND account_code IN ('4150', '2150', '1115');
    
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_refund_accounting'
    ) INTO v_trigger_exists;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'REFUND SYSTEM INSTALLATION STATUS';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Tables created: %', v_table_count;
    RAISE NOTICE 'Refund accounts for test business: %', v_account_count;
    RAISE NOTICE 'Refund trigger created: %', v_trigger_exists;
    RAISE NOTICE '========================================';
END $$;
