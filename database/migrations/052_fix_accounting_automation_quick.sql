-- ============================================================================
-- QUICK FIX MIGRATION
-- ============================================================================
-- File: database/migrations/052_fix_accounting_automation_quick.sql
-- ============================================================================

-- First, DROP the existing function to avoid parameter name conflict
DROP FUNCTION IF EXISTS create_journal_entry_for_pos_transaction(UUID, UUID);

-- Now create the fixed function with correct parameter names
CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction(
    p_pos_transaction_id UUID,
    p_user_id UUID  -- Changed from p_created_by to p_user_id for consistency
)
RETURNS UUID AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_transaction_number VARCHAR(100);
    v_cash_account_id UUID;
    v_sales_account_id UUID;
    v_journal_entry_id UUID;
    v_entry_number VARCHAR(50);
BEGIN
    -- Get transaction details
    SELECT 
        business_id,
        final_amount,
        transaction_number
    INTO 
        v_business_id,
        v_final_amount,
        v_transaction_number
    FROM pos_transactions
    WHERE id = p_pos_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'POS transaction not found: %', p_pos_transaction_id;
    END IF;

    -- Generate unique entry number
    v_entry_number := 'JE-' || COALESCE(v_transaction_number, 
        TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
        EXTRACT(EPOCH FROM NOW())::TEXT);

    -- Get account IDs
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1110'
      AND is_active = true
    LIMIT 1;

    SELECT id INTO v_sales_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'
      AND is_active = true
    LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account (1110) not found for business: %', v_business_id;
    END IF;

    IF v_sales_account_id IS NULL THEN
        RAISE EXCEPTION 'Sales Revenue account (4100) not found for business: %', v_business_id;
    END IF;

    -- Create journal entry with CORRECT status 'posted'
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,
        reference_id,
        description,
        total_amount,
        status,        -- ✅ MUST be 'posted' (not 'active')
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        v_entry_number,
        'pos_transaction',
        p_pos_transaction_id::TEXT,
        'POS Sale: ' || COALESCE(v_transaction_number, p_pos_transaction_id::TEXT),
        v_final_amount,
        'posted',      -- ✅ CORRECT: Not 'active'
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create debit entry (Cash increase)
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
        v_sales_account_id,
        'credit',
        v_final_amount,
        'Sales revenue from POS'
    );

    -- Log successful creation
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        v_business_id,
        p_user_id,
        'accounting.journal_entry.created',
        'pos_transaction',
        p_pos_transaction_id,
        '{}'::jsonb,
        jsonb_build_object(
            'amount', v_final_amount,
            'journal_entry_id', v_journal_entry_id,
            'automated', true
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction'),
        NOW()
    );

    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- Log error
    INSERT INTO audit_logs (
        business_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        metadata,
        created_at
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        p_user_id,
        'accounting.journal_entry.error',
        'pos_transaction',
        p_pos_transaction_id,
        '{}'::jsonb,
        jsonb_build_object('error', SQLERRM, 'amount', COALESCE(v_final_amount, 0)),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction'),
        NOW()
    );

    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- QUICK TEST
-- ============================================================================

DO $$
DECLARE
    v_test_business_id UUID := '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    v_test_user_id UUID := 'b4af1699-0149-47e2-bc55-66214c0572ba';
    v_pos_transaction_id UUID;
    v_journal_entry_id UUID;
BEGIN
    RAISE NOTICE 'Testing fixed function...';
    
    -- Create test transaction
    INSERT INTO pos_transactions (
        business_id,
        transaction_number,
        total_amount,
        final_amount,
        payment_method,
        status,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_test_business_id,
        'QUICK-TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        1000.00,
        1000.00,
        'cash',
        'completed',
        v_test_user_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_pos_transaction_id;
    
    RAISE NOTICE 'Created test transaction: %', v_pos_transaction_id;
    
    -- Test the function
    v_journal_entry_id := create_journal_entry_for_pos_transaction(
        v_pos_transaction_id,
        v_test_user_id
    );
    
    RAISE NOTICE '✅ SUCCESS! Created journal entry: %', v_journal_entry_id;
    
    -- Verify status is 'posted'
    DECLARE
        v_status TEXT;
    BEGIN
        SELECT status INTO v_status
        FROM journal_entries
        WHERE id = v_journal_entry_id;
        
        IF v_status = 'posted' THEN
            RAISE NOTICE '✅ Journal entry status: "posted" (correct!)';
        ELSE
            RAISE EXCEPTION '❌ Wrong status: % (should be "posted")', v_status;
        END IF;
    END;
    
    -- Clean up
    DELETE FROM pos_transactions WHERE id = v_pos_transaction_id;
    DELETE FROM journal_entries WHERE id = v_journal_entry_id;
    RAISE NOTICE 'Test data cleaned up';
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ TEST FAILED: %', SQLERRM;
    
    -- Clean up on failure
    BEGIN
        IF v_pos_transaction_id IS NOT NULL THEN
            DELETE FROM pos_transactions WHERE id = v_pos_transaction_id;
        END IF;
        
        IF v_journal_entry_id IS NOT NULL THEN
            DELETE FROM journal_entries WHERE id = v_journal_entry_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Cleanup also failed: %', SQLERRM;
    END;
    
    RAISE;
END $$;
