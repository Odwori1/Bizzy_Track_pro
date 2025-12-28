-- Save as: database/migrations/055_unify_staff_workforce_departments.sql
-- ============================================================================
-- MIGRATION 055: UNIFIED STAFF, WORKFORCE & DEPARTMENTS SYSTEM
-- ============================================================================
-- Purpose: Create automated integration between Week 9 (staff), Week 10 (workforce), 
--          and departments systems. Ensures all future businesses have unified employee management.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: FIX EXISTING DATA GAP
-- ============================================================================

DO $$
DECLARE
    v_business_id UUID;
    v_employee_counter INTEGER := 1000; -- Start employee IDs from 1000
    v_user_record RECORD;
    v_profile_count INTEGER;
BEGIN
    RAISE NOTICE 'Fixing existing data gap...';
    
    -- Create sequence for employee IDs if not exists
    CREATE SEQUENCE IF NOT EXISTS employee_id_seq START 1000;
    
    -- Process each business that has staff users
    FOR v_business_id IN 
        SELECT DISTINCT business_id FROM users 
        WHERE business_id IS NOT NULL 
        AND role IN ('owner', 'manager', 'supervisor', 'staff')
    LOOP
        RAISE NOTICE 'Processing business: %', v_business_id;
        
        -- Count existing profiles for this business
        SELECT COUNT(*) INTO v_profile_count
        FROM staff_profiles 
        WHERE business_id = v_business_id;
        
        RAISE NOTICE 'Business % has % existing workforce profiles', v_business_id, v_profile_count;
        
        -- Create missing workforce profiles
        INSERT INTO staff_profiles (
            business_id,
            user_id,
            employee_id,
            job_title,
            employment_type,
            hire_date,
            base_wage_rate,
            wage_type,
            overtime_rate,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            skills,
            certifications,
            max_hours_per_week,
            is_active,
            created_at,
            updated_at
        )
        SELECT 
            u.business_id,
            u.id as user_id,
            'EMP' || LPAD((v_employee_counter + ROW_NUMBER() OVER (ORDER BY u.created_at))::text, 4, '0') as employee_id,
            CASE 
                WHEN u.role = 'owner' THEN 'Owner'
                WHEN u.role = 'manager' THEN 'Manager'
                WHEN u.role = 'supervisor' THEN 'Supervisor'
                WHEN u.role = 'staff' THEN 'Staff Member'
                ELSE 'Employee'
            END as job_title,
            'full_time' as employment_type,
            COALESCE(u.created_at::date, CURRENT_DATE) as hire_date,
            CASE 
                WHEN u.role = 'owner' THEN 0
                WHEN u.role = 'manager' THEN 20000
                WHEN u.role = 'supervisor' THEN 18000
                ELSE 15000
            END as base_wage_rate,
            'hourly' as wage_type,
            0 as overtime_rate,
            '' as emergency_contact_name,
            '' as emergency_contact_phone,
            '' as emergency_contact_relationship,
            ARRAY[]::text[] as skills,
            ARRAY[]::text[] as certifications,
            40 as max_hours_per_week,
            u.is_active as is_active,
            NOW() as created_at,
            NOW() as updated_at
        FROM users u
        LEFT JOIN staff_profiles sp ON u.id = sp.user_id AND sp.business_id = u.business_id
        WHERE u.business_id = v_business_id
            AND sp.id IS NULL  -- Only users without profiles
            AND u.role IN ('owner', 'manager', 'supervisor', 'staff')
        ON CONFLICT (business_id, user_id) DO NOTHING;
        
        GET DIAGNOSTICS v_profile_count = ROW_COUNT;
        RAISE NOTICE 'Created % new workforce profiles for business %', v_profile_count, v_business_id;
        
        -- Update employee counter
        v_employee_counter := v_employee_counter + 1000;
    END LOOP;
    
    RAISE NOTICE 'Existing data gap fixed successfully';
END $$;

-- ============================================================================
-- PART 2: CREATE AUTOMATED TRIGGERS FOR FUTURE STAFF
-- ============================================================================

-- Function to automatically create workforce profile when staff is created
CREATE OR REPLACE FUNCTION auto_create_workforce_profile()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_id TEXT;
    v_business_name TEXT;
    v_department_name TEXT;
