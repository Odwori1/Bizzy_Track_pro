-- ============================================================================
-- MIGRATION: Create Business Account Trigger
-- ============================================================================
-- Purpose: Automatically create chart of accounts when new business is created
-- Date: 2025-12-03
-- ============================================================================

-- Function to create accounts for new business
CREATE OR REPLACE FUNCTION create_accounts_for_new_business()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- Find the owner user (user who created the business)
    -- This assumes the first user with this business_id is the owner
    SELECT id INTO v_owner_id
    FROM users 
    WHERE business_id = NEW.id 
    ORDER BY created_at 
    LIMIT 1;
    
    IF v_owner_id IS NOT NULL THEN
        -- Create default accounts using the correct account codes
        INSERT INTO chart_of_accounts 
        (business_id, account_code, account_name, account_type, description, is_active, created_by, created_at)
        VALUES
        -- Root Accounts
        (NEW.id, '1000', 'Assets', 'asset', 'Asset accounts', true, v_owner_id, NOW()),
        (NEW.id, '2000', 'Liabilities', 'liability', 'Liability accounts', true, v_owner_id, NOW()),
        (NEW.id, '3000', 'Equity', 'equity', 'Equity accounts', true, v_owner_id, NOW()),
        (NEW.id, '4000', 'Revenue', 'revenue', 'Revenue accounts', true, v_owner_id, NOW()),
        (NEW.id, '5000', 'Expenses', 'expense', 'Expense accounts', true, v_owner_id, NOW()),
        
        -- Asset Sub-Accounts (IMPORTANT: Cash is 1110, not 1100)
        (NEW.id, '1110', 'Cash', 'asset', 'Cash on hand', true, v_owner_id, NOW()),
        (NEW.id, '1200', 'Accounts Receivable', 'asset', 'Money owed by customers', true, v_owner_id, NOW()),
        (NEW.id, '1300', 'Inventory', 'asset', 'Goods for sale', true, v_owner_id, NOW()),
        
        -- Liability Sub-Accounts
        (NEW.id, '2100', 'Accounts Payable', 'liability', 'Money owed to suppliers', true, v_owner_id, NOW()),
        (NEW.id, '2200', 'Loans Payable', 'liability', 'Bank loans', true, v_owner_id, NOW()),
        
        -- Equity Sub-Accounts
        (NEW.id, '3100', 'Owner''s Capital', 'equity', 'Owner investment', true, v_owner_id, NOW()),
        (NEW.id, '3200', 'Retained Earnings', 'equity', 'Accumulated profits', true, v_owner_id, NOW()),
        
        -- Revenue Sub-Accounts
        (NEW.id, '4100', 'Sales Revenue', 'revenue', 'Income from product sales', true, v_owner_id, NOW()),
        (NEW.id, '4200', 'Service Revenue', 'revenue', 'Income from services', true, v_owner_id, NOW()),
        
        -- Expense Sub-Accounts
        (NEW.id, '5100', 'Cost of Goods Sold', 'expense', 'Cost of products sold', true, v_owner_id, NOW()),
        (NEW.id, '5200', 'Rent Expense', 'expense', 'Rent payments', true, v_owner_id, NOW()),
        (NEW.id, '5300', 'Utilities Expense', 'expense', 'Electricity, water, etc.', true, v_owner_id, NOW()),
        (NEW.id, '5400', 'Salary Expense', 'expense', 'Employee salaries', true, v_owner_id, NOW()),
        (NEW.id, '5500', 'Advertising Expense', 'expense', 'Marketing costs', true, v_owner_id, NOW());
        
        RAISE NOTICE 'Created default accounts for new business: %', NEW.name;
    ELSE
        RAISE WARNING 'No owner user found for new business: %. Accounts not created.', NEW.name;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_create_business_accounts
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION create_accounts_for_new_business();

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);

-- Verify trigger was created
SELECT 
    'Business Account Trigger Status' as check_item,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_create_business_accounts'
    ) THEN '✅ CREATED' ELSE '❌ MISSING' END as status;
