-- database/migrations/043_fix_trigger_logic.sql
-- ============================================================================
-- FIX: Update trigger conditions for real-world usage
-- ============================================================================

-- 1. Update the accounting event registry for POS transactions
UPDATE accounting_event_registry
SET event_type = 'INSERT',
    trigger_condition = 'NEW.status = ''completed'''
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
  AND source_table = 'pos_transactions'
  AND accounting_function = 'process_pos_transaction';

-- 2. Also keep UPDATE trigger for manual completion cases
INSERT INTO accounting_event_registry (
    business_id, source_table, event_type, trigger_condition, 
    accounting_function, description
) VALUES (
    '243a15b5-255a-4852-83bf-5cb46aa62b5e',
    'pos_transactions',
    'UPDATE',
    'NEW.status = ''completed'' AND OLD.status != ''completed''',
    'process_pos_transaction',
    'POS transaction manually marked as completed'
) ON CONFLICT (business_id, source_table, event_type, trigger_condition) DO NOTHING;

-- 3. Create a simpler POS accounting function that works on INSERT
CREATE OR REPLACE FUNCTION process_pos_sale_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_success BOOLEAN;
    v_message TEXT;
BEGIN
    -- Only process if status is completed
    IF NEW.status = 'completed' THEN
        RAISE NOTICE 'Processing POS sale accounting for new transaction: %', NEW.id;
        
        -- Call the accounting function
        SELECT success, message INTO v_success, v_message
        FROM process_pos_sale(NEW.id);
        
        IF v_success THEN
            RAISE NOTICE '✅ Accounting created successfully';
        ELSE
            RAISE WARNING '⚠️ Accounting failed: %', v_message;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Add INSERT trigger on pos_transactions
DROP TRIGGER IF EXISTS trigger_pos_accounting_insert ON pos_transactions;

CREATE TRIGGER trigger_pos_accounting_insert
    AFTER INSERT ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION process_pos_sale_on_insert();

-- 5. Test the fix
DO $$
DECLARE
    v_test_transaction_id UUID;
    v_journal_count_before INTEGER;
    v_journal_count_after INTEGER;
BEGIN
    -- Count existing journal entries
    SELECT COUNT(*) INTO v_journal_count_before
    FROM journal_entries 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    RAISE NOTICE 'Before test: % journal entries', v_journal_count_before;
    
    -- Create a test POS transaction with status = 'completed'
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
        'AUTO-TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        2500.00,
        200.00,
        180.00,
        2480.00,
        'cash',
        'completed', -- IMPORTANT: Status is completed on INSERT
        'b4af1699-0149-47e2-bc55-66214c0572ba',
        NOW(),
        NOW()
    ) RETURNING id INTO v_test_transaction_id;
    
    RAISE NOTICE 'Created test transaction: %', v_test_transaction_id;
    
    -- Wait for trigger
    PERFORM pg_sleep(0.5);
    
    -- Count journal entries after
    SELECT COUNT(*) INTO v_journal_count_after
    FROM journal_entries 
    WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    RAISE NOTICE 'After test: % journal entries', v_journal_count_after;
    
    IF v_journal_count_after > v_journal_count_before THEN
        RAISE NOTICE '✅ SUCCESS: Accounting automation worked!';
        RAISE NOTICE '   Created % new journal entries', v_journal_count_after - v_journal_count_before;
    ELSE
        RAISE NOTICE '❌ FAILED: No journal entries created';
    END IF;
    
    -- Show the new journal entry
    RAISE NOTICE 'Recent journal entries:';
    FOR rec IN (
        SELECT reference_number, description, total_amount, created_at
        FROM journal_entries
        WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
        ORDER BY created_at DESC
        LIMIT 3
    ) LOOP
        RAISE NOTICE '   % - % - %', 
            rec.reference_number, rec.description, rec.total_amount;
    END LOOP;
    
END $$;
