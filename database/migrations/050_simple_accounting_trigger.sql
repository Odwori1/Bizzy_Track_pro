-- database/migrations/050_simple_accounting_trigger.sql
-- ============================================================================
-- SIMPLE ACCOUNTING TRIGGER
-- ============================================================================
-- One trigger, no hardcoding, works for all businesses/users
-- ============================================================================

-- 1. Create a simple trigger function
CREATE OR REPLACE FUNCTION create_pos_accounting()
RETURNS TRIGGER AS $$
BEGIN
    -- When a POS transaction is marked as completed
    IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status != 'completed') THEN
        -- Use the existing function that handles everything
        PERFORM create_journal_entry_for_pos_transaction(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the trigger
CREATE TRIGGER trg_pos_accounting
    AFTER INSERT OR UPDATE ON pos_transactions
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION create_pos_accounting();

-- 3. Verify
DO $$
BEGIN
    RAISE NOTICE '✅ Accounting trigger created';
    RAISE NOTICE 'Function: create_pos_accounting';
    RAISE NOTICE 'Trigger: trg_pos_accounting on pos_transactions';
    RAISE NOTICE 'Condition: When status = "completed"';
END $$;