BEGIN
    -- Only create for staff roles (not customers, etc.)
    IF NEW.role IN ('owner', 'manager', 'supervisor', 'staff') AND NEW.business_id IS NOT NULL THEN
        -- Generate employee ID: BIZ-INITIALS-001 (e.g., FPT-EMP-001)
        SELECT 
            UPPER(SUBSTRING(name FROM 1 FOR 3)) INTO v_business_name
        FROM businesses 
        WHERE id = NEW.business_id;
        
        -- Get department name if assigned
        IF NEW.department_id IS NOT NULL THEN
            SELECT name INTO v_department_name
            FROM departments 
            WHERE id = NEW.department_id AND business_id = NEW.business_id;
        END IF;
        
        -- Generate employee ID
        v_employee_id := COALESCE(v_business_name, 'BIZ') || '-EMP-' || 
                        LPAD((NEXTVAL('employee_id_seq') % 1000)::text, 3, '0');
        
        -- Create workforce profile
        INSERT INTO staff_profiles (
            business_id,
            user_id,
            employee_id,
            job_title,
            department_id,
            employment_type,
            hire_date,
            base_wage_rate,
            wage_type,
            overtime_rate,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relationship,
            skills,
            certifications,
            max_hours_per_week,
            is_active,
            created_at,
            updated_at
        ) VALUES (
            NEW.business_id,
            NEW.id,
            v_employee_id,
            CASE 
                WHEN NEW.role = 'owner' THEN 'Owner'
                WHEN NEW.role = 'manager' THEN 'Manager'
                WHEN NEW.role = 'supervisor' THEN 'Supervisor'
                WHEN NEW.role = 'staff' THEN 'Staff Member'
                ELSE 'Employee'
            END,
            NEW.department_id,
            'full_time',
            COALESCE(NEW.created_at::date, CURRENT_DATE),
            CASE 
                WHEN NEW.role = 'owner' THEN 0
                WHEN NEW.role = 'manager' THEN 20000
                WHEN NEW.role = 'supervisor' THEN 18000
                ELSE 15000
            END,
            'hourly',
            0,
            '',
            '',
            '',
            ARRAY[]::text[],
            ARRAY[]::text[],
            40,
            NEW.is_active,
            NOW(),
            NOW()
        ) ON CONFLICT (business_id, user_id) DO UPDATE
        SET 
            department_id = EXCLUDED.department_id,
            job_title = EXCLUDED.job_title,
            updated_at = NOW();
            
        RAISE NOTICE 'Automatically created workforce profile for user: % (%), employee_id: %', 
                    NEW.email, NEW.role, v_employee_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new staff users
DROP TRIGGER IF EXISTS trg_auto_create_workforce_profile ON users;
CREATE TRIGGER trg_auto_create_workforce_profile
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION auto_create_workforce_profile();

-- ============================================================================
-- PART 3: CREATE SYNCHRONIZATION TRIGGERS
-- ============================================================================

-- Function to sync department changes between users and staff_profiles
CREATE OR REPLACE FUNCTION sync_department_assignment()
RETURNS TRIGGER AS $$
BEGIN
    -- When department is assigned to user, also update staff_profile
    IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
        UPDATE staff_profiles
        SET department_id = NEW.department_id,
            updated_at = NOW()
        WHERE user_id = NEW.id 
            AND business_id = NEW.business_id;
            
        RAISE NOTICE 'Synced department assignment for user: % (department: %)', 
                    NEW.email, NEW.department_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for department synchronization
DROP TRIGGER IF EXISTS trg_sync_department_assignment ON users;
CREATE TRIGGER trg_sync_department_assignment
AFTER UPDATE OF department_id ON users
FOR EACH ROW
WHEN (NEW.role IN ('owner', 'manager', 'supervisor', 'staff'))
EXECUTE FUNCTION sync_department_assignment();

