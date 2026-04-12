-- ============================================================================
-- MIGRATION: 1020_opening_balance_system.sql
-- Purpose: Standard chart of accounts (66 accounts) + Dynamic opening balances
--          
-- STANDARD (hardcoded): All businesses get the SAME chart of accounts
-- DYNAMIC (user-configurable): Opening balance amounts, fiscal year, currency
--
-- Based on patterns from: 1015_refund_system_production_grade.sql
--                      087_fix_ensure_business_has_complete_accounts_v2.sql
-- Date: April 10, 2026
-- Version: 3.0.0
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: REPLACE ensure_business_has_complete_accounts with STANDARD 66 accounts
-- ============================================================================

DROP FUNCTION IF EXISTS ensure_business_has_complete_accounts(UUID);

CREATE OR REPLACE FUNCTION ensure_business_has_complete_accounts(p_business_id UUID)
RETURNS VOID AS $$
DECLARE
    v_business_exists BOOLEAN;
    v_root_asset UUID;
    v_root_liability UUID;
    v_root_equity UUID;
    v_root_revenue UUID;
    v_root_expense UUID;
BEGIN
    -- Check if business exists
    SELECT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) INTO v_business_exists;
    IF NOT v_business_exists THEN
        RAISE NOTICE 'Business % does not exist, skipping account creation', p_business_id;
        RETURN;
    END IF;

    RAISE NOTICE 'Ensuring complete chart of accounts for business: %', p_business_id;

    -- ========================================================================
    -- FIRST: Create root parent accounts (for reporting hierarchy)
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '1000', 'Assets', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2000', 'Liabilities', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3000', 'Equity', 'equity', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4000', 'Revenue', 'revenue', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5000', 'Expenses', 'expense', true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- Get root account IDs for parent references
    SELECT id INTO v_root_asset FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '1000';
    SELECT id INTO v_root_liability FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '2000';
    SELECT id INTO v_root_equity FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '3000';
    SELECT id INTO v_root_revenue FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '4000';
    SELECT id INTO v_root_expense FROM chart_of_accounts WHERE business_id = p_business_id AND account_code = '5000';

    -- ========================================================================
    -- SECOND: Asset Accounts (1000-1999) - 25 accounts
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        -- Current Assets
        (gen_random_uuid(), p_business_id, '1110', 'Cash', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1115', 'Credit Notes Receivable', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1120', 'Bank Account', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1130', 'Mobile Money', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1200', 'Accounts Receivable', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1300', 'Inventory', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1400', 'Prepaid Expenses', 'asset', v_root_asset, true, NOW(), NOW()),

        -- Fixed Assets
        (gen_random_uuid(), p_business_id, '1410', 'Land', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1420', 'Buildings', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1430', 'Vehicles', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1440', 'Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1450', 'Furniture and Fixtures', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1460', 'Computers and Software', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1470', 'Leasehold Improvements', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1480', 'Other Fixed Assets', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1500', 'Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1600', 'Furniture and Fixtures', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1800', 'Other Assets', 'asset', v_root_asset, true, NOW(), NOW()),

        -- Accumulated Depreciation (contra-asset accounts)
        (gen_random_uuid(), p_business_id, '1490', 'Accumulated Depreciation - Buildings', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1491', 'Accumulated Depreciation - Vehicles', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1492', 'Accumulated Depreciation - Equipment', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1493', 'Accumulated Depreciation - Furniture', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1494', 'Accumulated Depreciation - Computers', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1495', 'Accumulated Depreciation - Other Assets', 'asset', v_root_asset, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1700', 'Accumulated Depreciation', 'asset', v_root_asset, true, NOW(), NOW()),

        -- Asset Disposal Accounts (special types)
        (gen_random_uuid(), p_business_id, '1496', 'Gain on Disposal of Assets', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1497', 'Loss on Disposal of Assets', 'expense', v_root_expense, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- THIRD: Liability Accounts (2000-2999) - 10 accounts
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '2100', 'Accounts Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2120', 'Sales Tax Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2130', 'WHT Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2150', 'Refund Liability', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2200', 'Loans Payable', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2210', 'Short-term Loans', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2220', 'Long-term Loans', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2300', 'Accrued Expenses', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2400', 'Unearned Revenue', 'liability', v_root_liability, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2500', 'Other Liabilities', 'liability', v_root_liability, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- FOURTH: Equity Accounts (3000-3999) - 6 accounts
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '3100', 'Owner''s Capital', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3200', 'Owner''s Drawings', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3300', 'Retained Earnings', 'equity', v_root_equity, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3400', 'Current Earnings', 'equity', v_root_equity, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- FIFTH: Revenue Accounts (4000-4999) - 11 accounts
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '4100', 'Sales Revenue', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4110', 'Sales Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4111', 'Volume Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4112', 'Early Payment Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4113', 'Promotional Discounts', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4150', 'Sales Returns & Allowances', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4200', 'Service Revenue', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4300', 'Discounts Given', 'revenue', v_root_revenue, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4400', 'Other Revenue', 'revenue', v_root_revenue, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    -- ========================================================================
    -- SIXTH: Expense Accounts (5000-5999) - 14 accounts
    -- ========================================================================
    INSERT INTO chart_of_accounts (
        id, business_id, account_code, account_name, account_type, parent_account_id, is_active, created_at, updated_at
    ) VALUES
        (gen_random_uuid(), p_business_id, '5100', 'Cost of Goods Sold', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5200', 'Rent Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5201', 'Office Supplies Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5202', 'Utilities Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5203', 'Rent Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5204', 'Marketing Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5205', 'Travel Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5206', 'Salaries and Wages', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5209', 'Miscellaneous Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5300', 'Insurance Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5400', 'Repairs and Maintenance', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5500', 'Advertising Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5600', 'Depreciation Expense', 'expense', v_root_expense, true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5700', 'Other Expenses', 'expense', v_root_expense, true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    RAISE NOTICE '✅ Chart of accounts complete for business: % (66 accounts)', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 2: OPENING BALANCES TABLE (user enters amounts - DYNAMIC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS opening_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Account reference
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    account_code VARCHAR(20) NOT NULL,

    -- User-entered balance (THIS is what's dynamic - user decides amount)
    balance_type VARCHAR(10) NOT NULL CHECK (balance_type IN ('debit', 'credit')),
    balance_amount NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- As of date (user chooses when to start)
    as_of_date DATE NOT NULL,

    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- User can adjust if needed
    is_adjusted BOOLEAN DEFAULT FALSE,
    adjusted_by UUID REFERENCES users(id),
    adjusted_at TIMESTAMPTZ,
    adjustment_reason TEXT,

    -- User notes (business can document their reasoning)
    notes TEXT,

    CONSTRAINT opening_balances_unique UNIQUE (business_id, account_id, as_of_date),
    CONSTRAINT opening_balances_amount_positive CHECK (balance_amount >= 0)
);

-- ============================================================================
-- SECTION 3: BUSINESS ACCOUNTING STATUS (user-configurable settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS business_accounting_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,

    -- System flags (not user-configurable)
    chart_of_accounts_created BOOLEAN DEFAULT FALSE,
    opening_balances_posted BOOLEAN DEFAULT FALSE,

    -- USER-CONFIGURABLE SETTINGS (these are dynamic)
    fiscal_year_start DATE,           -- User chooses their fiscal year
    fiscal_year_end DATE,             -- Calculated from start
    currency_code VARCHAR(3) DEFAULT 'UGX',  -- User chooses from supported list
    uses_cash_basis BOOLEAN DEFAULT FALSE,   -- User chooses accounting method
    uses_accrual_basis BOOLEAN DEFAULT TRUE, -- User chooses accounting method

    -- Status tracking
    initialization_status VARCHAR(20) DEFAULT 'PENDING' 
        CHECK (initialization_status IN ('PENDING', 'IN_PROGRESS', 'BALANCES_SET', 'COMPLETED', 'FAILED')),

    -- Audit
    initialized_by UUID REFERENCES users(id),
    initialized_at TIMESTAMPTZ,
    posted_by UUID REFERENCES users(id),
    posted_at TIMESTAMPTZ,

    -- Business notes
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SECTION 4: INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_opening_balances_business ON opening_balances(business_id);
CREATE INDEX IF NOT EXISTS idx_opening_balances_account ON opening_balances(account_id);
CREATE INDEX IF NOT EXISTS idx_opening_balances_date ON opening_balances(as_of_date);
CREATE INDEX IF NOT EXISTS idx_opening_balances_business_date ON opening_balances(business_id, as_of_date);
CREATE INDEX IF NOT EXISTS idx_business_status_business ON business_accounting_status(business_id);

-- ============================================================================
-- SECTION 5: TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_opening_balances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_opening_balances_updated_at
    BEFORE UPDATE ON opening_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_opening_balances_updated_at();

DROP TRIGGER IF EXISTS trigger_business_status_updated_at ON business_accounting_status;
CREATE TRIGGER trigger_business_status_updated_at
    BEFORE UPDATE ON business_accounting_status
    FOR EACH ROW
    EXECUTE FUNCTION update_opening_balances_updated_at();

-- ============================================================================
-- SECTION 6: FUNCTIONS (Dynamic where appropriate, Standard where required)
-- ============================================================================

-- Function 1: Validate opening balances (STANDARD - always required)
CREATE OR REPLACE FUNCTION validate_opening_balances(
    p_business_id UUID,
    p_as_of_date DATE
)
RETURNS TABLE(
    is_valid BOOLEAN,
    total_debits NUMERIC,
    total_credits NUMERIC,
    difference NUMERIC,
    message TEXT
) AS $$
DECLARE
    v_total_debits NUMERIC;
    v_total_credits NUMERIC;
BEGIN
    SELECT COALESCE(SUM(balance_amount), 0) INTO v_total_debits
    FROM opening_balances
    WHERE business_id = p_business_id AND as_of_date = p_as_of_date AND balance_type = 'debit';

    SELECT COALESCE(SUM(balance_amount), 0) INTO v_total_credits
    FROM opening_balances
    WHERE business_id = p_business_id AND as_of_date = p_as_of_date AND balance_type = 'credit';

    is_valid := ABS(v_total_debits - v_total_credits) < 0.01;
    total_debits := v_total_debits;
    total_credits := v_total_credits;
    difference := v_total_debits - v_total_credits;

    IF is_valid THEN
        message := '✓ Balanced: Debits ' || v_total_debits || ' = Credits ' || v_total_credits;
    ELSE
        message := '✗ Unbalanced: Debits ' || v_total_debits || ' ≠ Credits ' || v_total_credits;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function 2: Set opening balance (DYNAMIC - user enters amount)
CREATE OR REPLACE FUNCTION set_opening_balance(
    p_business_id UUID,
    p_account_code VARCHAR,
    p_balance_amount NUMERIC,
    p_balance_type VARCHAR,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT, balance_id UUID) AS $$
DECLARE
    v_account_id UUID;
    v_balance_id UUID;
BEGIN
    -- Get account ID from standard chart
    SELECT id INTO v_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id AND account_code = p_account_code AND is_active = true;

    IF v_account_id IS NULL THEN
        success := FALSE;
        message := 'Account not found: ' || p_account_code;
        balance_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Validate amount (user can only enter non-negative numbers)
    IF p_balance_amount < 0 THEN
        success := FALSE;
        message := 'Balance amount cannot be negative';
        balance_id := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Upsert opening balance (user enters their actual amount)
    INSERT INTO opening_balances (
        business_id, account_id, account_code, balance_type, balance_amount, as_of_date, created_by, notes
    ) VALUES (
        p_business_id, v_account_id, p_account_code, p_balance_type, p_balance_amount, p_as_of_date, p_user_id, p_notes
    )
    ON CONFLICT (business_id, account_id, as_of_date) DO UPDATE
    SET balance_amount = EXCLUDED.balance_amount,
        balance_type = EXCLUDED.balance_type,
        is_adjusted = TRUE,
        adjusted_by = p_user_id,
        adjusted_at = NOW(),
        notes = COALESCE(p_notes, opening_balances.notes),
        updated_at = NOW()
    RETURNING id INTO v_balance_id;

    -- Update status
    UPDATE business_accounting_status
    SET initialization_status = 'BALANCES_SET',
        updated_at = NOW()
    WHERE business_id = p_business_id;

    success := TRUE;
    message := 'Opening balance set for ' || p_account_code || ': ' || p_balance_amount;
    balance_id := v_balance_id;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Create journal entry (STANDARD - posts user's balances to GL)
CREATE OR REPLACE FUNCTION create_opening_balance_journal_entry(
    p_business_id UUID,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    success BOOLEAN,
    journal_entry_id UUID,
    message TEXT,
    lines_created INTEGER
) AS $$
DECLARE
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(50);
    v_balance RECORD;
    v_line_count INTEGER := 0;
    v_total_amount NUMERIC := 0;
    v_validation RECORD;
BEGIN
    -- Validate balances first
    SELECT * INTO v_validation FROM validate_opening_balances(p_business_id, p_as_of_date);

    IF NOT v_validation.is_valid THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := v_validation.message;
        lines_created := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Check if any balances exist
    IF NOT EXISTS (SELECT 1 FROM opening_balances WHERE business_id = p_business_id AND as_of_date = p_as_of_date) THEN
        success := FALSE;
        journal_entry_id := NULL;
        message := 'No opening balances found. Please set opening balances first.';
        lines_created := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Generate reference number
    v_reference_number := 'OPEN-' || TO_CHAR(p_as_of_date, 'YYYYMMDD');
    v_total_amount := v_validation.total_debits;

    -- Create journal entry
    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at
    ) VALUES (
        p_business_id, p_as_of_date, v_reference_number, 'OPENING_BALANCE', v_reference_number,
        'Opening balances as of ' || TO_CHAR(p_as_of_date, 'YYYY-MM-DD'),
        v_total_amount, 'posted', p_user_id, NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create journal entry lines for each opening balance with non-zero amount
    FOR v_balance IN
        SELECT ob.*, ca.account_name
        FROM opening_balances ob
        JOIN chart_of_accounts ca ON ob.account_id = ca.id
        WHERE ob.business_id = p_business_id
          AND ob.as_of_date = p_as_of_date
          AND ob.balance_amount > 0
        ORDER BY ca.account_code
    LOOP
        INSERT INTO journal_entry_lines (
            journal_entry_id, business_id, account_id, line_type, amount, description
        ) VALUES (
            v_journal_entry_id, p_business_id, v_balance.account_id,
            v_balance.balance_type, v_balance.balance_amount,
            'Opening balance: ' || v_balance.account_name
        );
        v_line_count := v_line_count + 1;
    END LOOP;

    -- Update status
    UPDATE business_accounting_status
    SET opening_balances_posted = TRUE,
        posted_by = p_user_id,
        posted_at = NOW(),
        initialization_status = 'COMPLETED',
        updated_at = NOW()
    WHERE business_id = p_business_id;

    -- If no status record exists, create one
    IF NOT FOUND THEN
        INSERT INTO business_accounting_status (
            business_id, chart_of_accounts_created, opening_balances_posted,
            posted_by, posted_at, initialization_status
        ) VALUES (
            p_business_id, TRUE, TRUE, p_user_id, NOW(), 'COMPLETED'
        );
    END IF;

    success := TRUE;
    journal_entry_id := v_journal_entry_id;
    message := 'Journal entry created with ' || v_line_count || ' lines';
    lines_created := v_line_count;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function 4: Get status (DYNAMIC - returns user's current state)
CREATE OR REPLACE FUNCTION get_opening_balances_status(
    p_business_id UUID
)
RETURNS TABLE(
    chart_of_accounts_created BOOLEAN,
    opening_balances_set BOOLEAN,
    opening_balances_posted BOOLEAN,
    is_balanced BOOLEAN,
    total_debits NUMERIC,
    total_credits NUMERIC,
    difference NUMERIC,
    fiscal_year_start DATE,
    fiscal_year_end DATE,
    currency_code VARCHAR,
    initialization_status VARCHAR
) AS $$
DECLARE
    v_status RECORD;
    v_validation RECORD;
    v_latest_date DATE;
BEGIN
    -- Get business status
    SELECT * INTO v_status FROM business_accounting_status WHERE business_id = p_business_id;

    -- Get latest as_of_date for validation
    SELECT MAX(as_of_date) INTO v_latest_date FROM opening_balances WHERE business_id = p_business_id;

    IF v_latest_date IS NOT NULL THEN
        SELECT * INTO v_validation FROM validate_opening_balances(p_business_id, v_latest_date);
        is_balanced := v_validation.is_valid;
        total_debits := v_validation.total_debits;
        total_credits := v_validation.total_credits;
        difference := v_validation.difference;
    ELSE
        is_balanced := FALSE;
        total_debits := 0;
        total_credits := 0;
        difference := 0;
    END IF;

    chart_of_accounts_created := COALESCE(v_status.chart_of_accounts_created, FALSE);
    opening_balances_set := EXISTS (SELECT 1 FROM opening_balances WHERE business_id = p_business_id);
    opening_balances_posted := COALESCE(v_status.opening_balances_posted, FALSE);
    fiscal_year_start := v_status.fiscal_year_start;
    fiscal_year_end := v_status.fiscal_year_end;
    currency_code := COALESCE(v_status.currency_code, (SELECT currency FROM businesses WHERE id = p_business_id));
    initialization_status := COALESCE(v_status.initialization_status, 'PENDING');

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function 5: Initialize business accounting (sets up standard chart)
CREATE OR REPLACE FUNCTION initialize_business_accounting(
    p_business_id UUID,
    p_user_id UUID,
    p_fiscal_year_start DATE DEFAULT NULL,
    p_currency_code VARCHAR DEFAULT NULL
)
RETURNS TABLE(success BOOLEAN, message TEXT, accounts_created INTEGER) AS $$
DECLARE
    v_account_count INTEGER;
    v_fiscal_start DATE;
    v_currency VARCHAR;
BEGIN
    -- Ensure standard chart of accounts exists
    PERFORM ensure_business_has_complete_accounts(p_business_id);

    -- Count accounts
    SELECT COUNT(*) INTO v_account_count
    FROM chart_of_accounts
    WHERE business_id = p_business_id;

    -- Set user preferences
    v_fiscal_start := COALESCE(p_fiscal_year_start, DATE_TRUNC('year', CURRENT_DATE)::DATE);
    v_currency := COALESCE(p_currency_code, (SELECT currency FROM businesses WHERE id = p_business_id));

    -- Create or update status
    INSERT INTO business_accounting_status (
        business_id, chart_of_accounts_created, fiscal_year_start, fiscal_year_end,
        currency_code, initialization_status, initialized_by, initialized_at
    ) VALUES (
        p_business_id, TRUE, v_fiscal_start, v_fiscal_start + INTERVAL '1 year' - INTERVAL '1 day',
        v_currency, 'PENDING', p_user_id, NOW()
    ) ON CONFLICT (business_id) DO UPDATE
    SET chart_of_accounts_created = TRUE,
        fiscal_year_start = EXCLUDED.fiscal_year_start,
        fiscal_year_end = EXCLUDED.fiscal_year_end,
        currency_code = EXCLUDED.currency_code,
        updated_at = NOW();

    success := TRUE;
    message := 'Business accounting initialized with ' || v_account_count || ' standard accounts';
    accounts_created := v_account_count;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 7: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_accounting_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opening_balances_business_isolation ON opening_balances;
CREATE POLICY opening_balances_business_isolation ON opening_balances
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

DROP POLICY IF EXISTS business_status_business_isolation ON business_accounting_status;
CREATE POLICY business_status_business_isolation ON business_accounting_status
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- SECTION 8: BACKFILL FOR EXISTING BUSINESSES
-- ============================================================================

DO $$
DECLARE
    v_business_record RECORD;
    v_user_id UUID;
    v_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'UPGRADING EXISTING BUSINESSES TO STANDARD CHART';
    RAISE NOTICE '========================================';

    FOR v_business_record IN SELECT id FROM businesses LOOP
        SELECT id INTO v_user_id FROM users WHERE business_id = v_business_record.id LIMIT 1;

        IF v_user_id IS NOT NULL THEN
            -- This will add any missing standard accounts
            PERFORM ensure_business_has_complete_accounts(v_business_record.id);
            
            -- Initialize status if not exists
            IF NOT EXISTS (SELECT 1 FROM business_accounting_status WHERE business_id = v_business_record.id) THEN
                INSERT INTO business_accounting_status (
                    business_id, chart_of_accounts_created, initialization_status
                ) VALUES (
                    v_business_record.id, TRUE, 'PENDING'
                );
            END IF;
            
            v_count := v_count + 1;
            RAISE NOTICE '  ✅ Upgraded business: %', v_business_record.id;
        END IF;
    END LOOP;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'UPGRADE COMPLETE: % businesses', v_count;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- SECTION 9: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_expected_accounts INTEGER := 66;
    v_test_business_id UUID;
    v_actual_count INTEGER;
BEGIN
    -- Get a test business
    SELECT id INTO v_test_business_id FROM businesses LIMIT 1;

    IF v_test_business_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_actual_count
        FROM chart_of_accounts
        WHERE business_id = v_test_business_id;

        RAISE NOTICE '========================================';
        RAISE NOTICE 'OPENING BALANCE SYSTEM INSTALLATION';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Expected standard accounts: %', v_expected_accounts;
        RAISE NOTICE 'Actual accounts in test business: %', v_actual_count;
        
        IF v_actual_count >= v_expected_accounts THEN
            RAISE NOTICE '✅ Standard chart verified!';
        ELSE
            RAISE NOTICE '⚠️ Some accounts may be missing. Run ensure_business_has_complete_accounts()';
        END IF;
    END IF;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '   1. Create backend/app/services/openingBalanceService.js';
    RAISE NOTICE '   2. Create backend/app/controllers/openingBalanceController.js';
    RAISE NOTICE '   3. Create backend/app/routes/openingBalanceRoutes.js';
    RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK SECTION
-- ============================================================================
/*
DROP TRIGGER IF EXISTS trigger_opening_balances_updated_at ON opening_balances;
DROP TRIGGER IF EXISTS trigger_business_status_updated_at ON business_accounting_status;
DROP FUNCTION IF EXISTS validate_opening_balances(UUID, DATE);
DROP FUNCTION IF EXISTS set_opening_balance(UUID, VARCHAR, NUMERIC, VARCHAR, UUID, DATE, TEXT);
DROP FUNCTION IF EXISTS create_opening_balance_journal_entry(UUID, UUID, DATE);
DROP FUNCTION IF EXISTS get_opening_balances_status(UUID);
DROP FUNCTION IF EXISTS initialize_business_accounting(UUID, UUID, DATE, VARCHAR);
DROP FUNCTION IF EXISTS ensure_business_has_complete_accounts(UUID);
DROP TABLE IF EXISTS business_accounting_status;
DROP TABLE IF EXISTS opening_balances;
*/
