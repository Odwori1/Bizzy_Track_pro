-- ============================================================================
-- MIGRATION: Create Accounting Foundation Tables
-- ============================================================================
-- Purpose: Implement proper double-entry accounting system
-- Date: 2025-12-02
-- Priority: CRITICAL - Enables accurate financial reporting
-- Dependencies: Week 7 financial tables should exist
-- ============================================================================

-- 1. CHART OF ACCOUNTS - Core accounting structure
CREATE TABLE chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Account Identification
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN (
        'asset', 'liability', 'equity', 'revenue', 'expense'
    )),
    account_subtype VARCHAR(50),
    parent_account_id UUID REFERENCES chart_of_accounts(id),
    
    -- Financial Details
    opening_balance DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    
    -- Status & Metadata
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    notes TEXT,
    
    -- System Fields
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(business_id, account_code),
    CHECK (parent_account_id IS NULL OR parent_account_id != id) -- Prevent self-reference
);

-- 2. JOURNAL ENTRIES - Double-entry transaction records
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Entry Identification
    journal_date DATE NOT NULL,
    reference_number VARCHAR(50) NOT NULL,
    reference_type VARCHAR(50) NOT NULL, -- 'pos_transaction', 'expense', 'invoice', 'manual'
    reference_id UUID NOT NULL,
    
    -- Entry Details
    description TEXT NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
    
    -- System Fields
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    posted_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    
    -- Constraints
    UNIQUE(business_id, reference_type, reference_id),
    CHECK (journal_date <= CURRENT_DATE),
    CHECK (voided_at IS NULL OR posted_at IS NOT NULL)
);

-- 3. JOURNAL ENTRY LINES - Individual debit/credit entries
CREATE TABLE journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    
    -- Line Details
    line_type VARCHAR(10) NOT NULL CHECK (line_type IN ('debit', 'credit')),
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    
    -- System Fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CHECK (amount > 0)
);

-- 4. GENERAL LEDGER - Account balances by period
CREATE TABLE general_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    
    -- Period Details
    period_date DATE NOT NULL, -- End of period (e.g., end of month)
    period_type VARCHAR(20) DEFAULT 'monthly' CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
    
    -- Balance Details
    opening_balance DECIMAL(15,2) DEFAULT 0,
    debit_total DECIMAL(15,2) DEFAULT 0,
    credit_total DECIMAL(15,2) DEFAULT 0,
    closing_balance DECIMAL(15,2) DEFAULT 0,
    
    -- System Fields
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(business_id, account_id, period_date),
    CHECK (period_date <= CURRENT_DATE)
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY chart_of_accounts_business_isolation ON chart_of_accounts
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY journal_entries_business_isolation ON journal_entries
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY journal_entry_lines_business_isolation ON journal_entry_lines
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY general_ledger_business_isolation ON general_ledger
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Chart of Accounts Indexes
CREATE INDEX idx_chart_of_accounts_business ON chart_of_accounts(business_id);
CREATE INDEX idx_chart_of_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX idx_chart_of_accounts_code ON chart_of_accounts(account_code);

-- Journal Entries Indexes
CREATE INDEX idx_journal_entries_business ON journal_entries(business_id);
CREATE INDEX idx_journal_entries_date ON journal_entries(journal_date);
CREATE INDEX idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);

-- Journal Entry Lines Indexes
CREATE INDEX idx_journal_entry_lines_journal ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_entry_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_journal_entry_lines_type ON journal_entry_lines(line_type);

-- General Ledger Indexes
CREATE INDEX idx_general_ledger_business ON general_ledger(business_id);
CREATE INDEX idx_general_ledger_account ON general_ledger(account_id);
CREATE INDEX idx_general_ledger_period ON general_ledger(period_date);

-- ============================================================================
-- DEFAULT CHART OF ACCOUNTS SETUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION setup_default_chart_of_accounts(p_business_id UUID, p_user_id UUID)
RETURNS VOID AS $$
DECLARE
    v_root_asset UUID;
    v_root_liability UUID;
    v_root_equity UUID;
    v_root_revenue UUID;
    v_root_expense UUID;
