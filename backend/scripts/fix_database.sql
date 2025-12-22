-- 1. Check if staff_availability has created_by column (it shouldn't)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'staff_availability' 
        AND column_name = 'created_by'
    ) THEN
        RAISE NOTICE 'Column created_by exists in staff_availability - this is wrong, removing...';
        ALTER TABLE staff_availability DROP COLUMN created_by;
    ELSE
        RAISE NOTICE 'Column created_by does not exist in staff_availability - correct!';
    END IF;
END $$;

-- 2. Create a timesheet period for testing (if none exists)
DO $$
DECLARE
    business_uuid UUID := '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    period_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO period_count 
    FROM timesheet_periods 
    WHERE business_id = business_uuid;
    
    IF period_count = 0 THEN
        INSERT INTO timesheet_periods (
            id, 
            business_id, 
            period_name, 
            start_date, 
            end_date, 
            pay_date,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            business_uuid,
            'December 2025',
            '2025-12-01',
            '2025-12-31',
            '2026-01-05',
            NOW(),
            NOW()
        );
        RAISE NOTICE 'Created timesheet period for testing';
    ELSE
        RAISE NOTICE 'Timesheet periods already exist: %', period_count;
    END IF;
END $$;

-- 3. Check payroll_export_configs table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name = 'payroll_export_configs'
    ) THEN
        RAISE NOTICE 'Table payroll_export_configs does not exist';
    ELSE
        RAISE NOTICE 'Table payroll_export_configs exists';
    END IF;
END $$;

-- 4. Check if payroll_export_configs has created_by column
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'payroll_export_configs' 
        AND column_name = 'created_by'
    ) THEN
        RAISE NOTICE 'Column created_by exists in payroll_export_configs';
    ELSE
        RAISE NOTICE 'Column created_by does not exist in payroll_export_configs - adding it...';
        ALTER TABLE payroll_export_configs ADD COLUMN created_by UUID REFERENCES users(id);
    END IF;
END $$;

-- Show current state
SELECT 
    'staff_availability' as table_name,
    COUNT(*) as row_count
FROM staff_availability 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
UNION ALL
SELECT 
    'timesheet_periods',
    COUNT(*)
FROM timesheet_periods 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
UNION ALL
SELECT 
    'payroll_export_configs',
    COUNT(*)
FROM payroll_export_configs 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
