-- ============================================================================
-- MIGRATION 097: CREATE EXPENSE MANAGEMENT TABLES
-- ============================================================================
-- Creates tables for expense tracking with full accounting integration
-- ============================================================================

BEGIN;

-- 1. Expense Categories (if not exists)
CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    account_code VARCHAR(20) NOT NULL, -- Links to chart_of_accounts (e.g., 5201 for Office Supplies)
    color VARCHAR(7) DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(business_id, name)
);

-- 2. Expenses Master Table
CREATE TABLE IF NOT EXISTS expenses (
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
    journal_entry_id UUID REFERENCES journal_entries(id), -- Links to accounting
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP,
    approved_at TIMESTAMP
);

-- 3. Expense Attachments (for multiple receipt images)
CREATE TABLE IF NOT EXISTS expense_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Expense Payments (for partial/split payments)
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

-- Create indexes for performance
CREATE INDEX idx_expenses_business_id ON expenses(business_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expense_categories_business ON expense_categories(business_id);
CREATE INDEX idx_expense_payments_expense ON expense_payments(expense_id);

-- Insert default expense categories for our test business
DO $$
DECLARE
    v_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
BEGIN
    INSERT INTO expense_categories (business_id, name, description, account_code, color) VALUES
    (v_business_id, 'Office Supplies', 'Pens, paper, stationery', '5201', '#3B82F6'),
    (v_business_id, 'Utilities', 'Electricity, water, internet', '5202', '#10B981'),
    (v_business_id, 'Rent', 'Office/store rent', '5203', '#F59E0B'),
    (v_business_id, 'Marketing', 'Advertising and promotion', '5204', '#EF4444'),
    (v_business_id, 'Travel', 'Transport and accommodation', '5205', '#8B5CF6')
    ON CONFLICT (business_id, name) DO NOTHING;
END;
$$;

COMMIT;
