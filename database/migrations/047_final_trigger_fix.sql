-- database/migrations/047_final_trigger_fix.sql
-- ============================================================================
-- FINAL FIX: Correct trigger function for pos_transactions
-- ============================================================================

-- First, check which trigger function is currently being used
DO $$
DECLARE
    v_current_function TEXT;
BEGIN
    SELECT pg_get_triggerdef(oid) INTO v_current_function
    FROM pg_trigger
    WHERE tgname = 'trigger_auto_accounting_pos';
    
    RAISE NOTICE 'Current trigger definition: %', v_current_function;
END $$;

-- Drop the old trigger
DROP TRIGGER IF EXISTS trigger_auto_accounting_pos ON pos_transactions;

-- Create a simple, working trigger function
CREATE OR REPLACE FUNCTION auto_account_pos_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- Only process when status is 'completed'
    IF NEW.status = 'completed' THEN
        -- Check if it's an INSERT or an UPDATE from non-completed to completed
        IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'completed') THEN
            -- Create accounting entry
            PERFORM create_journal_entry_for_pos_transaction(NEW.id);
            
            -- Log the action
            INSERT INTO audit_logs (
                business_id, user_id, action, resource_type, resource_id,
                details, metadata
            ) VALUES (
                NEW.business_id,
                COALESCE(NEW.created_by, NEW.updated_by),
                'accounting.pos.automated',
                'pos_transaction',
                NEW.id,
                jsonb_build_object(
                    'amount', NEW.final_amount,
                    'transaction_number', NEW.transaction_number
                ),
                jsonb_build_object('trigger', 'auto_account_pos_transaction')
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_auto_account_pos
    AFTER INSERT OR UPDATE ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION auto_account_pos_transaction();

-- Test the trigger
DO $$
DECLARE
    v_test_id UUID;
    v_journal_count_before INTEGER;
    v_journal_count_after INTEGER;
BEGIN
    -- Count before
    SELECT COUNT(*) INTO v_journal_count_before
    FROM journal_entries 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND reference_type = 'pos_transaction';
    
    RAISE NOTICE 'Before: % pos transaction journal entries', v_journal_count_before;
    
    -- Create test transaction
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
        '243a15b5-255a-4852-83bf-5cb46aa62b5e',
        'TRIGGER-TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        1500.00,
        75.00,
        112.50,
        1537.50,
        'cash',
        'completed',
        'b4af1699-0149-47e2-bc55-66214c0572ba',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_id;
    
    RAISE NOTICE 'Created test transaction: %', v_test_id;
    
    -- Wait for trigger
    PERFORM pg_sleep(0.5);
    
    -- Count after
    SELECT COUNT(*) INTO v_journal_count_after
    FROM journal_entries 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
      AND reference_type = 'pos_transaction';
    
    RAISE NOTICE 'After: % pos transaction journal entries', v_journal_count_after;
    
    IF v_journal_count_after > v_journal_count_before THEN
        RAISE NOTICE '✅ SUCCESS: Accounting automation works!';
        RAISE NOTICE 'Created % new journal entry(ies)', v_journal_count_after - v_journal_count_before;
    ELSE
        RAISE NOTICE '❌ FAILED: No journal entry created';
    END IF;
    
    -- Show the new entry
    RAISE NOTICE '';
    RAISE NOTICE 'Latest journal entry:';
    
    DECLARE
        v_ref TEXT;
        v_desc TEXT;
        v_amt DECIMAL;
    BEGIN
        SELECT reference_number, description, total_amount
        INTO v_ref, v_desc, v_amt
        FROM journal_entries
        WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
        ORDER BY created_at DESC
        LIMIT 1;
        
        RAISE NOTICE 'Reference: %', v_ref;
        RAISE NOTICE 'Description: %', v_desc;
        RAISE NOTICE 'Amount: %', v_amt;
    END;
    
END $$;
