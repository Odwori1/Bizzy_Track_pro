-- ============================================================================
-- MIGRATION: Create POS Accounting Automation Trigger
-- ============================================================================
-- Purpose: Automatically create accounting entries when POS transactions complete
-- Date: 2025-12-06
-- ============================================================================

-- First, ensure the trigger function exists
CREATE OR REPLACE FUNCTION process_pos_sale_on_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_success BOOLEAN;
    v_message TEXT;
BEGIN
    -- Only process if status is 'completed'
    IF NEW.status = 'completed' THEN
        RAISE NOTICE '🔄 Processing POS sale accounting for transaction: %', NEW.id;
        
        -- Call the accounting function
        SELECT success, message INTO v_success, v_message
        FROM process_pos_sale(NEW.id);
        
        IF v_success THEN
            RAISE NOTICE '✅ Accounting created successfully for transaction: %', NEW.id;
        ELSE
            RAISE WARNING '⚠️ Accounting failed for transaction %: %', NEW.id, v_message;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_auto_pos_accounting ON pos_transactions;

CREATE TRIGGER trigger_auto_pos_accounting
    AFTER INSERT ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION process_pos_sale_on_insert();

-- Also create trigger for updates (if status changes to completed)
CREATE OR REPLACE FUNCTION process_pos_sale_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Process if status changed to 'completed'
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        RAISE NOTICE '🔄 Processing POS sale accounting for updated transaction: %', NEW.id;
        
        PERFORM process_pos_sale(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_pos_accounting_update ON pos_transactions;

CREATE TRIGGER trigger_auto_pos_accounting_update
    AFTER UPDATE ON pos_transactions
    FOR EACH ROW
    EXECUTE FUNCTION process_pos_sale_on_update();

-- Verification
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'POS ACCOUNTING AUTOMATION TRIGGERS CREATED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Triggers created:';
    RAISE NOTICE '  1. trigger_auto_pos_accounting (INSERT)';
    RAISE NOTICE '  2. trigger_auto_pos_accounting_update (UPDATE)';
    RAISE NOTICE '========================================';
END $$;
