-- ============================================================================
-- MIGRATION: Simple Account Setup for Existing Businesses
-- ============================================================================
-- Purpose: Create default accounts for ALL businesses without status checks
-- Date: 2025-12-03
-- ============================================================================

DO $$
DECLARE
    business_record RECORD;
    user_record RECORD;
    v_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting account setup for all businesses...';
    
    -- Loop through ALL businesses
    FOR business_record IN SELECT id, name FROM businesses
    LOOP
        -- Find any user for this business (owner/admin preferred)
        SELECT u.id INTO user_record
        FROM users u
        JOIN business_users bu ON u.id = bu.user_id
        WHERE bu.business_id = business_record.id
        ORDER BY CASE WHEN bu.role = 'owner' THEN 1 
                      WHEN bu.role = 'admin' THEN 2
                      ELSE 3 END
        LIMIT 1;
        
        IF FOUND THEN
            BEGIN
                PERFORM setup_default_chart_of_accounts(business_record.id, user_record.id);
                v_count := v_count + 1;
                RAISE NOTICE 'Created accounts for: %', business_record.name;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Failed for %: %', business_record.name, SQLERRM;
            END;
        ELSE
            RAISE WARNING 'No user found for business: %', business_record.name;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Completed. Setup accounts for % businesses.', v_count;
END $$;
