-- File: database/migrations/115_fix_expense_accounting_workflow.sql
BEGIN;

-- ============================================================================
-- PART 1: FIX EXISTING EXPENSES (Backfill missing expense recognition)
-- ============================================================================
DO $$
DECLARE
    v_expense_record RECORD;
    v_journal_entry_id UUID;
    v_expense_account_id UUID;
    v_accounts_payable_id UUID;
    v_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING EXISTING EXPENSE ACCOUNTING';
    RAISE NOTICE '========================================';
    
    -- Get expense account (5700 - Other Expenses as fallback)
    SELECT id INTO v_expense_account_id
    FROM chart_of_accounts
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
        AND account_code = '5700'
    LIMIT 1;
    
    -- Get Accounts Payable account (2100)
    SELECT id INTO v_accounts_payable_id
    FROM chart_of_accounts
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
        AND account_code = '2100'
    LIMIT 1;
    
    -- Find all paid expenses missing recognition
    FOR v_expense_record IN (
        SELECT 
            e.id as expense_id,
            e.description,
            e.amount,
            e.business_id,
            e.expense_date,
            ec.account_code
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
            AND e.status = 'paid'
            -- Missing expense recognition
            AND NOT EXISTS (
                SELECT 1 FROM journal_entries je
                WHERE je.reference_type = 'expense'
                    AND je.reference_id = e.id::TEXT
            )
        ORDER BY e.created_at
    ) LOOP
        
        RAISE NOTICE 'Fixing expense: % - %', v_expense_record.description, v_expense_record.amount;
        
        -- Create the missing expense recognition journal entry
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
            v_expense_record.business_id,
            v_expense_record.expense_date,
            'JE-EXP-' || v_expense_record.expense_id::TEXT,
            'expense',
            v_expense_record.expense_id::TEXT,
            'Expense: ' || v_expense_record.description,
            v_expense_record.amount,
            '00000000-0000-0000-0000-000000000000', -- System user
            NOW()
        ) RETURNING id INTO v_journal_entry_id;
        
        -- Create journal entry lines
        -- DEBIT: Expense Account
        INSERT INTO journal_entry_lines (
            business_id,
            journal_entry_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_expense_record.business_id,
            v_journal_entry_id,
            v_expense_account_id,
            'debit',
            v_expense_record.amount,
            'Expense: ' || v_expense_record.description
        );
        
        -- CREDIT: Accounts Payable
        INSERT INTO journal_entry_lines (
            business_id,
            journal_entry_id,
            account_id,
            line_type,
            amount,
            description
        ) VALUES (
            v_expense_record.business_id,
            v_journal_entry_id,
            v_accounts_payable_id,
            'credit',
            v_expense_record.amount,
            'Accounts Payable - Expense'
        );
        
        v_count := v_count + 1;
        RAISE NOTICE '  ✅ Created journal entry: %', v_journal_entry_id;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXED % EXPENSE(S)', v_count;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- PART 2: UPDATE process_expense_payment FUNCTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Updating process_expense_payment function...';
END $$;

CREATE OR REPLACE FUNCTION process_expense_payment(
    p_expense_id UUID,
    p_payment_method VARCHAR(50),
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_expense RECORD;
    v_business_id UUID;
    v_payment_account_id UUID;
    v_accounts_payable_id UUID;
    v_expense_recognition_exists BOOLEAN;
BEGIN
    -- Get expense details
    SELECT 
        business_id,
        amount,
        status,
        journal_entry_id
    INTO v_expense
    FROM expenses
    WHERE id = p_expense_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found: %', p_expense_id;
    END IF;

    v_business_id := v_expense.business_id;

    -- Only process unpaid expenses
    IF v_expense.status = 'paid' THEN
        RAISE NOTICE 'Expense already paid: %', p_expense_id;
        RETURN v_expense.journal_entry_id;
    END IF;

    -- ✅ CRITICAL FIX: Check if expense recognition exists
    SELECT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.business_id = v_business_id
          AND je.reference_type = 'expense'
          AND je.reference_id = p_expense_id::TEXT
    ) INTO v_expense_recognition_exists;

    IF NOT v_expense_recognition_exists THEN
        RAISE EXCEPTION 'Expense not recognized yet. Expense must be approved and recognized before payment. Expense ID: %', p_expense_id;
    END IF;

    -- Get payment account
    v_payment_account_id := get_account_id_by_payment_method(v_business_id, p_payment_method);

    -- Get Accounts Payable account
    SELECT id INTO v_accounts_payable_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '2100'
    LIMIT 1;

    -- Create payment journal entry
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
        'JE-PAY-' || p_expense_id::TEXT,
        'expense_payment',
        p_expense_id::TEXT,
        'Payment for expense',
        v_expense.amount,
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Debit Accounts Payable, Credit Payment Account
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
        v_accounts_payable_id,
        'debit',
        v_expense.amount,
        'Pay down Accounts Payable'
    );

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
        v_payment_account_id,
        'credit',
        v_expense.amount,
        'Payment for expense'
    );

    -- Update expense status
    UPDATE expenses
    SET status = 'paid',
        payment_method = p_payment_method,
        paid_by = p_user_id,
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_expense_id;

    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '✅ Updated process_expense_payment function';
    RAISE NOTICE '   - Now checks for expense recognition before payment';
    RAISE NOTICE '   - Prevents payment without proper accounting';