-- Function to sync user role changes to job_title
CREATE OR REPLACE FUNCTION sync_role_to_job_title()
RETURNS TRIGGER AS $$
BEGIN
    -- When role changes, update job_title in staff_profile
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        UPDATE staff_profiles
        SET job_title = CASE 
                WHEN NEW.role = 'owner' THEN 'Owner'
                WHEN NEW.role = 'manager' THEN 'Manager'
                WHEN NEW.role = 'supervisor' THEN 'Supervisor'
                WHEN NEW.role = 'staff' THEN 'Staff Member'
                ELSE 'Employee'
            END,
            base_wage_rate = CASE 
                WHEN NEW.role = 'owner' THEN 0
                WHEN NEW.role = 'manager' THEN 20000
                WHEN NEW.role = 'supervisor' THEN 18000
                ELSE 15000
            END,
            updated_at = NOW()
        WHERE user_id = NEW.id 
            AND business_id = NEW.business_id;
            
        RAISE NOTICE 'Synced role change for user: % (new role: %)', 
                    NEW.email, NEW.role;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for role synchronization
DROP TRIGGER IF EXISTS trg_sync_role_to_job_title ON users;
CREATE TRIGGER trg_sync_role_to_job_title
AFTER UPDATE OF role ON users
FOR EACH ROW
WHEN (NEW.role IN ('owner', 'manager', 'supervisor', 'staff'))
EXECUTE FUNCTION sync_role_to_job_title();

-- ============================================================================
-- PART 4: CREATE UNIFIED VIEWS FOR REPORTING
-- ============================================================================

-- Unified employee view (single source of truth)
DROP VIEW IF EXISTS unified_employees;
CREATE OR REPLACE VIEW unified_employees AS
SELECT 
    -- User information (Week 9)
    u.id as user_id,
    u.business_id,
    u.email,
    u.full_name,
    u.role,
    u.phone,
    u.is_active as user_active,
    u.last_login_at,
    u.created_at as user_created,
    u.updated_at as user_updated,
    u.department_id as user_department_id,
    
    -- Workforce information (Week 10)
    sp.id as staff_profile_id,
    sp.employee_id,
    sp.job_title,
    sp.employment_type,
    sp.hire_date,
    sp.termination_date,
    sp.base_wage_rate,
    sp.wage_type,
    sp.overtime_rate,
    sp.max_hours_per_week,
    sp.is_active as profile_active,
    sp.department_id as profile_department_id,
    sp.created_at as profile_created,
    sp.updated_at as profile_updated,
    
    -- Department information
    d.id as department_id,
    d.name as department_name,
    d.code as department_code,
    d.department_type,
    d.is_active as department_active,
    
    -- Current status (from clock events)
    (
        SELECT ce.event_type
        FROM clock_events ce
        WHERE ce.staff_profile_id = sp.id
        ORDER BY ce.event_time DESC
        LIMIT 1
    ) as last_clock_event,
    
    (
        SELECT ce.event_time
        FROM clock_events ce
        WHERE ce.staff_profile_id = sp.id
        ORDER BY ce.event_time DESC
        LIMIT 1
    ) as last_clock_time,
    
    -- Combined active status
    CASE 
        WHEN u.is_active = false THEN 'User Inactive'
        WHEN sp.is_active = false THEN 'Profile Inactive'
        WHEN sp.termination_date IS NOT NULL AND sp.termination_date <= CURRENT_DATE THEN 'Terminated'
        ELSE 'Active'
    END as overall_status,
    
    -- Effective department (prefer profile's, fall back to user's)
    COALESCE(sp.department_id, u.department_id) as effective_department_id,
    COALESCE(
        (SELECT name FROM departments WHERE id = COALESCE(sp.department_id, u.department_id)),
        d.name
    ) as effective_department_name

FROM users u
LEFT JOIN staff_profiles sp ON u.id = sp.user_id AND u.business_id = sp.business_id
LEFT JOIN departments d ON COALESCE(sp.department_id, u.department_id) = d.id
WHERE u.role IN ('owner', 'manager', 'supervisor', 'staff')
    AND u.business_id IS NOT NULL;

-- Department staffing view
DROP VIEW IF EXISTS department_staffing;
CREATE OR REPLACE VIEW department_staffing AS
SELECT 
    d.business_id,
    d.id as department_id,
    d.name as department_name,
    d.code as department_code,
    d.department_type,
    COUNT(DISTINCT ue.user_id) as total_staff,
    COUNT(DISTINCT CASE WHEN ue.overall_status = 'Active' THEN ue.user_id END) as active_staff,
    COUNT(DISTINCT CASE WHEN ue.role = 'manager' THEN ue.user_id END) as managers,
    COUNT(DISTINCT CASE WHEN ue.role = 'supervisor' THEN ue.user_id END) as supervisors,
    COUNT(DISTINCT CASE WHEN ue.role = 'staff' THEN ue.user_id END) as regular_staff,
    COALESCE(SUM(ue.base_wage_rate), 0) as total_wage_burden,
    MIN(ue.hire_date) as earliest_hire_date,
    MAX(ue.hire_date) as latest_hire_date
