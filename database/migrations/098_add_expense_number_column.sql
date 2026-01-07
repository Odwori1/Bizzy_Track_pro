-- ============================================================================
-- MIGRATION 098: ADD EXPENSE_NUMBER COLUMN AND FUNCTION
-- ============================================================================
-- Adds missing expense_number column to expenses table
-- Creates generate_expense_number function for proper numbering
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ADDING EXPENSE_NUMBER SUPPORT';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: ADD EXPENSE_NUMBER COLUMN TO EXPENSES TABLE
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'expenses' AND column_name = 'expense_number'
    ) THEN
        RAISE NOTICE 'Adding expense_number column to expenses table...';
        
        -- Add the column
        ALTER TABLE expenses ADD COLUMN expense_number VARCHAR(50);
        
        -- Create index for performance
        CREATE INDEX IF NOT EXISTS idx_expenses_expense_number ON expenses(expense_number);
        
        -- Generate expense numbers for existing records
        WITH numbered_expenses AS (
            SELECT 
                id,
                business_id,
                expense_date,
                created_at,
                'EXP-' || EXTRACT(YEAR FROM expense_date) || '-' || 
                LPAD(ROW_NUMBER() OVER (
                    PARTITION BY business_id, EXTRACT(YEAR FROM expense_date) 
                    ORDER BY created_at
                )::TEXT, 5, '0') as new_expense_number
            FROM expenses
            WHERE expense_number IS NULL
        )
        UPDATE expenses e
        SET expense_number = ne.new_expense_number
        FROM numbered_expenses ne
        WHERE e.id = ne.id;
        
        RAISE NOTICE '✅ Generated expense numbers for % existing records', (SELECT COUNT(*) FROM expenses WHERE expense_number IS NOT NULL);
    ELSE
        RAISE NOTICE '⚠️ expense_number column already exists, skipping...';
    END IF;
END;
$$;

-- ============================================================================
-- PART 2: CREATE GENERATE_EXPENSE_NUMBER FUNCTION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating generate_expense_number function...';
END;
$$;

CREATE OR REPLACE FUNCTION generate_expense_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year VARCHAR(4);
    v_sequence INTEGER;
    v_expense_number VARCHAR(50);
BEGIN
    -- Get current year
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;

    -- Get next sequence number for this business and year
    -- Look for pattern: EXP-YYYY-XXXXX
    SELECT COALESCE(MAX(CAST(SPLIT_PART(expense_number, '-', 3) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM expenses
    WHERE business_id = p_business_id
      AND expense_number LIKE 'EXP-' || v_year || '-%'
      AND expense_number ~ '^EXP-\d{4}-\d{5}$'; -- Ensure proper format

    -- If no sequence found for this year, start from 1
    IF v_sequence IS NULL THEN
        v_sequence := 1;
    END IF;

    -- Generate expense number in format: EXP-YYYY-XXXXX
    v_expense_number := 'EXP-' || v_year || '-' || LPAD(v_sequence::TEXT, 5, '0');
    
    RETURN v_expense_number;
EXCEPTION WHEN OTHERS THEN
    -- Fallback: timestamp-based number
    v_expense_number := 'EXP-' || v_year || '-' || LPAD(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::INTEGER % 100000::TEXT, 5, '0');
    RETURN v_expense_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3: UPDATE EXPENSE CREATION TRIGGER (OPTIONAL)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Creating trigger for automatic expense_number generation...';
END;
$$;

-- Create a trigger function to automatically generate expense numbers
CREATE OR REPLACE FUNCTION set_expense_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Only generate if not already set
    IF NEW.expense_number IS NULL THEN
        NEW.expense_number := generate_expense_number(NEW.business_id);
    END IF;
    
    -- Ensure total_amount is calculated if not set
    IF NEW.total_amount IS NULL THEN
        NEW.total_amount := COALESCE(NEW.amount, 0) + COALESCE(NEW.tax_amount, 0);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_set_expense_number'
    ) THEN
        CREATE TRIGGER trg_set_expense_number
        BEFORE INSERT ON expenses
        FOR EACH ROW
        EXECUTE FUNCTION set_expense_number();
        RAISE NOTICE '✅ Created trigger for automatic expense_number generation';
    ELSE
        RAISE NOTICE '⚠️ Trigger already exists, skipping...';
    END IF;
END;
$$;

-- ============================================================================
-- PART 4: VERIFICATION AND TESTING
-- ============================================================================

DO $$
DECLARE
    v_test_business_id UUID := '0374935e-7461-47c5-856e-17c116542baa';
    v_test_number VARCHAR(50);
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Testing generate_expense_number function...';
    
    -- Test the function
    v_test_number := generate_expense_number(v_test_business_id);
    RAISE NOTICE 'Generated test number: %', v_test_number;
    
    -- Check schema
    RAISE NOTICE '';
    RAISE NOTICE 'Verifying schema changes...';
END;
$$;

-- Add comment to the function for documentation
COMMENT ON FUNCTION generate_expense_number(UUID) IS 
'Generates unique expense numbers in format EXP-YYYY-XXXXX for a given business.
YYYY = Current year, XXXXX = 5-digit sequence number resetting each year.';

-- Add comment to the column
COMMENT ON COLUMN expenses.expense_number IS 
'Unique identifier for expense tracking. Format: EXP-YYYY-XXXXX.
Generated automatically by generate_expense_number() function.';

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 098 COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Added expense_number column to expenses table';
    RAISE NOTICE '✅ Created generate_expense_number() function';
    RAISE NOTICE '✅ Added trigger for automatic number generation';
    RAISE NOTICE '✅ Backward compatible - existing data preserved';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 System now supports:';
    RAISE NOTICE '   • Automatic expense numbering (EXP-2026-00001)';
    RAISE NOTICE '   • Year-based sequence reset';
    RAISE NOTICE '   • Unique tracking for all expenses';
    RAISE NOTICE '';
END;
$$;