END $$;

-- ============================================================================
-- PART 3: CREATE EXPENSE APPROVAL FUNCTION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Creating expense approval function...';
END $$;

CREATE OR REPLACE FUNCTION approve_expense(
    p_expense_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_expense RECORD;
BEGIN
    -- Get expense details
    SELECT 
        business_id,
        amount,
        status,
        approved_at
    INTO v_expense
    FROM expenses
    WHERE id = p_expense_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found: %', p_expense_id;
    END IF;

    -- Check if already approved
    IF v_expense.status IN ('approved', 'paid') THEN
        RAISE NOTICE 'Expense already approved or paid: %', p_expense_id;
        
        -- Return existing journal entry if any
        SELECT journal_entry_id INTO v_journal_entry_id
        FROM expenses
        WHERE id = p_expense_id;
        
        RETURN v_journal_entry_id;
    END IF;

    -- Create accounting for the expense
    v_journal_entry_id := create_accounting_for_expense(p_expense_id, p_user_id);

    -- Update expense status to approved
    UPDATE expenses
    SET status = 'approved',
        approved_by = p_user_id,
        approved_at = NOW(),
        updated_at = NOW()
    WHERE id = p_expense_id;

    RAISE NOTICE '✅ Expense approved: %', p_expense_id;
    RETURN v_journal_entry_id;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    RAISE NOTICE '✅ Created approve_expense function';
    RAISE NOTICE '   - Creates expense accounting (DEBIT Expense, CREDIT A/P)';
    RAISE NOTICE '   - Updates expense status to "approved"';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    v_fixed_count INTEGER;
    v_total_paid_expenses INTEGER;
    v_expenses_with_recognition INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION';
    RAISE NOTICE '========================================';
    
    -- Count fixed expenses
    SELECT COUNT(*) INTO v_fixed_count
    FROM expenses e
    WHERE e.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
        AND e.status = 'paid'
        AND EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.reference_type = 'expense'
                AND je.reference_id = e.id::TEXT
        );
    
    -- Count total paid expenses
    SELECT COUNT(*) INTO v_total_paid_expenses
    FROM expenses e
    WHERE e.business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
        AND e.status = 'paid';
    
    RAISE NOTICE 'Fixed Expenses: % / %', v_fixed_count, v_total_paid_expenses;
    
    IF v_fixed_count = v_total_paid_expenses THEN
        RAISE NOTICE '✅ ALL expenses now have proper accounting!';
    ELSE
        RAISE NOTICE '⚠️ Some expenses still missing accounting: %', v_total_paid_expenses - v_fixed_count;
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ MIGRATION COMPLETE';
    RAISE NOTICE '  1. Fixed existing expense accounting';
    RAISE NOTICE '  2. Updated process_expense_payment to require approval first';
    RAISE NOTICE '  3. Created approve_expense function';
    RAISE NOTICE '';
    RAISE NOTICE '🔄 NEXT: Update application code to use new workflow:';
    RAISE NOTICE '  - Create expense → Status: pending';
    RAISE NOTICE '  - Approve expense → Calls approve_expense()';
    RAISE NOTICE '  - Pay expense → Calls process_expense_payment()';
END $$;
