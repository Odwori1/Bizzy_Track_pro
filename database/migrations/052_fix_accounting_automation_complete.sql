-- ============================================================================
-- MIGRATION: Fix Accounting Automation System
-- ============================================================================
-- File: database/migrations/052_fix_accounting_automation_complete.sql
-- Purpose: Fix critical bugs in accounting automation system
-- Date: 2025-12-06
-- Priority: CRITICAL - Enables POS accounting automation
-- Dependencies: Migrations 032-037 should be applied
-- ============================================================================

-- ============================================================================
-- SECTION 1: FIX CRITICAL POS ACCOUNTING FUNCTION
-- ============================================================================

-- Drop and recreate the broken function with fixes
CREATE OR REPLACE FUNCTION create_journal_entry_for_pos_transaction(
    p_pos_transaction_id UUID,
    p_user_id UUID
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

    -- Validate required fields
    IF v_business_id IS NULL THEN
        RAISE EXCEPTION 'Business ID is required';
    END IF;

    -- Generate unique entry number
    v_entry_number := 'JE-' || COALESCE(v_transaction_number, 
        TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
        EXTRACT(EPOCH FROM NOW())::TEXT);

    -- Get account IDs from chart_of_accounts
    SELECT id INTO v_cash_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '1110'  -- Cash account
      AND is_active = true
    LIMIT 1;

    SELECT id INTO v_sales_account_id
    FROM chart_of_accounts
    WHERE business_id = v_business_id
      AND account_code = '4100'  -- Sales Revenue account
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
        reference_id,  -- VARCHAR column, UUID cast to text is fine
        description,
        total_amount,
        status,        -- MUST be 'posted', 'draft', or 'void' (not 'active')
        created_by,
        posted_at
    ) VALUES (
        v_business_id,
        CURRENT_DATE,
        v_entry_number,
        'pos_transaction',
        p_pos_transaction_id::TEXT,  -- reference_id is VARCHAR, not UUID
        'POS Sale: ' || COALESCE(v_transaction_number, p_pos_transaction_id::TEXT),
        v_final_amount,
        'posted',      -- ✅ CORRECT: Not 'active'
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Create debit entry (Cash increase)
    -- NOTE: account_code column is populated by trigger, don't insert it here
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

    -- Log successful creation with CORRECT audit_logs columns
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
            'transaction_number', v_transaction_number,
            'automated', true
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction'),
        NOW()
    );

    -- Return the created journal entry ID
    RETURN v_journal_entry_id;

EXCEPTION WHEN OTHERS THEN
    -- Log error with CORRECT audit_logs columns
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
        jsonb_build_object(
            'error', SQLERRM,
            'amount', COALESCE(v_final_amount, 0),
            'transaction_number', v_transaction_number
        ),
        jsonb_build_object('function', 'create_journal_entry_for_pos_transaction'),
        NOW()
    );

    -- Re-raise the exception so caller knows it failed
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 2: VERIFICATION & TESTING
-- ============================================================================

-- Test helper: Check if table exists
CREATE OR REPLACE FUNCTION assert_table_exists(p_table_name TEXT)
RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = p_table_name AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'Table does not exist: %', p_table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 3: COMPREHENSIVE TEST
-- ============================================================================