FROM departments d
LEFT JOIN unified_employees ue ON d.id = ue.effective_department_id
WHERE d.is_active = true
GROUP BY d.business_id, d.id, d.name, d.code, d.department_type
ORDER BY d.business_id, d.name;

-- ============================================================================
-- PART 5: CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to get unified employee data
CREATE OR REPLACE FUNCTION get_unified_employee(p_user_id UUID, p_business_id UUID DEFAULT NULL)
RETURNS TABLE (
    user_id UUID,
    email VARCHAR,
    full_name VARCHAR,
    role VARCHAR,
    employee_id VARCHAR,
    job_title VARCHAR,
    department_name VARCHAR,
    department_code VARCHAR,
    status VARCHAR,
    has_workforce_profile BOOLEAN,
    can_clock_in BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ue.user_id,
        ue.email,
        ue.full_name,
        ue.role,
        ue.employee_id,
        ue.job_title,
        ue.department_name,
        ue.department_code,
        ue.overall_status as status,
        (ue.staff_profile_id IS NOT NULL) as has_workforce_profile,
        (ue.staff_profile_id IS NOT NULL AND ue.profile_active = true AND ue.overall_status = 'Active') as can_clock_in
    FROM unified_employees ue
    WHERE ue.user_id = p_user_id
        AND (p_business_id IS NULL OR ue.business_id = p_business_id)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to check and fix orphaned records
CREATE OR REPLACE FUNCTION validate_employee_integrity(p_business_id UUID DEFAULT NULL)
RETURNS TABLE (
    issue_type VARCHAR,
    issue_count INTEGER,
    description TEXT,
    suggested_action TEXT
) AS $$
BEGIN
    RETURN QUERY
    -- Users without workforce profiles
    SELECT 
        'Missing Workforce Profile'::VARCHAR as issue_type,
        COUNT(*)::INTEGER as issue_count,
        'Staff users cannot use time tracking features'::TEXT as description,
        'Run: SELECT auto_create_missing_profiles(''' || COALESCE(p_business_id::text, 'NULL') || ''')'::TEXT as suggested_action
    FROM users u
    LEFT JOIN staff_profiles sp ON u.id = sp.user_id AND u.business_id = sp.business_id
    WHERE sp.id IS NULL
        AND u.role IN ('owner', 'manager', 'supervisor', 'staff')
        AND (p_business_id IS NULL OR u.business_id = p_business_id)
    
    UNION ALL
    
    -- Workforce profiles without users (orphaned)
    SELECT 
        'Orphaned Workforce Profile'::VARCHAR,
        COUNT(*)::INTEGER,
        'Workforce profiles with no corresponding user'::TEXT,
        'Run: DELETE FROM staff_profiles WHERE user_id NOT IN (SELECT id FROM users)'::TEXT
    FROM staff_profiles sp
    LEFT JOIN users u ON sp.user_id = u.id
    WHERE u.id IS NULL
        AND (p_business_id IS NULL OR sp.business_id = p_business_id)
    
    UNION ALL
    
    -- Department mismatch between user and profile
    SELECT 
        'Department Mismatch'::VARCHAR,
        COUNT(*)::INTEGER,
        'User and workforce profile have different department assignments'::TEXT,
        'Run: UPDATE staff_profiles SET department_id = u.department_id FROM users u WHERE staff_profiles.user_id = u.id AND staff_profiles.department_id != u.department_id'::TEXT
    FROM users u
    INNER JOIN staff_profiles sp ON u.id = sp.user_id AND u.business_id = sp.business_id
    WHERE u.department_id IS DISTINCT FROM sp.department_id
        AND (p_business_id IS NULL OR u.business_id = p_business_id);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-create missing profiles (manual trigger)
CREATE OR REPLACE FUNCTION auto_create_missing_profiles(p_business_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    v_created_count INTEGER := 0;
BEGIN
    INSERT INTO staff_profiles (
        business_id,
        user_id,
        employee_id,
        job_title,
        employment_type,
        hire_date,
        base_wage_rate,
        wage_type,
        overtime_rate,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        skills,
        certifications,
        max_hours_per_week,
        is_active,
        created_at,
        updated_at
    )
    SELECT 
        u.business_id,
        u.id as user_id,
        COALESCE(
            (SELECT UPPER(SUBSTRING(name FROM 1 FOR 3)) FROM businesses WHERE id = u.business_id),
            'BIZ'
        ) || '-EMP-' || LPAD((NEXTVAL('employee_id_seq') % 1000)::text, 3, '0') as employee_id,
        CASE 
            WHEN u.role = 'owner' THEN 'Owner'
            WHEN u.role = 'manager' THEN 'Manager'
            WHEN u.role = 'supervisor' THEN 'Supervisor'
            WHEN u.role = 'staff' THEN 'Staff Member'
            ELSE 'Employee'
        END as job_title,
        'full_time' as employment_type,
        COALESCE(u.created_at::date, CURRENT_DATE) as hire_date,
        CASE 
            WHEN u.role = 'owner' THEN 0
            WHEN u.role = 'manager' THEN 20000
            WHEN u.role = 'supervisor' THEN 18000
            ELSE 15000
        END as base_wage_rate,
        'hourly' as wage_type,
        0 as overtime_rate,
        '' as emergency_contact_name,
        '' as emergency_contact_phone,
        '' as emergency_contact_relationship,
        ARRAY[]::text[] as skills,
        ARRAY[]::text[] as certifications,
        40 as max_hours_per_week,
        u.is_active as is_active,
        NOW() as created_at,
        NOW() as updated_at
    FROM users u
    LEFT JOIN staff_profiles sp ON u.id = sp.user_id AND u.business_id = sp.business_id
    WHERE sp.id IS NULL
        AND u.role IN ('owner', 'manager', 'supervisor', 'staff')
        AND u.business_id IS NOT NULL
        AND (p_business_id IS NULL OR u.business_id = p_business_id)
    ON CONFLICT (business_id, user_id) DO NOTHING;
    
    GET DIAGNOSTICS v_created_count = ROW_COUNT;
    
    RETURN v_created_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6: UPDATE EXISTING TRIGGERS FROM WEEK 10 MIGRATION
-- ============================================================================

-- Modify the existing process_clock_event function to check for workforce profile
CREATE OR REPLACE FUNCTION process_clock_event(
    p_staff_profile_id UUID,
    p_event_type VARCHAR(20),
    p_shift_roster_id UUID DEFAULT NULL,
    p_gps_latitude DECIMAL DEFAULT NULL,
    p_gps_longitude DECIMAL DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, message TEXT, clock_event_id UUID) AS $$
DECLARE
    v_business_id UUID;
    v_staff_exists BOOLEAN;
    v_current_shift UUID;
    v_last_clock_event RECORD;
    v_user_id UUID;
    v_user_role VARCHAR;
BEGIN
    -- Get user_id and role for better error messages
    SELECT user_id, 
           (SELECT role FROM users WHERE id = staff_profiles.user_id) INTO v_user_id, v_user_role
    FROM staff_profiles 
    WHERE id = p_staff_profile_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Staff profile not found. User may need workforce profile created.', NULL;
        RETURN;
    END IF;
    
    -- Check if user is active
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_user_id AND is_active = true) THEN
        RETURN QUERY SELECT false, 'User account is not active', NULL;
        RETURN;
    END IF;
    
    -- Rest of the original function remains the same...
    -- [Keep the original function body from Week 10 migration]
    
    -- Get business ID
    SELECT business_id INTO v_business_id
    FROM staff_profiles WHERE id = p_staff_profile_id;

    -- Validate event sequence
    SELECT * INTO v_last_clock_event
    FROM clock_events
    WHERE staff_profile_id = p_staff_profile_id
    ORDER BY event_time DESC
    LIMIT 1;

    -- Validate clock in/out sequence
    IF v_last_clock_event IS NOT NULL THEN
        IF v_last_clock_event.event_type = p_event_type THEN
            RETURN QUERY SELECT false, 'Invalid event sequence: ' || p_event_type || ' after ' || v_last_clock_event.event_type, NULL;
            RETURN;
        END IF;
    ELSIF p_event_type != 'clock_in' THEN
        RETURN QUERY SELECT false, 'Must clock in first', NULL;
        RETURN;
    END IF;

    -- Create clock event
    INSERT INTO clock_events (
        business_id, staff_profile_id, shift_roster_id,
        event_type, gps_latitude, gps_longitude, event_time
    ) VALUES (
        v_business_id, p_staff_profile_id, p_shift_roster_id,
        p_event_type, p_gps_latitude, p_gps_longitude, NOW()
    ) RETURNING id INTO clock_event_id;

    -- Update shift status if clocking in/out
    IF p_shift_roster_id IS NOT NULL THEN
        IF p_event_type = 'clock_in' THEN
            UPDATE shift_rosters
            SET shift_status = 'in_progress', actual_start_time = CURRENT_TIME
            WHERE id = p_shift_roster_id;
        ELSIF p_event_type = 'clock_out' THEN
            UPDATE shift_rosters
            SET shift_status = 'completed', actual_end_time = CURRENT_TIME
            WHERE id = p_shift_roster_id;
        END IF;
    END IF;

    RETURN QUERY SELECT true, 'Clock event recorded successfully', clock_event_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 7: ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for unified queries
CREATE INDEX IF NOT EXISTS idx_users_business_role ON users(business_id, role) WHERE role IN ('owner', 'manager', 'supervisor', 'staff');
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_business ON staff_profiles(user_id, business_id);
CREATE INDEX IF NOT EXISTS idx_unified_lookup ON users(business_id, id, role) WHERE role IN ('owner', 'manager', 'supervisor', 'staff');

-- ============================================================================
-- PART 8: VERIFICATION AND REPORTING
-- ============================================================================

DO $$
DECLARE
    v_total_users INTEGER;
    v_total_profiles INTEGER;
    v_missing_profiles INTEGER;
    v_businesses_affected INTEGER;
BEGIN
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'UNIFIED SYSTEM MIGRATION COMPLETE';
    RAISE NOTICE '=========================================';
    
    -- Get statistics
    SELECT COUNT(*) INTO v_total_users
    FROM users 
    WHERE role IN ('owner', 'manager', 'supervisor', 'staff');
    
    SELECT COUNT(*) INTO v_total_profiles
    FROM staff_profiles;
    
    SELECT COUNT(*) INTO v_missing_profiles
    FROM users u
    LEFT JOIN staff_profiles sp ON u.id = sp.user_id
    WHERE sp.id IS NULL
        AND u.role IN ('owner', 'manager', 'supervisor', 'staff');
    
    SELECT COUNT(DISTINCT business_id) INTO v_businesses_affected
    FROM users 
    WHERE role IN ('owner', 'manager', 'supervisor', 'staff');
    
    RAISE NOTICE 'Total Staff Users: %', v_total_users;
    RAISE NOTICE 'Total Workforce Profiles: %', v_total_profiles;
    RAISE NOTICE 'Missing Profiles (before fix): %', v_missing_profiles;
    RAISE NOTICE 'Businesses Affected: %', v_businesses_affected;
    RAISE NOTICE '';
    RAISE NOTICE 'Automated triggers created:';
    RAISE NOTICE '- trg_auto_create_workforce_profile: Creates profile on user insert';
    RAISE NOTICE '- trg_sync_department_assignment: Syncs department changes';
    RAISE NOTICE '- trg_sync_role_to_job_title: Syncs role changes';
    RAISE NOTICE '';
    RAISE NOTICE 'Views created:';
    RAISE NOTICE '- unified_employees: Single source of truth';
    RAISE NOTICE '- department_staffing: Department analytics';
    RAISE NOTICE '';
    RAISE NOTICE 'Helper functions:';
    RAISE NOTICE '- get_unified_employee(): Get combined data';
    RAISE NOTICE '- validate_employee_integrity(): Check system health';
    RAISE NOTICE '- auto_create_missing_profiles(): Manual fix tool';
    RAISE NOTICE '=========================================';
END $$;

COMMIT;
