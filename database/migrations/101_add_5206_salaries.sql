-- 101_add_5206_salaries.sql
-- Safe, isolated addition of 5206 - Salaries and Wages

BEGIN;

DO $$
DECLARE
    v_business RECORD;
    v_added_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Adding 5206 - Salaries and Wages to all businesses...';

    FOR v_business IN SELECT id FROM businesses LOOP
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name,
            account_type, is_active, created_at, updated_at
        )
        VALUES (
            v_business.id, '5206', 'Salaries and Wages',
            'expense', true, NOW(), NOW()
        )
        ON CONFLICT (business_id, account_code) DO NOTHING;

        IF FOUND THEN
            v_added_count := v_added_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'Added or confirmed 5206 for % businesses', v_added_count;
END $$;

COMMIT;