DO $$
DECLARE
    -- Test business and user (from actual data - NOT hardcoded in production)
    -- These are only for testing in development
    v_test_business_id UUID := '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    v_test_user_id UUID := 'b4af1699-0149-47e2-bc55-66214c0572ba';
    
    -- Test variables
    v_pos_transaction_id UUID;
    v_journal_entry_id UUID;
    v_journal_count_before INTEGER;
    v_journal_count_after INTEGER;
    v_audit_count_before INTEGER;
    v_audit_count_after INTEGER;
    v_total_debits DECIMAL;
    v_total_credits DECIMAL;
    v_test_success BOOLEAN := false;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ACCOUNTING FIX VERIFICATION TEST';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting at: %', NOW();
    RAISE NOTICE '';
    
    -- PHASE 1: PRE-TEST SETUP
    RAISE NOTICE 'PHASE 1: PRE-TEST SETUP';
    RAISE NOTICE '----------------------------------------';
    
    -- 1.1 Verify required tables exist
    RAISE NOTICE '1.1 Verifying table structure...';
    PERFORM assert_table_exists('journal_entries');
    PERFORM assert_table_exists('journal_entry_lines');
    PERFORM assert_table_exists('chart_of_accounts');
    PERFORM assert_table_exists('audit_logs');
    PERFORM assert_table_exists('pos_transactions');
    RAISE NOTICE '   ✅ All required tables exist';
    
    -- 1.2 Verify test business exists and has accounts
    RAISE NOTICE '1.2 Verifying test business setup...';
    DECLARE
        v_business_exists BOOLEAN;
        v_account_count INTEGER;
    BEGIN
        -- Check business exists
        SELECT EXISTS (
            SELECT 1 FROM businesses WHERE id = v_test_business_id
        ) INTO v_business_exists;
        
        IF NOT v_business_exists THEN
            RAISE EXCEPTION 'Test business not found: %', v_test_business_id;
        END IF;
        
        -- Check chart of accounts exists
        SELECT COUNT(*) INTO v_account_count
        FROM chart_of_accounts
        WHERE business_id = v_test_business_id
          AND is_active = true;
        
        IF v_account_count = 0 THEN
            RAISE EXCEPTION 'Test business has no chart of accounts';
        END IF;
        
        RAISE NOTICE '   ✅ Business exists with % active accounts', v_account_count;
    END;
    
    -- 1.3 Get baseline counts
    RAISE NOTICE '1.3 Getting baseline counts...';
    SELECT COUNT(*) INTO v_journal_count_before
    FROM journal_entries
    WHERE business_id = v_test_business_id;
    
    SELECT COUNT(*) INTO v_audit_count_before
    FROM audit_logs
    WHERE business_id = v_test_business_id
      AND action LIKE '%accounting%';
    
    RAISE NOTICE '   Baseline: % journal entries, % accounting audit logs',
        v_journal_count_before, v_audit_count_before;
    
    -- 1.4 Verify accounting equation is balanced
    RAISE NOTICE '1.4 Verifying accounting equation is balanced...';
    SELECT
        COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0)
    INTO v_total_debits, v_total_credits
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.business_id = v_test_business_id
      AND je.voided_at IS NULL;
    
    IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
        RAISE EXCEPTION 'Accounting equation NOT balanced before test: Debits=%, Credits=%', 
            v_total_debits, v_total_credits;
    ELSE
        RAISE NOTICE '   ✅ Accounting equation balanced: Debits=%, Credits=%', 
            v_total_debits, v_total_credits;
    END IF;
    
    -- PHASE 2: POS ACCOUNTING TEST
    RAISE NOTICE '';
    RAISE NOTICE 'PHASE 2: POS ACCOUNTING AUTOMATION TEST';
    RAISE NOTICE '----------------------------------------';
    
    -- 2.1 Create a test POS transaction
    RAISE NOTICE '2.1 Creating test POS transaction...';
    INSERT INTO pos_transactions (
        business_id,
        transaction_number,
        total_amount,
        discount_amount,
        tax_amount,
        final_amount,
        payment_method,
        status,
        created_by,
        created_at,
        updated_at
    ) VALUES (
        v_test_business_id,
        'ACCT-FIX-TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        7500.00,
        500.00,
        450.00,
        7450.00,
        'cash',
        'completed',
        v_test_user_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_pos_transaction_id;
    
    RAISE NOTICE '   Created transaction: %', v_pos_transaction_id;
    RAISE NOTICE '   Amount: 7450.00, Status: completed';
    
    -- 2.2 Test the fixed function directly
    RAISE NOTICE '2.2 Testing fixed accounting function...';
    BEGIN
        v_journal_entry_id := create_journal_entry_for_pos_transaction(
            v_pos_transaction_id,
            v_test_user_id
        );
        
        RAISE NOTICE '   ✅ Function succeeded! Journal Entry ID: %', v_journal_entry_id;
        v_test_success := true;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '❌ Function failed: %', SQLERRM;
    END;
    
    -- Wait a moment for any async operations
    PERFORM pg_sleep(0.3);
    
    -- 2.3 Verify the journal entry was created correctly
    RAISE NOTICE '2.3 Verifying journal entry...';
    DECLARE
        v_journal_status TEXT;
        v_journal_amount DECIMAL;
        v_journal_ref_number TEXT;
        v_line_count INTEGER;
    BEGIN
        -- Check journal entry exists
        SELECT status, total_amount, reference_number
        INTO v_journal_status, v_journal_amount, v_journal_ref_number
        FROM journal_entries
        WHERE id = v_journal_entry_id
          AND business_id = v_test_business_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Journal entry not found: %', v_journal_entry_id;
        END IF;
        
        -- Verify status is 'posted' (not 'active')
        IF v_journal_status != 'posted' THEN
            RAISE EXCEPTION 'Wrong journal status: % (should be "posted")', v_journal_status;
        END IF;
        
        -- Verify amount matches transaction
        IF v_journal_amount != 7450.00 THEN
            RAISE EXCEPTION 'Wrong journal amount: % (should be 7450.00)', v_journal_amount;
        END IF;
        
        RAISE NOTICE '   ✅ Journal Entry %: status="posted", amount=%', 
            v_journal_ref_number, v_journal_amount;
        
        -- Verify journal lines exist
        SELECT COUNT(*) INTO v_line_count
        FROM journal_entry_lines
        WHERE journal_entry_id = v_journal_entry_id;
        
        IF v_line_count != 2 THEN
            RAISE EXCEPTION 'Wrong number of journal lines: % (should be 2)', v_line_count;
        END IF;
        
        RAISE NOTICE '   ✅ Journal has 2 lines (debit and credit)';
        
        -- Verify debit = credit
        DECLARE
            v_line_debits DECIMAL;
            v_line_credits DECIMAL;
        BEGIN
            SELECT 
                COALESCE(SUM(CASE WHEN line_type = 'debit' THEN amount ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN line_type = 'credit' THEN amount ELSE 0 END), 0)
            INTO v_line_debits, v_line_credits
            FROM journal_entry_lines
            WHERE journal_entry_id = v_journal_entry_id;
            
            IF ABS(v_line_debits - v_line_credits) > 0.01 THEN
                RAISE EXCEPTION 'Journal lines not balanced: Debits=%, Credits=%', 
                    v_line_debits, v_line_credits;
            END IF;
            
            RAISE NOTICE '   ✅ Lines balanced: Debits=%, Credits=%', 
                v_line_debits, v_line_credits;
        END;
    END;
    
    -- 2.4 Verify audit trail
    RAISE NOTICE '2.4 Verifying audit trail...';
    SELECT COUNT(*) INTO v_audit_count_after
    FROM audit_logs
    WHERE business_id = v_test_business_id
      AND action LIKE '%accounting%';
    
    IF v_audit_count_after > v_audit_count_before THEN
        RAISE NOTICE '   ✅ Created % new audit log entries',
            v_audit_count_after - v_audit_count_before;
    ELSE
        RAISE WARNING '   ⚠️ No new audit logs found (check manually)';
    END IF;
    
    -- 2.5 Test process_pos_sale function (integration test)
    RAISE NOTICE '2.5 Testing process_pos_sale integration...';
    
    -- Create another test transaction
    DECLARE
        v_test_transaction_id UUID;
        v_success BOOLEAN;
        v_message TEXT;
    BEGIN
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
            'INTEGRATION-TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            2500.00,
            2500.00,
            'cash',
            'completed',
            v_test_user_id,
            NOW(),
            NOW()
        ) RETURNING id INTO v_test_transaction_id;
        
        RAISE NOTICE '   Created integration test transaction: %', v_test_transaction_id;
        
        -- Call process_pos_sale (which calls our fixed function)
        SELECT success, message INTO v_success, v_message
        FROM process_pos_sale(v_test_transaction_id);
        
        IF v_success THEN
            RAISE NOTICE '   ✅ process_pos_sale succeeded: %', v_message;
        ELSE
            RAISE EXCEPTION '❌ process_pos_sale failed: %', v_message;
        END IF;
        
        -- Clean up integration test transaction
        DELETE FROM pos_transactions WHERE id = v_test_transaction_id;
        RAISE NOTICE '   Cleaned up integration test transaction';
    END;
    
    -- PHASE 3: POST-TEST VERIFICATION
    RAISE NOTICE '';
    RAISE NOTICE 'PHASE 3: POST-TEST VERIFICATION';
    RAISE NOTICE '----------------------------------------';
    
    -- 3.1 Verify accounting equation still balanced
    RAISE NOTICE '3.1 Verifying accounting equation still balanced...';
    SELECT
        COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0)
    INTO v_total_debits, v_total_credits
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.business_id = v_test_business_id
      AND je.voided_at IS NULL;
    
    IF ABS(v_total_debits - v_total_credits) > 0.01 THEN
        RAISE EXCEPTION '❌ Accounting equation BROKEN after test: Debits=%, Credits=%', 
            v_total_debits, v_total_credits;
    ELSE
        RAISE NOTICE '   ✅ Accounting equation still balanced: Debits=%, Credits=%',
            v_total_debits, v_total_credits;
    END IF;
    
    -- 3.2 Get final counts
    SELECT COUNT(*) INTO v_journal_count_after
    FROM journal_entries
    WHERE business_id = v_test_business_id;
    
    RAISE NOTICE '3.2 Final count: % journal entries (created: %)',
        v_journal_count_after,
        v_journal_count_after - v_journal_count_before;
    
    -- 3.3 Clean up test data (optional - comment out to inspect)
    RAISE NOTICE '3.3 Cleaning up test data...';
    DELETE FROM pos_transactions WHERE id = v_pos_transaction_id;
    DELETE FROM journal_entries WHERE id = v_journal_entry_id;
    RAISE NOTICE '   Test data cleaned up';
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '🎉 SUCCESS: ACCOUNTING FIX VERIFIED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'SUMMARY:';
    RAISE NOTICE '  - Fixed create_journal_entry_for_pos_transaction()';
    RAISE NOTICE '  - Changed status from "active" to "posted"';
    RAISE NOTICE '  - Removed redundant account_code inserts';
    RAISE NOTICE '  - Added proper error logging';
    RAISE NOTICE '  - Verified with comprehensive test';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '  1. POS sales will now automatically create accounting entries';
    RAISE NOTICE '  2. Test with actual frontend POS transactions';
    RAISE NOTICE '  3. Monitor audit_logs for any errors';
    RAISE NOTICE '  4. Plan fixes for other functions (expenses, invoices, etc.)';
    RAISE NOTICE '========================================';
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '❌ TEST FAILED: %', SQLERRM;
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'DEBUG INFO:';
    RAISE NOTICE '  Test Business: %', v_test_business_id;
    RAISE NOTICE '  Test User: %', v_test_user_id;
    RAISE NOTICE '  POS Transaction: %', v_pos_transaction_id;
    RAISE NOTICE '  Journal Entry: %', v_journal_entry_id;
    RAISE NOTICE '  Test Success: %', v_test_success;
    RAISE NOTICE '';
    
    -- Try to clean up even on failure
    BEGIN
        IF v_pos_transaction_id IS NOT NULL THEN
            DELETE FROM pos_transactions WHERE id = v_pos_transaction_id;
            RAISE NOTICE '  Cleaned up POS transaction';
        END IF;
        
        IF v_journal_entry_id IS NOT NULL THEN
            DELETE FROM journal_entries WHERE id = v_journal_entry_id;
            RAISE NOTICE '  Cleaned up journal entry';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  Cleanup failed: %', SQLERRM;
    END;
    
    RAISE;
