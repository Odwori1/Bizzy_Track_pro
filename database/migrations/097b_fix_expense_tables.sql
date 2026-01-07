-- ============================================================================
-- MIGRATION 097b: FIX EXPENSE TABLES (IDEMPOTENT)
-- ============================================================================
-- Safely creates missing expense tables and adds missing columns
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING EXPENSE TABLES (IDEMPOTENT)';
    RAISE NOTICE '========================================';
END;
$$;

-- 1. Create expense_attachments if not exists (WITHOUT foreign key initially)
CREATE TABLE IF NOT EXISTS expense_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    uploaded_by UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create expense_payments if not exists
CREATE TABLE IF NOT EXISTS expense_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID,
    amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card')),
    paid_from_account_id UUID,
    reference_number VARCHAR(100),
    notes TEXT,
    paid_by UUID,
    paid_at TIMESTAMP DEFAULT NOW(),
    journal_entry_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Add missing columns to expenses table
DO $$
BEGIN
    -- Add journal_entry_id if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='journal_entry_id') THEN
        ALTER TABLE expenses ADD COLUMN journal_entry_id UUID REFERENCES journal_entries(id);
    END IF;

    -- Add payment_method if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='payment_method') THEN
        ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(50) 
            CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'credit'));
    END IF;

    -- Add vendor_name if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='vendor_name') THEN
        ALTER TABLE expenses ADD COLUMN vendor_name VARCHAR(255);
    END IF;

    -- Add expense_number if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='expense_number') THEN
        ALTER TABLE expenses ADD COLUMN expense_number VARCHAR(50) UNIQUE;
    END IF;

    -- Add tax_amount and total_amount if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='tax_amount') THEN
        ALTER TABLE expenses ADD COLUMN tax_amount DECIMAL(15,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='total_amount') THEN
        ALTER TABLE expenses ADD COLUMN total_amount DECIMAL(15,2);
        
        -- Set total_amount = amount + tax_amount for existing rows
        UPDATE expenses 
        SET total_amount = COALESCE(amount, 0) + COALESCE(tax_amount, 0)
        WHERE total_amount IS NULL;
    END IF;

    -- Add due_date if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expenses' AND column_name='due_date') THEN
        ALTER TABLE expenses ADD COLUMN due_date DATE;
    END IF;
END;
$$;

-- 4. Add missing columns to expense_categories
DO $$
BEGIN
    -- Add account_code if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='expense_categories' AND column_name='account_code') THEN
        ALTER TABLE expense_categories ADD COLUMN account_code VARCHAR(20);
        
        -- Set default account codes based on category name
        UPDATE expense_categories 
        SET account_code = CASE 
            WHEN name ILIKE '%rent%' THEN '5300'
            WHEN name ILIKE '%salary%' OR name ILIKE '%wage%' THEN '5200'
            WHEN name ILIKE '%utility%' THEN '5400'
            WHEN name ILIKE '%market%' OR name ILIKE '%advertis%' THEN '5500'
            ELSE '5700'  -- Other Expenses
        END
        WHERE account_code IS NULL;
    END IF;
END;
$$;

-- 5. Now add foreign key constraints if tables exist
DO $$
BEGIN
    -- Add foreign key to expense_attachments if expenses table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='expenses') THEN
        ALTER TABLE expense_attachments 
        ADD CONSTRAINT fk_expense_attachments_expense 
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE;
    END IF;

    -- Add foreign key to expense_payments if expenses table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='expenses') THEN
        ALTER TABLE expense_payments 
        ADD CONSTRAINT fk_expense_payments_expense 
        FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE;
    END IF;

    -- Add foreign key for paid_from_account_id if chart_of_accounts exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='chart_of_accounts') THEN
        ALTER TABLE expense_payments 
        ADD CONSTRAINT fk_expense_payments_account 
        FOREIGN KEY (paid_from_account_id) REFERENCES chart_of_accounts(id);
    END IF;
END;
$$;

-- 6. Create indexes (only if they don't exist)
DO $$
BEGIN
    -- Index for expenses
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_expenses_business_id') THEN
        CREATE INDEX idx_expenses_business_id ON expenses(business_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_expenses_status') THEN
        CREATE INDEX idx_expenses_status ON expenses(status);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_expenses_date') THEN
        CREATE INDEX idx_expenses_date ON expenses(expense_date);
    END IF;
    
    -- Index for expense_categories
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_expense_categories_business') THEN
        CREATE INDEX idx_expense_categories_business ON expense_categories(business_id);
    END IF;
    
    -- Index for expense_payments
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_expense_payments_expense') THEN
        CREATE INDEX idx_expense_payments_expense ON expense_payments(expense_id);
    END IF;
END;
$$;

-- 7. Seed default expense categories if not exist
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
    ON CONFLICT (business_id, name) DO UPDATE SET
        account_code = EXCLUDED.account_code,
        color = EXCLUDED.color;
END;
$$;

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'EXPENSE TABLES FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Verified/Created all expense tables';
    RAISE NOTICE '✅ Added missing columns to existing tables';
    RAISE NOTICE '✅ Created necessary indexes';
    RAISE NOTICE '✅ Seeded expense categories with account codes';
    RAISE NOTICE '';
END;
$$;
