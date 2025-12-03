-- ============================================================================
-- MIGRATION: Account Setup - Correct Function Call
-- ============================================================================
-- Purpose: Create default accounts using correct function call syntax
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
    
    -- Loop through ALL businesses
    FOR business_record IN SELECT id, name FROM businesses
    LOOP
        -- Find ANY user for this business
        SELECT u.id, u.role INTO user_record
        FROM users u
        WHERE u.business_id = business_record.id
        ORDER BY CASE WHEN u.role = 'owner' THEN 1
                      WHEN u.role = 'admin' THEN 2
                      ELSE 3 END
        LIMIT 1;
        
        IF FOUND THEN
            BEGIN
                -- CORRECT WAY: Call void function without assigning result
                EXECUTE 'SELECT setup_default_chart_of_accounts($1, $2)'
                USING business_record.id, user_record.id;
                
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
