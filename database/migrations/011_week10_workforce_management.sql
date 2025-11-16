-- ============================================================================
-- WEEK 10: WORKFORCE & SHIFT MANAGEMENT MIGRATION
-- ============================================================================

BEGIN;

-- 1. Staff profiles with enhanced information
CREATE TABLE staff_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Professional information
    employee_id VARCHAR(50) NOT NULL,
    job_title VARCHAR(100) NOT NULL,
    department_id UUID REFERENCES departments(id),
    
    -- Employment details
    employment_type VARCHAR(20) NOT NULL CHECK (employment_type IN ('full_time', 'part_time', 'contract', 'temporary')),
    hire_date DATE NOT NULL,
    termination_date DATE,
    base_wage_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
    wage_type VARCHAR(20) NOT NULL CHECK (wage_type IN ('hourly', 'salary', 'commission')),
    overtime_rate DECIMAL(10,2) DEFAULT 0,
    
    -- Contact and emergency information
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relationship VARCHAR(50),
    
    -- Skills and qualifications
    skills TEXT[], -- Array of skills
    certifications TEXT[], -- Array of certifications
    max_hours_per_week INTEGER DEFAULT 40,
    
    -- System fields
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(business_id, employee_id),
    UNIQUE(business_id, user_id)
);

-- 2. Staff availability and preferences
CREATE TABLE staff_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    
    -- Availability pattern
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT true,
    
    -- Preference settings
    preferred_shift_type VARCHAR(20) CHECK (preferred_shift_type IN ('morning', 'afternoon', 'evening', 'night')),
    max_hours_per_day INTEGER DEFAULT 8,
    
    -- Effective dates for temporary changes
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_until DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Shift templates for recurring schedules
CREATE TABLE shift_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Shift details
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER DEFAULT 30,
    department_id UUID REFERENCES departments(id),
    
    -- Staffing requirements
    required_staff_count INTEGER DEFAULT 1,
    required_skills TEXT[],
    
    -- Wage calculations
    is_premium_shift BOOLEAN DEFAULT false,
    premium_rate_multiplier DECIMAL(3,2) DEFAULT 1.0,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Shift roster assignments
CREATE TABLE shift_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    shift_template_id UUID REFERENCES shift_templates(id),
    
    -- Shift specifics
    shift_date DATE NOT NULL,
    actual_start_time TIME,
    actual_end_time TIME,
    shift_status VARCHAR(20) DEFAULT 'scheduled' CHECK (shift_status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    
    -- Staff assignment
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    
    -- Actuals (filled during/after shift)
    actual_hours_worked DECIMAL(4,2),
    break_taken_minutes INTEGER DEFAULT 0,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, shift_date, staff_profile_id)
);

-- 5. Time attendance clock events
CREATE TABLE clock_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    shift_roster_id UUID REFERENCES shift_rosters(id),
    
    -- Event details
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
    event_time TIMESTAMPTZ NOT NULL,
    
    -- Location verification
    gps_latitude DECIMAL(10,8),
    gps_longitude DECIMAL(11,8),
    location_verified BOOLEAN DEFAULT false,
    
    -- Device information
    device_id VARCHAR(100),
    ip_address INET,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Shift swap requests
CREATE TABLE shift_swap_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    original_shift_roster_id UUID NOT NULL REFERENCES shift_rosters(id) ON DELETE CASCADE,
    requesting_staff_id UUID NOT NULL REFERENCES staff_profiles(id),
    
    -- Swap details
    requested_staff_id UUID REFERENCES staff_profiles(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    
    -- Approval workflow
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Timesheet periods
CREATE TABLE timesheet_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    period_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    pay_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'processed')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, start_date, end_date)
);

-- 8. Timesheet entries
CREATE TABLE timesheet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    timesheet_period_id UUID NOT NULL REFERENCES timesheet_periods(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    
    -- Hours calculation
    regular_hours DECIMAL(5,2) DEFAULT 0,
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    break_hours DECIMAL(5,2) DEFAULT 0,
    
    -- Wage calculations
    regular_rate DECIMAL(10,2) NOT NULL,
    overtime_rate DECIMAL(10,2) NOT NULL,
    total_regular_pay DECIMAL(10,2) DEFAULT 0,
    total_overtime_pay DECIMAL(10,2) DEFAULT 0,
    total_pay DECIMAL(10,2) DEFAULT 0,
    
    -- Approval workflow
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'processed')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, timesheet_period_id, staff_profile_id)
);

