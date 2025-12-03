-- ============================================================================
-- MIGRATION: Simple Account Setup - Direct INSERT Approach
-- ============================================================================
-- Purpose: Create default accounts using simple INSERT statements (bypass function)
-- Date: 2025-12-03
-- ============================================================================

DO $$
DECLARE
    business_record RECORD;
    user_record RECORD;
    v_count INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting direct account setup for all businesses...';
    
    -- Loop through ALL businesses
    FOR business_record IN SELECT id, name FROM businesses
    LOOP
        -- Find ANY user for this business
        SELECT u.id INTO user_record
        FROM users u
        WHERE u.business_id = business_record.id
        LIMIT 1;
        
        IF FOUND THEN
            -- Check if business already has accounts
            IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE business_id = business_record.id LIMIT 1) THEN
                BEGIN
                    -- Insert default accounts
                    INSERT INTO chart_of_accounts 
                    (business_id, account_code, account_name, account_type, description, is_active, created_by, created_at)
                    VALUES
                    -- Root Accounts
                    (business_record.id, '1000', 'Assets', 'asset', 'Asset accounts', true, user_record.id, NOW()),
                    (business_record.id, '2000', 'Liabilities', 'liability', 'Liability accounts', true, user_record.id, NOW()),
                    (business_record.id, '3000', 'Equity', 'equity', 'Equity accounts', true, user_record.id, NOW()),
                    (business_record.id, '4000', 'Revenue', 'revenue', 'Revenue accounts', true, user_record.id, NOW()),
                    (business_record.id, '5000', 'Expenses', 'expense', 'Expense accounts', true, user_record.id, NOW()),
                    
                    -- Asset Sub-Accounts
                    (business_record.id, '1100', 'Cash', 'asset', 'Cash on hand', true, user_record.id, NOW()),
                    (business_record.id, '1200', 'Accounts Receivable', 'asset', 'Money owed by customers', true, user_record.id, NOW()),
                    (business_record.id, '1300', 'Inventory', 'asset', 'Goods for sale', true, user_record.id, NOW()),
                    
                    -- Liability Sub-Accounts
                    (business_record.id, '2100', 'Accounts Payable', 'liability', 'Money owed to suppliers', true, user_record.id, NOW()),
                    (business_record.id, '2200', 'Loans Payable', 'liability', 'Bank loans', true, user_record.id, NOW()),
                    
                    -- Equity Sub-Accounts
                    (business_record.id, '3100', 'Owner''s Capital', 'equity', 'Owner investment', true, user_record.id, NOW()),
                    (business_record.id, '3200', 'Retained Earnings', 'equity', 'Accumulated profits', true, user_record.id, NOW()),
                    
                    -- Revenue Sub-Accounts
                    (business_record.id, '4100', 'Sales Revenue', 'revenue', 'Income from product sales', true, user_record.id, NOW()),
                    (business_record.id, '4200', 'Service Revenue', 'revenue', 'Income from services', true, user_record.id, NOW()),
                    
                    -- Expense Sub-Accounts
                    (business_record.id, '5100', 'Cost of Goods Sold', 'expense', 'Cost of products sold', true, user_record.id, NOW()),
                    (business_record.id, '5200', 'Rent Expense', 'expense', 'Rent payments', true, user_record.id, NOW()),
                    (business_record.id, '5300', 'Utilities Expense', 'expense', 'Electricity, water, etc.', true, user_record.id, NOW()),
                    (business_record.id, '5400', 'Salary Expense', 'expense', 'Employee salaries', true, user_record.id, NOW()),
                    (business_record.id, '5500', 'Advertising Expense', 'expense', 'Marketing costs', true, user_record.id, NOW());
                    
                    v_count := v_count + 1;
                    RAISE NOTICE 'Created accounts for: %', business_record.name;
                    
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'Failed to create accounts for "%": %', business_record.name, SQLERRM;
                END;
            ELSE
                v_skipped := v_skipped + 1;
                RAISE NOTICE 'Business "%" already has accounts, skipping', business_record.name;
            END IF;
        ELSE
            RAISE WARNING 'No user found for business: %', business_record.name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Account Setup Complete!';
    RAISE NOTICE 'Created accounts for: % businesses', v_count;
    RAISE NOTICE 'Skipped (already had accounts): % businesses', v_skipped;
    RAISE NOTICE '========================================';
END $$;
