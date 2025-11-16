-- ============================================================================
-- WEEK 9: FIX JOB STATUS CONSTRAINT ISSUE - FINAL VERSION
-- ============================================================================

-- Drop the existing function
DROP FUNCTION IF EXISTS assign_job_to_department;

-- Recreate the function with CORRECT job status values
CREATE OR REPLACE FUNCTION assign_job_to_department(
    p_job_id UUID,
    p_department_id UUID,
    p_assigned_by UUID,
    p_assignment_type VARCHAR(50) DEFAULT 'primary'
) RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_job_status VARCHAR(50);
    v_department_exists BOOLEAN;
BEGIN
    -- Get business ID and verify job exists
    SELECT business_id, status INTO v_business_id, v_job_status
    FROM jobs WHERE id = p_job_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Job not found';
        RETURN;
    END IF;

    -- Verify department exists in same business
    SELECT EXISTS(
        SELECT 1 FROM departments 
        WHERE id = p_department_id AND business_id = v_business_id
    ) INTO v_department_exists;

    IF NOT v_department_exists THEN
        RETURN QUERY SELECT false, 'Department not found or access denied';
        RETURN;
    END IF;

    -- Check if job is already assigned to this department with same type
    IF EXISTS(
        SELECT 1 FROM job_department_assignments 
        WHERE job_id = p_job_id AND department_id = p_department_id AND assignment_type = p_assignment_type
    ) THEN
        RETURN QUERY SELECT false, 'Job already assigned to this department with same assignment type';
        RETURN;
    END IF;

    -- Create department assignment
    INSERT INTO job_department_assignments (
        business_id, job_id, department_id, assigned_by, 
        assignment_type, status, priority
    ) VALUES (
        v_business_id, p_job_id, p_department_id, p_assigned_by,
        p_assignment_type, 'assigned', 'medium'
    );

    -- Update job status if needed (use CORRECT status values)
    IF v_job_status = 'pending' THEN
        UPDATE jobs SET status = 'in-progress' WHERE id = p_job_id; -- FIXED: in-progress (with hyphen)
    END IF;

    RETURN QUERY SELECT true, 'Job successfully assigned to department';
END;
$$ LANGUAGE plpgsql;
