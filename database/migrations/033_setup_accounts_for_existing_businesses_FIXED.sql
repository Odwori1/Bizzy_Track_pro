-- ============================================================================
-- MIGRATION: Setup Chart of Accounts for Existing Businesses (FIXED)
-- ============================================================================
-- Purpose: Create default accounts for all existing businesses
-- Date: 2025-12-03
-- Note: Run this AFTER 032_create_accounting_foundation.sql
-- ============================================================================

-- Setup accounts for ALL existing businesses
DO $$
DECLARE
    business_record RECORD;
    user_record RECORD;
    v_business_count INTEGER := 0;
    v_success_count INTEGER := 0;
    v_error_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting account setup for all businesses...';
    
    -- Loop through all businesses (checking status column if exists)
    FOR business_record IN 
        SELECT id, name FROM businesses 
        -- Try to check status columns that might exist
        WHERE (status = 'active' OR status IS NULL OR NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'businesses' AND column_name = 'status'
        ))
    LOOP
        v_business_count := v_business_count + 1;
        
        -- Find an owner/admin user for this business
        SELECT u.id INTO user_record
        FROM users u
        JOIN business_users bu ON u.id = bu.user_id
        WHERE bu.business_id = business_record.id
        AND (bu.role = 'owner' OR bu.role = 'admin')
        LIMIT 1;
        
        -- If found user, setup accounts
        IF FOUND THEN
            BEGIN
                RAISE NOTICE 'Setting up accounts for business: % (%) using user: %', 
                    business_record.name, business_record.id, user_record.id;
                
                PERFORM setup_default_chart_of_accounts(business_record.id, user_record.id);
                v_success_count := v_success_count + 1;
                
                RAISE NOTICE 'Successfully created accounts for: %', business_record.name;
            EXCEPTION WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                RAISE WARNING 'Failed to create accounts for business: % (%). Error: %', 
                    business_record.name, business_record.id, SQLERRM;
            END;
        ELSE
            v_error_count := v_error_count + 1;
            RAISE WARNING 'No owner/admin found for business: % (%). Accounts not created.', 
                business_record.name, business_record.id;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Account setup completed. Total: %, Success: %, Failed: %', 
        v_business_count, v_success_count, v_error_count;
END $$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this to verify accounts were created:
/*
SELECT 
    b.name as business_name,
    COUNT(coa.id) as account_count,
    MIN(coa.account_code) as min_account,
    MAX(coa.account_code) as max_account
FROM businesses b
LEFT JOIN chart_of_accounts coa ON b.id = coa.business_id
GROUP BY b.id, b.name
ORDER BY b.name;
*/
-- ============================================================================
