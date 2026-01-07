-- ============================================================================
-- MIGRATION 097: FIX EXPENSE ACCOUNTING INTEGRATION
-- ============================================================================
-- Minimal changes to add accounting capabilities to existing expense system
-- ============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FIXING EXPENSE ACCOUNTING INTEGRATION';
    RAISE NOTICE '========================================';
END;
$$;

-- ============================================================================
-- PART 1: ADD ACCOUNTING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add account_code to expense_categories (for accounting mapping)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expense_categories' AND column_name = 'account_code'
    ) THEN
        ALTER TABLE expense_categories ADD COLUMN account_code VARCHAR(20);
        
        -- Set default account codes for existing categories
        UPDATE expense_categories 
        SET account_code = CASE 
            WHEN name ILIKE '%rent%' THEN '5300'
            WHEN name ILIKE '%salary%' OR name ILIKE '%wage%' THEN '5200'
            WHEN name ILIKE '%utility%' THEN '5400'
            WHEN name ILIKE '%office%' OR name ILIKE '%suppl%' THEN '5201'
            WHEN name ILIKE '%fuel%' OR name ILIKE '%transport%' THEN '5205'
            WHEN name ILIKE '%market%' OR name ILIKE '%advertis%' THEN '5500'
            ELSE '5700'  -- Other Expenses
        END;
    END IF;
END;
$$;

-- Add accounting columns to expenses
DO $$
BEGIN
    -- Add journal_entry_id for accounting link
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'journal_entry_id'
    ) THEN
        ALTER TABLE expenses ADD COLUMN journal_entry_id UUID REFERENCES journal_entries(id);
    END IF;
    
    -- Add payment_method for standard accounting (optional, can use wallet)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(50);
    END IF;
    
    -- Add vendor_name for better tracking
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'vendor_name'
    ) THEN
        ALTER TABLE expenses ADD COLUMN vendor_name VARCHAR(255);
    END IF;
    
    -- Add tax_amount and total_amount for completeness
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'tax_amount'
    ) THEN
        ALTER TABLE expenses ADD COLUMN tax_amount DECIMAL(15,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'total_amount'
    ) THEN
        ALTER TABLE expenses ADD COLUMN total_amount DECIMAL(15,2);
        
        -- Calculate total_amount for existing expenses
        UPDATE expenses 
        SET total_amount = COALESCE(amount, 0) + COALESCE(tax_amount, 0)
        WHERE total_amount IS NULL;
    END IF;
END;
$$;