BEGIN
    -- Create root accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, created_by)
    VALUES
        (p_business_id, '1000', 'Assets', 'asset', p_user_id),
        (p_business_id, '2000', 'Liabilities', 'liability', p_user_id),
        (p_business_id, '3000', 'Equity', 'equity', p_user_id),
        (p_business_id, '4000', 'Revenue', 'revenue', p_user_id),
        (p_business_id, '5000', 'Expenses', 'expense', p_user_id)
    RETURNING 
        CASE WHEN account_code = '1000' THEN id END,
        CASE WHEN account_code = '2000' THEN id END,
        CASE WHEN account_code = '3000' THEN id END,
        CASE WHEN account_code = '4000' THEN id END,
        CASE WHEN account_code = '5000' THEN id END
    INTO v_root_asset, v_root_liability, v_root_equity, v_root_revenue, v_root_expense;

    -- Asset Accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES
        -- Current Assets
        (p_business_id, '1100', 'Current Assets', 'asset', v_root_asset, p_user_id),
        (p_business_id, '1110', 'Cash & Cash Equivalents', 'asset', v_root_asset, p_user_id),
        (p_business_id, '1120', 'Accounts Receivable', 'asset', v_root_asset, p_user_id),
        (p_business_id, '1130', 'Inventory', 'asset', v_root_asset, p_user_id),
        
        -- Fixed Assets
        (p_business_id, '1200', 'Fixed Assets', 'asset', v_root_asset, p_user_id),
        (p_business_id, '1210', 'Property, Plant & Equipment', 'asset', v_root_asset, p_user_id),
        (p_business_id, '1220', 'Accumulated Depreciation', 'asset', v_root_asset, p_user_id);

    -- Liability Accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES
        -- Current Liabilities
        (p_business_id, '2100', 'Current Liabilities', 'liability', v_root_liability, p_user_id),
        (p_business_id, '2110', 'Accounts Payable', 'liability', v_root_liability, p_user_id),
        (p_business_id, '2120', 'Sales Tax Payable', 'liability', v_root_liability, p_user_id),
        
        -- Long-term Liabilities
        (p_business_id, '2200', 'Long-term Liabilities', 'liability', v_root_liability, p_user_id);

    -- Equity Accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES
        (p_business_id, '3100', 'Owner''s Equity', 'equity', v_root_equity, p_user_id),
        (p_business_id, '3110', 'Retained Earnings', 'equity', v_root_equity, p_user_id),
        (p_business_id, '3120', 'Current Earnings', 'equity', v_root_equity, p_user_id);

    -- Revenue Accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES
        (p_business_id, '4100', 'Sales Revenue', 'revenue', v_root_revenue, p_user_id),
        (p_business_id, '4110', 'Product Sales', 'revenue', v_root_revenue, p_user_id),
        (p_business_id, '4120', 'Service Revenue', 'revenue', v_root_revenue, p_user_id),
        (p_business_id, '4130', 'Equipment Hire Revenue', 'revenue', v_root_revenue, p_user_id),
        (p_business_id, '4190', 'Discounts Given', 'revenue', v_root_revenue, p_user_id);

    -- Expense Accounts
    INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, parent_account_id, created_by)
    VALUES
        -- Operating Expenses
        (p_business_id, '5100', 'Operating Expenses', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5110', 'Cost of Goods Sold', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5120', 'Salaries & Wages', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5130', 'Rent Expense', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5140', 'Utilities Expense', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5150', 'Marketing Expense', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5160', 'Repairs & Maintenance', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5170', 'Depreciation Expense', 'expense', v_root_expense, p_user_id),
        (p_business_id, '5190', 'Miscellaneous Expense', 'expense', v_root_expense, p_user_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION TO CREATE JOURNAL ENTRY FOR POS TRANSACTION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction(
    p_pos_transaction_id UUID,
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_transaction_number VARCHAR(50);
    v_final_amount DECIMAL(15,2);
    v_payment_method VARCHAR(50);
    v_customer_id UUID;
    v_journal_entry_id UUID;
    v_cash_account_id UUID;
    v_revenue_account_id UUID;
BEGIN
    -- Get POS transaction details
    SELECT 
        business_id, 
        transaction_number, 
        final_amount, 
        payment_method,
        customer_id
    INTO 
        v_business_id, 
        v_transaction_number, 
        v_final_amount, 
        v_payment_method,
        v_customer_id
    FROM pos_transactions 
    WHERE id = p_pos_transaction_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_pos_transaction_id;
    END IF;

    -- Get appropriate accounts based on payment method
    -- Cash account mapping
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts 
    WHERE business_id = v_business_id 
    AND account_code = '1110'  -- Cash & Cash Equivalents
    LIMIT 1;
    
    -- Revenue account
    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts 
    WHERE business_id = v_business_id 
    AND account_code = '4100'  -- Sales Revenue
    LIMIT 1;

    IF v_cash_account_id IS NULL OR v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Required accounts not found in chart of accounts';
    END IF;

    -- Create journal entry
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        'JE-' || v_transaction_number,
        'pos_transaction',
        p_pos_transaction_id,
        'POS Sale: ' || v_transaction_number,
        v_final_amount,
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create debit entry (Cash/Bank increase)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_cash_account_id,
        'debit',
        v_final_amount,
        'Cash received from POS sale'
    );

    -- Create credit entry (Revenue increase)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        v_business_id,
        v_journal_entry_id,
        v_revenue_account_id,
        'credit',
        v_final_amount,
        'Sales revenue from POS'
    );

    -- Return the journal entry ID
    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROLLBACK SQL (for safety)
-- ============================================================================
/*
-- To rollback:
DROP FUNCTION IF EXISTS create_journal_entry_for_pos_transaction(UUID, UUID);
DROP FUNCTION IF EXISTS setup_default_chart_of_accounts(UUID, UUID);

DROP TABLE IF EXISTS general_ledger CASCADE;
DROP TABLE IF EXISTS journal_entry_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS chart_of_accounts CASCADE;
*/
-- ============================================================================