END $$;

-- ============================================================================
-- SECTION 4: ADDITIONAL SAFETY CHECKS
-- ============================================================================

-- Verify the function was updated correctly
DO $$
BEGIN
    -- Check that function exists and has correct signature
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_journal_entry_for_pos_transaction'
          AND prorettype = 'uuid'::regtype
          AND pronargs = 2
    ) THEN
        RAISE EXCEPTION 'Function create_journal_entry_for_pos_transaction not found or has wrong signature';
    END IF;
    
    -- Check that function doesn't use 'active' status
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_journal_entry_for_pos_transaction'
          AND prosrc LIKE '%active%'
    ) THEN
        RAISE EXCEPTION 'Function still contains "active" status reference';
    END IF;
    
    -- Check that function uses 'posted' status
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'create_journal_entry_for_pos_transaction'
          AND prosrc LIKE '%posted%'
    ) THEN
        RAISE EXCEPTION 'Function does not use "posted" status';
    END IF;
    
    RAISE NOTICE '✅ Function verification passed';
END $$;

-- ============================================================================
-- SECTION 5: DOCUMENTATION FOR NEXT DEVELOPER
-- ============================================================================

COMMENT ON FUNCTION create_journal_entry_for_pos_transaction(UUID, UUID) IS 
'Creates accounting journal entries for POS transactions.
FIXED VERSION (2025-12-06):
- Changed status from "active" to "posted" to match constraint
- Removed redundant account_code inserts (handled by trigger)
- Added proper error logging to audit_logs
- Uses old_values/new_values columns (not details)
- No hardcoded UUIDs

Accounts used:
- Debit: Cash (1110)
- Credit: Sales Revenue (4100)

Called by process_pos_sale() when POS transaction status changes to "completed".';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
