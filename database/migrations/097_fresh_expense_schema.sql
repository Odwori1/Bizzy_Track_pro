-- ============================================================================
-- MIGRATION 097: FRESH EXPENSE SCHEMA (Phase 2 Blueprint)
-- ============================================================================
-- Creates complete expense system aligned with accounting blueprint
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CREATING FRESH EXPENSE SCHEMA';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: EXPENSE CATEGORIES (with account_code for accounting integration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_categories_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    account_code VARCHAR(20) NOT NULL, -- Links to chart_of_accounts (e.g., 5201)
    color VARCHAR(7) DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_id, name)
);

-- Copy existing data if any
INSERT INTO expense_categories_new (id, business_id, name, description, color, is_active, created_at, updated_at, account_code)
SELECT 
    id, business_id, name, description, color, is_active, created_at, updated_at,
    CASE 
        WHEN name ILIKE '%rent%' THEN '5300'
        WHEN name ILIKE '%salary%' OR name ILIKE '%wage%' THEN '5200'
        WHEN name ILIKE '%utility%' THEN '5400'
        WHEN name ILIKE '%market%' OR name ILIKE '%advertis%' THEN '5500'
        ELSE '5700'  -- Other Expenses
    END as account_code
FROM expense_categories;

-- Drop old table and rename new one
DROP TABLE IF EXISTS expense_categories CASCADE;
ALTER TABLE expense_categories_new RENAME TO expense_categories;

-- Create indexes
CREATE INDEX idx_expense_categories_business ON expense_categories(business_id);
CREATE INDEX idx_expense_categories_account ON expense_categories(business_id, account_code);

-- ============================================================================
-- PART 2: EXPENSES MASTER TABLE (aligned with blueprint)
-- ============================================================================

CREATE TABLE IF NOT EXISTS expenses_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    expense_number VARCHAR(50) UNIQUE NOT NULL,
    vendor_name VARCHAR(255),
    category_id UUID REFERENCES expense_categories(id),
    amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
    tax_amount DECIMAL(15,2) DEFAULT 0,
    total_amount DECIMAL(15,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    payment_method VARCHAR(50) CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'credit')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'void')),
    description TEXT,
    receipt_image_url TEXT,
    approved_by UUID REFERENCES users(id),
    paid_by UUID REFERENCES users(id),
    journal_entry_id UUID REFERENCES journal_entries(id), -- Accounting link
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP,
    approved_at TIMESTAMP
);

-- Copy existing data if any
INSERT INTO expenses_new (
    id, business_id, vendor_name, category_id, amount, tax_amount, total_amount,
    expense_date, due_date, payment_method, status, description, receipt_image_url,
    approved_by, paid_by, journal_entry_id, created_by, created_at, updated_at,
    paid_at, approved_at, expense_number
)
SELECT 
    id, business_id, 
    NULL as vendor_name, -- No vendor_name in old schema
    category_id, 
    amount, 
    0 as tax_amount, 
    amount as total_amount, -- Assume tax_amount was 0
    expense_date, 
    NULL as due_date, -- No due_date in old schema
    NULL as payment_method, -- Will be set based on wallet or default
    status, 
    description, 
    receipt_url as receipt_image_url,
    approved_by, 
    NULL as paid_by, -- No paid_by in old schema
    NULL as journal_entry_id, -- No accounting link yet
    created_by, 
    created_at, 
    updated_at,
    NULL as paid_at, -- No paid_at in old schema
    approved_at,
    'LEG-' || id::TEXT as expense_number -- Legacy numbering
FROM expenses;

-- Drop old table and rename new one
DROP TABLE IF EXISTS expenses CASCADE;
ALTER TABLE expenses_new RENAME TO expenses;

-- Create indexes
CREATE INDEX idx_expenses_business_id ON expenses(business_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id);
CREATE INDEX idx_expenses_journal_entry ON expenses(journal_entry_id);

-- ============================================================================
-- PART 3: EXPENSE ATTACHMENTS (for multiple receipts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_expense_attachments_expense ON expense_attachments(expense_id);

-- ============================================================================
-- PART 4: EXPENSE PAYMENTS (for partial/split payments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card')),
    paid_from_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
    reference_number VARCHAR(100),
    notes TEXT,
    paid_by UUID REFERENCES users(id),
    paid_at TIMESTAMP DEFAULT NOW(),
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_expense_payments_expense ON expense_payments(expense_id);
CREATE INDEX idx_expense_payments_account ON expense_payments(paid_from_account_id);

-- ============================================================================
-- PART 5: SEED DEFAULT CATEGORIES FOR TEST BUSINESS
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_seeded_count INTEGER := 0;
BEGIN
    INSERT INTO expense_categories (business_id, name, description, account_code, color) VALUES
    (v_business_id, 'Office Supplies', 'Pens, paper, stationery', '5201', '#3B82F6'),
    (v_business_id, 'Utilities', 'Electricity, water, internet', '5202', '#10B981'),
    (v_business_id, 'Rent', 'Office/store rent', '5203', '#F59E0B'),
    (v_business_id, 'Marketing', 'Advertising and promotion', '5204', '#EF4444'),
    (v_business_id, 'Travel', 'Transport and accommodation', '5205', '#8B5CF6')
    ON CONFLICT (business_id, name) DO UPDATE SET
        account_code = EXCLUDED.account_code,
        color = EXCLUDED.color;
    
    GET DIAGNOSTICS v_seeded_count = ROW_COUNT;
    RAISE NOTICE 'Seeded/updated % expense categories', v_seeded_count;
END;
$$;

-- ============================================================================
-- PART 6: CREATE EXPENSE NUMBER SEQUENCE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_expense_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year VARCHAR(4);
    v_sequence INTEGER;
    v_expense_number VARCHAR(50);
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
    
    -- Get next sequence number for this business and year
    SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM '^EXP-(\d+)-(\d+)$') AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM expenses
    WHERE business_id = p_business_id
      AND expense_number LIKE 'EXP-' || v_year || '-%';
    
    -- If no sequence found for this year, start from 1
    IF v_sequence IS NULL THEN
        v_sequence := 1;
    END IF;
    
    v_expense_number := 'EXP-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');
    RETURN v_expense_number;
END;
$$ LANGUAGE plpgsql;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FRESH EXPENSE SCHEMA COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Created expense_categories with account_code';
    RAISE NOTICE '✅ Created expenses with accounting columns';
    RAISE NOTICE '✅ Created expense_attachments table';
    RAISE NOTICE '✅ Created expense_payments table';
    RAISE NOTICE '✅ Seeded default categories';
    RAISE NOTICE '✅ Created expense number generator';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Schema ready for accounting function!';
END;
$$;