-- 9. Payroll export configurations
CREATE TABLE payroll_export_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    export_format VARCHAR(20) NOT NULL CHECK (export_format IN ('csv', 'excel', 'quickbooks', 'xero')),
    
    -- Configuration
    config_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES (Following Week 9 Pattern)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE clock_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies using security context (following Week 9 pattern)
CREATE POLICY staff_profiles_business_isolation ON staff_profiles FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY staff_availability_business_isolation ON staff_availability FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY shift_templates_business_isolation ON shift_templates FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY shift_rosters_business_isolation ON shift_rosters FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY clock_events_business_isolation ON clock_events FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY shift_swap_requests_business_isolation ON shift_swap_requests FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY timesheet_periods_business_isolation ON timesheet_periods FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY timesheet_entries_business_isolation ON timesheet_entries FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY payroll_export_configs_business_isolation ON payroll_export_configs FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE (Following Week 9 Pattern)
-- ============================================================================

-- Staff Profiles Indexes
CREATE INDEX idx_staff_profiles_business_id ON staff_profiles(business_id);
CREATE INDEX idx_staff_profiles_user_id ON staff_profiles(user_id);
CREATE INDEX idx_staff_profiles_department_id ON staff_profiles(department_id);
CREATE INDEX idx_staff_profiles_employee_id ON staff_profiles(employee_id);
CREATE INDEX idx_staff_profiles_active ON staff_profiles(is_active);

-- Staff Availability Indexes
CREATE INDEX idx_staff_availability_staff_id ON staff_availability(staff_profile_id);
CREATE INDEX idx_staff_availability_day ON staff_availability(day_of_week);
CREATE INDEX idx_staff_availability_effective ON staff_availability(effective_from, effective_until);

-- Shift Templates Indexes
CREATE INDEX idx_shift_templates_business_id ON shift_templates(business_id);
CREATE INDEX idx_shift_templates_department_id ON shift_templates(department_id);
CREATE INDEX idx_shift_templates_active ON shift_templates(is_active);

-- Shift Rosters Indexes
CREATE INDEX idx_shift_rosters_business_id ON shift_rosters(business_id);
CREATE INDEX idx_shift_rosters_date_staff ON shift_rosters(shift_date, staff_profile_id);
CREATE INDEX idx_shift_rosters_template_id ON shift_rosters(shift_template_id);
CREATE INDEX idx_shift_rosters_status ON shift_rosters(shift_status);

-- Clock Events Indexes
CREATE INDEX idx_clock_events_staff_time ON clock_events(staff_profile_id, event_time);
CREATE INDEX idx_clock_events_roster_id ON clock_events(shift_roster_id);
CREATE INDEX idx_clock_events_type ON clock_events(event_type);

-- Shift Swap Requests Indexes
CREATE INDEX idx_shift_swap_requests_original_shift ON shift_swap_requests(original_shift_roster_id);
CREATE INDEX idx_shift_swap_requests_requesting_staff ON shift_swap_requests(requesting_staff_id);
CREATE INDEX idx_shift_swap_requests_status ON shift_swap_requests(status);

-- Timesheet Indexes
CREATE INDEX idx_timesheet_periods_business_id ON timesheet_periods(business_id);
CREATE INDEX idx_timesheet_periods_dates ON timesheet_periods(start_date, end_date);
CREATE INDEX idx_timesheet_entries_period_staff ON timesheet_entries(timesheet_period_id, staff_profile_id);
CREATE INDEX idx_timesheet_entries_status ON timesheet_entries(status);

-- ============================================================================
-- HELPER FUNCTIONS FOR WORKFORCE MANAGEMENT
-- ============================================================================

-- Function to clock in/out with validation
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
BEGIN
    -- Get business ID and verify staff exists
    SELECT business_id INTO v_business_id
    FROM staff_profiles WHERE id = p_staff_profile_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Staff profile not found', NULL;
        RETURN;
    END IF;

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

