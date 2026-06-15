-- ============================================================
-- CREATE: Account Balance Update Trigger
-- Phase 1: Account Balance Update - TRIGGER CREATION
-- Applies to: ALL businesses (current and future)
-- ============================================================

-- Step 1.1: Create the trigger function
CREATE OR REPLACE FUNCTION update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- On INSERT: adjust balance based on line type
    IF TG_OP = 'INSERT' THEN
        UPDATE chart_of_accounts
        SET current_balance = current_balance + 
            CASE WHEN NEW.line_type = 'debit' THEN NEW.amount ELSE -NEW.amount END
        WHERE id = NEW.account_id
          AND business_id = NEW.business_id;
          
    -- On DELETE: reverse the adjustment
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE chart_of_accounts
        SET current_balance = current_balance - 
            CASE WHEN OLD.line_type = 'debit' THEN OLD.amount ELSE -OLD.amount END
        WHERE id = OLD.account_id
          AND business_id = OLD.business_id;
          
    -- On UPDATE: handle line_type or amount changes
    ELSIF TG_OP = 'UPDATE' THEN
        -- First reverse the OLD value
        UPDATE chart_of_accounts
        SET current_balance = current_balance - 
            CASE WHEN OLD.line_type = 'debit' THEN OLD.amount ELSE -OLD.amount END
        WHERE id = OLD.account_id
          AND business_id = OLD.business_id;
          
        -- Then apply the NEW value
        UPDATE chart_of_accounts
        SET current_balance = current_balance + 
            CASE WHEN NEW.line_type = 'debit' THEN NEW.amount ELSE -NEW.amount END
        WHERE id = NEW.account_id
          AND business_id = NEW.business_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 1.2: Create the trigger on journal_entry_lines
DROP TRIGGER IF EXISTS trg_update_account_balance ON journal_entry_lines;
CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION update_account_balance();

-- Step 1.3: Verify creation
SELECT 
    'Function created' as status,
    proname as function_name
FROM pg_proc 
WHERE proname = 'update_account_balance'
UNION ALL
SELECT 
    'Trigger created' as status,
    tgname as trigger_name
FROM pg_trigger 
WHERE tgname = 'trg_update_account_balance';
