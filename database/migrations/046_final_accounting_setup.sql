-- database/migrations/046_final_accounting_setup.sql
-- ============================================================================
-- FINAL ACCOUNTING AUTOMATION SETUP
-- ============================================================================
-- Sets up triggers for automatic accounting
-- No hardcoded values - production ready
-- ============================================================================

-- 1. Create the accounting trigger function
CREATE OR REPLACE FUNCTION create_accounting_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_business_id UUID;
    v_record_id UUID;
    v_user_id UUID;
    v_status TEXT;
    v_old_status TEXT;
BEGIN
    -- Get values based on operation
    CASE TG_OP
        WHEN 'INSERT' THEN
            v_business_id := NEW.business_id;
            v_record_id := NEW.id;
            v_user_id := NEW.created_by;
            v_status := NEW.status;
        WHEN 'UPDATE' THEN
            v_business_id := NEW.business_id;
            v_record_id := NEW.id;
            v_user_id := COALESCE(NEW.updated_by, NEW.created_by);
            v_status := NEW.status;
            v_old_status := OLD.status;
        ELSE
            RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    END CASE;

    -- POS Transactions: Create accounting when status is 'completed'
    IF TG_TABLE_NAME = 'pos_transactions' THEN
        IF (TG_OP = 'INSERT' AND v_status = 'completed') OR 
           (TG_OP = 'UPDATE' AND v_status = 'completed' AND v_old_status != 'completed') THEN
            
            -- Call existing function (created in migration 032)
            PERFORM create_journal_entry_for_pos_transaction(v_record_id);
            
            -- Log the action
            INSERT INTO audit_logs (
                business_id, user_id, action, resource_type, resource_id,
                details, metadata
            ) VALUES (
                v_business_id,
                v_user_id,
                'accounting.automation.triggered',
                'pos_transaction',
                v_record_id,
                jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP),
                jsonb_build_object('trigger', 'create_accounting_on_transaction')
            );
        END IF;
    END IF;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
    
EXCEPTION WHEN OTHERS THEN
    -- Never fail the business transaction
    INSERT INTO audit_logs (
        business_id, user_id, action, resource_type, resource_id,
        details, metadata
    ) VALUES (
        COALESCE(v_business_id, '00000000-0000-0000-0000-000000000000'::UUID),
        v_user_id,
        'accounting.automation.error',
        TG_TABLE_NAME,
        COALESCE(v_record_id, '00000000-0000-0000-0000-000000000000'::UUID),
        jsonb_build_object('error', SQLERRM, 'table', TG_TABLE_NAME),
        jsonb_build_object('trigger', 'create_accounting_on_transaction')
    );
    
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- 2. Create triggers on business transaction tables
CREATE TRIGGER trigger_auto_accounting_pos
    AFTER INSERT OR UPDATE ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION create_accounting_on_transaction();

-- 3. Verify the setup
DO $$
DECLARE
    v_trigger_count INTEGER;
BEGIN
    -- Count triggers created
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE t.tgname = 'trigger_auto_accounting_pos';
    
    IF v_trigger_count > 0 THEN
        RAISE NOTICE '✅ Accounting automation system is ready';
        RAISE NOTICE 'Trigger created: trigger_auto_accounting_pos';
    ELSE
        RAISE NOTICE '❌ Trigger creation failed';
    END IF;
END $$;