-- ============================================================================
-- PART 2: UPDATE EXISTING ACCOUNTING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_accounting_for_expense(
    p_expense_id UUID,
    p_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_business_id UUID;
    v_expense RECORD;
    v_category RECORD;
    v_expense_account_id UUID;
    v_payment_account_id UUID;
    v_accounts_payable_id UUID;
    v_wallet_gl_account_id UUID;
BEGIN
    -- Get expense details
    SELECT 
        e.business_id,
        e.amount,
        e.total_amount,
        e.description,
        e.expense_date,
        e.wallet_id,
        e.payment_method,
        e.status,
        ec.account_code,
        mw.gl_account_id,
        mw.wallet_type
    INTO v_expense
    FROM expenses e
    LEFT JOIN expense_categories ec ON e.category_id = ec.id
    LEFT JOIN money_wallets mw ON e.wallet_id = mw.id
    WHERE e.id = p_expense_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Expense not found: %', p_expense_id;
    END IF;

    v_business_id := v_expense.business_id;

    -- Check if accounting already exists
    SELECT id INTO v_journal_entry_id
    FROM journal_entries
    WHERE reference_type = 'expense'
      AND reference_id = p_expense_id::TEXT
      AND business_id = v_business_id
    LIMIT 1;

    IF v_journal_entry_id IS NOT NULL THEN
        RAISE NOTICE 'Accounting already exists for expense: %', p_expense_id;
        RETURN v_journal_entry_id;
    END IF;

    -- Get expense account (from category account_code)
    IF v_expense.account_code IS NOT NULL THEN
        SELECT id INTO v_expense_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code = v_expense.account_code
        LIMIT 1;
    END IF;

    -- Fallback: Use "Other Expenses" (5700) if no category mapping
    IF v_expense_account_id IS NULL THEN
        SELECT id INTO v_expense_account_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code = '5700'
        LIMIT 1;
    END IF;

    -- Get payment account
    IF v_expense.wallet_id IS NOT NULL AND v_expense.gl_account_id IS NOT NULL THEN
        -- Use wallet's GL account for payment
        v_payment_account_id := v_expense.gl_account_id;
    ELSIF v_expense.payment_method IS NOT NULL THEN
        -- Use payment method mapping
        v_payment_account_id := get_account_id_by_payment_method(v_business_id, v_expense.payment_method);
    ELSE
        -- Default to Accounts Payable (2100) for unpaid expenses
        SELECT id INTO v_accounts_payable_id
        FROM chart_of_accounts
        WHERE business_id = v_business_id
          AND account_code = '2100'
        LIMIT 1;
        v_payment_account_id := v_accounts_payable_id;
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
        COALESCE(v_expense.expense_date, CURRENT_DATE),
        'JE-EXP-' || p_expense_id::TEXT,
        'expense',
        p_expense_id::TEXT,
        'Expense: ' || COALESCE(v_expense.description, 'No description'),
        COALESCE(v_expense.total_amount, v_expense.amount),
        COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create journal entry lines based on expense status
    IF v_expense.status = 'paid' THEN
        -- Paid expense: Debit Expense, Credit Payment Account
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
            v_expense_account_id,
            'debit',
            v_expense.amount,
            'Expense: ' || v_expense.description
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
    ELSE
        -- Unpaid expense: Debit Expense, Credit Accounts Payable
        IF v_accounts_payable_id IS NULL THEN
            SELECT id INTO v_accounts_payable_id
            FROM chart_of_accounts
            WHERE business_id = v_business_id
              AND account_code = '2100'
            LIMIT 1;
        END IF;

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
            v_expense_account_id,
            'debit',
            v_expense.amount,
            'Expense: ' || v_expense.description
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
            v_accounts_payable_id,
            'credit',
            v_expense.amount,
            'Accounts Payable - Expense'
        );
    END IF;

    -- Link journal entry to expense
    UPDATE expenses
    SET journal_entry_id = v_journal_entry_id,
        updated_at = NOW()
    WHERE id = p_expense_id;

    -- Audit log
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        v_business_id,
        COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
        'expense.accounting.created',
        'expense',
        p_expense_id,
        '{}'::jsonb,
        jsonb_build_object(
            'journal_entry_id', v_journal_entry_id,
            'amount', v_expense.amount,
            'status', v_expense.status
        ),
        jsonb_build_object('function', 'create_accounting_for_expense'),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        old_values, new_values, metadata, created_at
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::UUID),
        'expense.accounting.error',
        'expense',
        p_expense_id,
        '{}'::jsonb,
        jsonb_build_object('error', SQLERRM),
        jsonb_build_object('function', 'create_accounting_for_expense'),
        NOW()
    );
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: CREATE PAYMENT PROCESSING FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION process_expense_payment(
    p_expense_id UUID,
    p_payment_method VARCHAR(50),
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_expense RECORD;
    v_business_id UUID;
    v_payment_account_id UUID;
    v_accounts_payable_id UUID;
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

COMMIT;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'EXPENSE ACCOUNTING FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Added accounting columns to existing tables';
    RAISE NOTICE '✅ Enhanced existing accounting function';
    RAISE NOTICE '✅ Added payment processing function';
    RAISE NOTICE '✅ Backward compatible - existing data preserved';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Expense system now supports:';
    RAISE NOTICE '   • Wallet-based expenses (existing workflow)';
    RAISE NOTICE '   • Standard accounting (Accounts Payable workflow)';
    RAISE NOTICE '   • Mixed payment methods (cash, bank, mobile)';
END;
$$;
