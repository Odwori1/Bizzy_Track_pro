-- Save as: fix_unified_view.sql
BEGIN;

-- Drop and recreate the unified_employees view with corrected columns
DROP VIEW IF EXISTS unified_employees CASCADE;

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
    
    -- Helper columns for API
    (sp.id IS NOT NULL) as has_workforce_profile,
    
    -- Can clock in logic: has profile, is active, and not already clocked in
    CASE 
        WHEN sp.id IS NOT NULL 
            AND u.is_active = true 
            AND sp.is_active = true
            AND (sp.termination_date IS NULL OR sp.termination_date > CURRENT_DATE)
            AND NOT EXISTS (
                SELECT 1 FROM clock_events ce 
                WHERE ce.staff_profile_id = sp.id 
                AND ce.event_type = 'clock_in'
                AND NOT EXISTS (
                    SELECT 1 FROM clock_events ce2 
                    WHERE ce2.staff_profile_id = sp.id 
                    AND ce2.event_type = 'clock_out'
                    AND ce2.event_time > ce.event_time
                )
            )
        THEN true
        ELSE false
    END as can_clock_in,
    
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

-- Recreate the department_staffing view
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

COMMIT;
