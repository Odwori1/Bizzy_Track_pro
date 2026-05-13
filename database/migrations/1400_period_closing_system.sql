-- =====================================================
-- Phase 14: Period Closing System
-- Date: 2026-05-07
-- Purpose: Add accounting period management and closing entries
-- =====================================================

-- =====================================================
-- 1. CREATE ACCOUNTING PERIODS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period_name VARCHAR(50) NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('MONTHLY', 'QUARTERLY', 'YEARLY')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LOCKED')),
    closed_by UUID REFERENCES users(id),
    closed_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES users(id),
    reopened_at TIMESTAMPTZ,
    reopening_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_dates CHECK (start_date <= end_date),
    CONSTRAINT unique_period_per_business UNIQUE (business_id, period_name, period_type, start_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounting_periods_business_id ON accounting_periods(business_id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status ON accounting_periods(status);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates ON accounting_periods(start_date, end_date);

-- =====================================================
-- 2. CREATE CLOSING ENTRIES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS closing_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    closing_type VARCHAR(30) NOT NULL CHECK (closing_type IN (
        'REVENUE_CLOSE', 
        'EXPENSE_CLOSE', 
        'INCOME_SUMMARY', 
        'RETAINED_EARNINGS'
    )),
    amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_closing_entry_per_period UNIQUE (period_id, closing_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_closing_entries_business_id ON closing_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_closing_entries_period_id ON closing_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_closing_entries_journal_entry_id ON closing_entries(journal_entry_id);

-- =====================================================
-- 3. CREATE PERIOD LOCKS TABLE (For transaction prevention)
-- =====================================================
CREATE TABLE IF NOT EXISTS period_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE CASCADE,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by UUID REFERENCES users(id),
    reason TEXT,
    
    UNIQUE(business_id, period_id, table_name, record_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_period_locks_business_id ON period_locks(business_id);
CREATE INDEX IF NOT EXISTS idx_period_locks_period_id ON period_locks(period_id);

-- =====================================================
-- 4. CREATE INCOME SUMMARY ACCOUNT IF MISSING
-- =====================================================
-- Income Summary is a temporary account used only during closing
INSERT INTO chart_of_accounts (
    id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at
)
SELECT 
    gen_random_uuid(), 
    b.id, 
    '3999', 
    'Income Summary', 
    'equity', 
    true, 
    NOW(), 
    NOW()
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts ca 
    WHERE ca.business_id = b.id AND ca.account_code = '3999'
)
AND b.id = ANY(ARRAY(SELECT DISTINCT business_id FROM businesses));

RAISE NOTICE '✅ Period closing tables created successfully';

-- =====================================================
-- 5. CREATE AUTO-UPDATE TRIGGER FOR UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_accounting_periods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_accounting_periods_updated_at ON accounting_periods;
CREATE TRIGGER trigger_accounting_periods_updated_at
    BEFORE UPDATE ON accounting_periods
    FOR EACH ROW
    EXECUTE FUNCTION update_accounting_periods_updated_at();
