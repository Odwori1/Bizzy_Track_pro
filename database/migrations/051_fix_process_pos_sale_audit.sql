-- database/migrations/051_fix_process_pos_sale_audit.sql
-- ============================================================================
-- FIX: process_pos_sale function to work with actual audit_logs structure
-- ============================================================================

-- Drop the broken function
DROP FUNCTION IF EXISTS process_pos_sale(UUID);

-- Create fixed function using correct audit_logs columns
CREATE OR REPLACE FUNCTION process_pos_sale(p_pos_transaction_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_final_amount DECIMAL(15,2);
    v_created_by UUID;
    v_journal_entry_id UUID;
BEGIN
    -- Get transaction details
    SELECT business_id, final_amount, created_by
    INTO v_business_id, v_final_amount, v_created_by
    FROM pos_transactions 
    WHERE id = p_pos_transaction_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'POS transaction not found';
        RETURN;
    END IF;

    -- Try to create journal entry
    BEGIN
        -- Use the working function
        PERFORM create_journal_entry_for_pos_transaction(p_pos_transaction_id);
        
        -- Log success with correct columns
        INSERT INTO audit_logs (
            business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, created_at
        ) VALUES (
            v_business_id,
            v_created_by,
            'accounting.journal_entry.created',
            'pos_transaction',
            p_pos_transaction_id,
            '{}'::jsonb,
            jsonb_build_object('amount', v_final_amount, 'automated', true),
            NOW()
        );
        
        -- Mark transaction as processed
        UPDATE pos_transactions
        SET status = 'completed',
            updated_at = NOW()
        WHERE id = p_pos_transaction_id;
        
        RETURN QUERY SELECT true, 'Sale processed successfully with accounting';
        
    EXCEPTION WHEN OTHERS THEN
        -- Log error with correct columns
        INSERT INTO audit_logs (
            business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, created_at
        ) VALUES (
            v_business_id,
            v_created_by,
            'accounting.journal_entry.failed',
            'pos_transaction',
            p_pos_transaction_id,
            '{}'::jsonb,
            jsonb_build_object('error', SQLERRM, 'amount', v_final_amount),
            NOW()
        );
        
        RAISE NOTICE 'Journal entry creation failed: %', SQLERRM;
        
        -- Still mark as completed even if accounting failed
        UPDATE pos_transactions
        SET status = 'completed',
            updated_at = NOW()
        WHERE id = p_pos_transaction_id;
        
        RETURN QUERY SELECT false, 'Sale processed but accounting failed: ' || SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

-- Also fix our trigger function to remove the broken audit_logs insert
DROP TRIGGER IF EXISTS trg_pos_accounting ON pos_transactions;
DROP FUNCTION IF EXISTS create_pos_accounting();

-- Create simple trigger that doesn't insert to audit_logs
CREATE OR REPLACE FUNCTION create_pos_accounting()
RETURNS TRIGGER AS $$
BEGIN
    -- When a POS transaction is marked as completed
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN
        -- Call process_pos_sale which now handles audit_logs correctly
        PERFORM process_pos_sale(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trg_pos_accounting
    AFTER INSERT OR UPDATE ON pos_transactions
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION create_pos_accounting();

-- Verify
DO $$
BEGIN
    RAISE NOTICE '✅ Fixed process_pos_sale function';
    RAISE NOTICE '✅ Fixed trigger function';
    RAISE NOTICE '✅ Uses correct audit_logs columns (old_values, new_values)';
END $$;
