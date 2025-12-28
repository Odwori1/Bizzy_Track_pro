-- Save as: fix_helper_functions.sql
BEGIN;

-- Drop and recreate the get_unified_employee function
DROP FUNCTION IF EXISTS get_unified_employee(UUID, UUID);

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
        ue.has_workforce_profile,
        ue.can_clock_in
    FROM unified_employees ue
    WHERE ue.user_id = p_user_id
        AND (p_business_id IS NULL OR ue.business_id = p_business_id)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMIT;
