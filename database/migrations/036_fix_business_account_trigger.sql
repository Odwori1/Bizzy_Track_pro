-- ============================================================================
-- MIGRATION: Fix Business Account Trigger
-- ============================================================================
-- Purpose: Fix the broken trigger function with retry logic and proper error handling
-- Date: 2025-12-03
-- ============================================================================

-- First, let's check what we currently have
DO $$
BEGIN
    RAISE NOTICE '=== FIXING BUSINESS ACCOUNT TRIGGER ===';
END $$;

-- Drop the existing trigger first (to avoid conflicts)
DROP TRIGGER IF EXISTS trigger_create_business_accounts ON businesses;

-- Drop the existing function (which is broken)
DROP FUNCTION IF EXISTS create_accounts_for_new_business();

-- Create the fixed function with RETRY LOGIC and ERROR HANDLING
CREATE OR REPLACE FUNCTION create_accounts_for_new_business()
RETURNS TRIGGER AS $$
DECLARE
    v_owner_id UUID;
    v_retry_count INTEGER := 0;
    v_max_retries INTEGER := 5;
    v_accounts_created INTEGER := 0;
    v_error_context TEXT;
BEGIN
    -- Log that trigger fired
    RAISE NOTICE '🚀 TRIGGER FIRED: Creating accounts for new business: "%" (ID: %)', NEW.name, NEW.id;

    -- ========================================================================
    -- PHASE 1: FIND OWNER WITH RETRY LOGIC
    -- ========================================================================
    WHILE v_retry_count < v_max_retries AND v_owner_id IS NULL LOOP
        BEGIN
            -- Try to find the owner user
            SELECT id INTO v_owner_id
            FROM users
            WHERE business_id = NEW.id
            ORDER BY created_at
            LIMIT 1;

            IF v_owner_id IS NULL THEN
                RAISE NOTICE '   Retry %/%: No users found for business yet. Waiting 0.5s...', 
                             v_retry_count + 1, v_max_retries;
                v_retry_count := v_retry_count + 1;
                
                -- Wait before retrying (non-blocking sleep)
                PERFORM pg_sleep(0.5);
            ELSE
                RAISE NOTICE '   ✅ Owner found: %', v_owner_id;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE WARNING '   ⚠️ Error finding owner on retry %: %', v_retry_count, SQLERRM;
                v_retry_count := v_retry_count + 1;
                PERFORM pg_sleep(0.5);
        END;
    END LOOP;

    -- ========================================================================
    -- PHASE 2: FALLBACK IF NO OWNER FOUND
    -- ========================================================================
    IF v_owner_id IS NULL THEN
        RAISE WARNING '⚠️ No owner user found after % retries for business: "%"', 
                     v_max_retries, NEW.name;
        
        -- Try to find ANY user in the system to use as fallback
        SELECT id INTO v_owner_id
        FROM users
        WHERE role = 'admin' OR role = 'system'
        ORDER BY created_at
        LIMIT 1;

        IF v_owner_id IS NULL THEN
            -- Last resort: use a NULL user ID but still create accounts
            v_owner_id := NULL;
            RAISE WARNING '⚠️ No system/admin user found. Creating accounts with NULL user_id.';
        ELSE
            RAISE NOTICE '   Using fallback system/admin user: %', v_owner_id;
        END IF;
    END IF;

    -- ========================================================================
    -- PHASE 3: CREATE DEFAULT ACCOUNTS (WITH ERROR HANDLING)
    -- ========================================================================
    BEGIN
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

        -- Get count of accounts created
        GET DIAGNOSTICS v_accounts_created = ROW_COUNT;
        
        RAISE NOTICE '✅ SUCCESS: Created % default accounts for business: "%"', 
                    v_accounts_created, NEW.name;

        -- Log this success in audit_logs
        INSERT INTO audit_logs (
            business_id, user_id, action, resource_type, resource_id,
            old_values, new_values, metadata, created_at
        ) VALUES (
            NEW.id, v_owner_id, 'CREATE', 'chart_of_accounts', NEW.id,
            '{}'::jsonb, 
            jsonb_build_object('accounts_created', v_accounts_created, 'business_name', NEW.name),
            jsonb_build_object('trigger', 'create_accounts_for_new_business', 'status', 'success'),
            NOW()
        );

    EXCEPTION
        WHEN OTHERS THEN
            v_error_context := 'Error creating accounts for business: ' || NEW.id || ' - ' || SQLERRM;
            RAISE WARNING '❌ CRITICAL ERROR: %', v_error_context;
            
            -- Log the error in audit_logs
            INSERT INTO audit_logs (
                business_id, user_id, action, resource_type, resource_id,
                old_values, new_values, metadata, created_at
            ) VALUES (
                NEW.id, v_owner_id, 'ERROR', 'chart_of_accounts', NEW.id,
                '{}'::jsonb,
                jsonb_build_object('error', SQLERRM, 'business_name', NEW.name),
                jsonb_build_object('trigger', 'create_accounts_for_new_business', 'status', 'failed'),
                NOW()
            );
            
            -- RE-RAISE the error so the transaction knows something went wrong
            RAISE EXCEPTION '%', v_error_context;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- CREATE THE TRIGGER
-- ========================================================================
CREATE TRIGGER trigger_create_business_accounts
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION create_accounts_for_new_business();

-- ========================================================================
-- VERIFICATION
-- ========================================================================
DO $$
DECLARE
    v_trigger_exists BOOLEAN;
    v_function_exists BOOLEAN;
BEGIN
    -- Check if trigger was created
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_create_business_accounts'
    ) INTO v_trigger_exists;

    -- Check if function was created
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'create_accounts_for_new_business'
    ) INTO v_function_exists;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'TRIGGER FIX VERIFICATION:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Trigger exists: %', 
        CASE WHEN v_trigger_exists THEN '✅ YES' ELSE '❌ NO' END;
    RAISE NOTICE 'Function exists: %', 
        CASE WHEN v_function_exists THEN '✅ YES' ELSE '❌ NO' END;
    RAISE NOTICE '========================================';
END $$;

-- Create/ensure index exists for better performance
CREATE INDEX IF NOT EXISTS idx_users_business_id_created_at ON users(business_id, created_at);

-- ========================================================================
-- FINAL STATUS CHECK
-- ========================================================================
SELECT
    'Business Account Trigger Fix' as check_item,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trigger_create_business_accounts'
    ) THEN '✅ FIXED AND READY' ELSE '❌ STILL BROKEN' END as status;
