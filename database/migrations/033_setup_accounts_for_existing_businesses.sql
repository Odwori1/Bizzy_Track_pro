-- ============================================================================
-- MIGRATION: Setup Chart of Accounts for Existing Businesses
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
BEGIN
    -- Loop through all businesses
    FOR business_record IN 
        SELECT id FROM businesses WHERE is_active = true
    LOOP
        -- Find an owner/admin user for this business
        SELECT u.id INTO user_record
        FROM users u
        JOIN business_users bu ON u.id = bu.user_id
        WHERE bu.business_id = business_record.id
        AND (bu.role = 'owner' OR bu.role = 'admin')
        LIMIT 1;
        
        -- If found user, setup accounts
        IF FOUND THEN
            RAISE NOTICE 'Setting up accounts for business: % using user: %', 
                business_record.id, user_record.id;
            
            PERFORM setup_default_chart_of_accounts(business_record.id, user_record.id);
        ELSE
            RAISE WARNING 'No owner/admin found for business: %. Accounts not created.', 
                business_record.id;
        END IF;
    END LOOP;
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
WHERE b.is_active = true
GROUP BY b.id, b.name
ORDER BY b.name;
*/
-- ============================================================================