-- Function to calculate timesheet hours
CREATE OR REPLACE FUNCTION calculate_timesheet_hours(
    p_timesheet_period_id UUID,
    p_staff_profile_id UUID
) RETURNS TABLE(
    regular_hours DECIMAL(5,2),
    overtime_hours DECIMAL(5,2),
    break_hours DECIMAL(5,2),
    total_pay DECIMAL(10,2)
) AS $$
DECLARE
    v_staff_profile RECORD;
    v_weekly_hours DECIMAL(5,2) := 0;
    v_daily_hours DECIMAL(5,2);
    v_date DATE;
BEGIN
    -- Get staff profile with wage information
    SELECT * INTO v_staff_profile
    FROM staff_profiles
    WHERE id = p_staff_profile_id;

    -- Calculate hours from shift rosters for the period
    SELECT 
        COALESCE(SUM(
            CASE 
                WHEN sr.actual_hours_worked <= 8 THEN sr.actual_hours_worked
                ELSE 8
            END
        ), 0) as regular,
        COALESCE(SUM(
            CASE 
                WHEN sr.actual_hours_worked > 8 THEN sr.actual_hours_worked - 8
                ELSE 0
            END
        ), 0) as overtime,
        COALESCE(SUM(sr.break_taken_minutes::DECIMAL / 60), 0) as breaks
    INTO regular_hours, overtime_hours, break_hours
    FROM shift_rosters sr
    INNER JOIN timesheet_periods tp ON sr.shift_date BETWEEN tp.start_date AND tp.end_date
    WHERE sr.staff_profile_id = p_staff_profile_id
    AND tp.id = p_timesheet_period_id
    AND sr.shift_status = 'completed';

    -- Calculate total pay
    total_pay := (regular_hours * v_staff_profile.base_wage_rate) + 
                 (overtime_hours * COALESCE(v_staff_profile.overtime_rate, v_staff_profile.base_wage_rate * 1.5));

    RETURN QUERY SELECT 
        COALESCE(regular_hours, 0),
        COALESCE(overtime_hours, 0),
        COALESCE(break_hours, 0),
        COALESCE(total_pay, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to process shift swap approval
CREATE OR REPLACE FUNCTION process_shift_swap(
    p_swap_request_id UUID,
    p_approved_by UUID,
    p_approve BOOLEAN,
    p_rejection_reason TEXT DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_swap_request RECORD;
    v_new_roster_id UUID;
BEGIN
    -- Get swap request details
    SELECT * INTO v_swap_request
    FROM shift_swap_requests
    WHERE id = p_swap_request_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Shift swap request not found';
        RETURN;
    END IF;

    IF v_swap_request.status != 'pending' THEN
        RETURN QUERY SELECT false, 'Shift swap request already processed';
        RETURN;
    END IF;

    IF p_approve THEN
        -- Create new roster assignment for requested staff
        INSERT INTO shift_rosters (
            business_id, shift_template_id, shift_date,
            staff_profile_id, assigned_by, shift_status
        )
        SELECT 
            business_id, shift_template_id, shift_date,
            v_swap_request.requested_staff_id, p_approved_by, 'scheduled'
        FROM shift_rosters
        WHERE id = v_swap_request.original_shift_roster_id
        RETURNING id INTO v_new_roster_id;

        -- Update original roster status
        UPDATE shift_rosters 
        SET shift_status = 'cancelled', notes = COALESCE(notes, '') || ' Shift swapped to another staff member.'
        WHERE id = v_swap_request.original_shift_roster_id;

        -- Update swap request
        UPDATE shift_swap_requests
        SET status = 'approved', approved_by = p_approved_by, approved_at = NOW()
        WHERE id = p_swap_request_id;

        RETURN QUERY SELECT true, 'Shift swap approved successfully';
    ELSE
        -- Update swap request as rejected
        UPDATE shift_swap_requests
        SET status = 'rejected', approved_by = p_approved_by, approved_at = NOW(), rejection_reason = p_rejection_reason
        WHERE id = p_swap_request_id;

        RETURN QUERY SELECT true, 'Shift swap rejected';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERMISSIONS FOR WEEK 10 FEATURES (Following Week 9 Pattern)
-- ============================================================================

-- Add Workforce Management permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Staff Profiles Permissions
(NULL, 'staff_profiles:create', 'workforce', 'Create staff profiles', 'staff_profiles', 'create', true),
(NULL, 'staff_profiles:read', 'workforce', 'View staff profiles', 'staff_profiles', 'read', true),
(NULL, 'staff_profiles:update', 'workforce', 'Update staff profiles', 'staff_profiles', 'update', true),
(NULL, 'staff_profiles:delete', 'workforce', 'Delete staff profiles', 'staff_profiles', 'delete', true),

-- Staff Availability Permissions
(NULL, 'staff_availability:manage', 'workforce', 'Manage staff availability', 'staff_availability', 'manage', true),
(NULL, 'staff_availability:view', 'workforce', 'View staff availability', 'staff_availability', 'view', true),

-- Shift Management Permissions
(NULL, 'shifts:create', 'workforce', 'Create shifts and templates', 'shifts', 'create', true),
(NULL, 'shifts:read', 'workforce', 'View shifts and schedules', 'shifts', 'read', true),
(NULL, 'shifts:update', 'workforce', 'Update shifts and assignments', 'shifts', 'update', true),
(NULL, 'shifts:delete', 'workforce', 'Delete shifts and templates', 'shifts', 'delete', true),
(NULL, 'shifts:assign', 'workforce', 'Assign staff to shifts', 'shifts', 'assign', true),

-- Time & Attendance Permissions
(NULL, 'attendance:clock_in', 'workforce', 'Clock in for shifts', 'attendance', 'clock_in', true),
(NULL, 'attendance:clock_out', 'workforce', 'Clock out from shifts', 'attendance', 'clock_out', true),
(NULL, 'attendance:manage', 'workforce', 'Manage attendance records', 'attendance', 'manage', true),
(NULL, 'attendance:view', 'workforce', 'View attendance records', 'attendance', 'view', true),

-- Shift Swapping Permissions
(NULL, 'shift_swaps:request', 'workforce', 'Request shift swaps', 'shift_swaps', 'request', true),
(NULL, 'shift_swaps:approve', 'workforce', 'Approve/reject shift swaps', 'shift_swaps', 'approve', true),
(NULL, 'shift_swaps:view', 'workforce', 'View shift swap requests', 'shift_swaps', 'view', true),

-- Timesheets Permissions
(NULL, 'timesheets:create', 'workforce', 'Create timesheet periods', 'timesheets', 'create', true),
(NULL, 'timesheets:read', 'workforce', 'View timesheets', 'timesheets', 'read', true),
(NULL, 'timesheets:update', 'workforce', 'Update timesheet entries', 'timesheets', 'update', true),
(NULL, 'timesheets:approve', 'workforce', 'Approve timesheets', 'timesheets', 'approve', true),

-- Payroll Permissions
(NULL, 'payroll:calculate', 'workforce', 'Calculate payroll', 'payroll', 'calculate', true),
(NULL, 'payroll:export', 'workforce', 'Export payroll data', 'payroll', 'export', true),
(NULL, 'payroll:view', 'workforce', 'View payroll information', 'payroll', 'view', true),

-- Workforce Analytics Permissions
(NULL, 'workforce_analytics:view', 'workforce', 'View workforce analytics', 'workforce_analytics', 'view', true),
(NULL, 'workforce_analytics:export', 'workforce', 'Export workforce reports', 'workforce_analytics', 'export', true);

-- ============================================================================
-- UPDATE TRIGGERS (Following Week 9 Pattern)
-- ============================================================================

-- Create update triggers for tables with updated_at
CREATE TRIGGER update_staff_profiles_updated_at BEFORE UPDATE ON staff_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_staff_availability_updated_at BEFORE UPDATE ON staff_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shift_templates_updated_at BEFORE UPDATE ON shift_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shift_rosters_updated_at BEFORE UPDATE ON shift_rosters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shift_swap_requests_updated_at BEFORE UPDATE ON shift_swap_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheet_periods_updated_at BEFORE UPDATE ON timesheet_periods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheet_entries_updated_at BEFORE UPDATE ON timesheet_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payroll_export_configs_updated_at BEFORE UPDATE ON payroll_export_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
