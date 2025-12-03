-- ============================================================================
-- MIGRATION: Final Account Setup for Existing Businesses
-- ============================================================================
-- Purpose: Create default accounts for ALL businesses using correct table structure
-- Date: 2025-12-03
-- ============================================================================

DO $$
DECLARE
    business_record RECORD;
    user_record RECORD;
    v_count INTEGER := 0;
    v_failed INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting account setup for all businesses...';
    RAISE NOTICE 'Using users.business_id for business-user relationship';
    
    -- Loop through ALL businesses
    FOR business_record IN SELECT id, name FROM businesses
    LOOP
        -- Find ANY user for this business (prefer owner, then admin, then any)
        -- USING users.business_id column (direct relationship)
        SELECT u.id, u.role INTO user_record
        FROM users u
        WHERE u.business_id = business_record.id
        ORDER BY CASE WHEN u.role = 'owner' THEN 1
                      WHEN u.role = 'admin' THEN 2
                      ELSE 3 END
        LIMIT 1;
        
        IF FOUND THEN
            BEGIN
                PERFORM setup_default_chart_of_accounts(business_record.id, user_record.id);
                v_count := v_count + 1;
                RAISE NOTICE 'Created accounts for: % (using user: %, role: %)', 
                    business_record.name, user_record.id, user_record.role;
            EXCEPTION WHEN OTHERS THEN
                v_failed := v_failed + 1;
                RAISE WARNING 'Failed for business "%": %', business_record.name, SQLERRM;
            END;
        ELSE
            v_failed := v_failed + 1;
            RAISE WARNING 'No user found for business: %', business_record.name;
        END IF;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Account Setup Complete!';
    RAISE NOTICE 'Successful: % businesses', v_count;
    RAISE NOTICE 'Failed: % businesses', v_failed;
    RAISE NOTICE '========================================';
END $$;
