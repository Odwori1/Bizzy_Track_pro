-- ============================================================================
-- WEEK 9: DEPARTMENT COORDINATION MIGRATION - FIXED VERSION
-- ============================================================================

-- 1. Departments table WITHOUT the self-referencing constraint initially
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Department Information
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL, -- Department code like "SALES", "SERVICE"
    description TEXT,
    
    -- Hierarchy Support (will add constraint later)
    parent_department_id UUID,
    
    -- Department Configuration
    cost_center_code VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    department_type VARCHAR(100) NOT NULL, -- "sales", "service", "admin", "production"
    color_hex VARCHAR(7), -- For UI coloring
    sort_order INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint per business
    UNIQUE(business_id, code)
);

-- 2. Now add the self-referencing foreign key constraint
ALTER TABLE departments 
ADD CONSTRAINT fk_department_same_business 
FOREIGN KEY (business_id, parent_department_id) 
REFERENCES departments(business_id, id);

-- 3. Department roles and permission templates
CREATE TABLE department_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    -- Role Information
    name VARCHAR(255) NOT NULL, -- "Department Manager", "Technician", "Sales Rep"
    description TEXT,
    is_template BOOLEAN DEFAULT true,
    
    -- Role Configuration
    base_role_id UUID REFERENCES roles(id) ON DELETE SET NULL, -- Links to core RBAC roles
    permissions_template JSONB, -- Stores permission sets for this department role

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, department_id, name)
);

-- 4. Job department assignments and workflow states
CREATE TABLE job_department_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    -- Assignment Information
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_to UUID REFERENCES users(id), -- Specific user if assigned
    assignment_type VARCHAR(50) NOT NULL, -- "primary", "collaboration", "review"
    status VARCHAR(50) NOT NULL DEFAULT 'assigned', -- assigned, in_progress, completed, blocked
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, urgent
    
    -- Time Tracking
    estimated_hours DECIMAL(10,2),
    actual_hours DECIMAL(10,2),
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    
    -- Additional Details
    notes TEXT,
    sla_deadline TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(job_id, department_id, assignment_type) -- Prevent duplicate assignments
);

-- 5. Department workflow states and handoffs
CREATE TABLE department_workflow_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    from_department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    to_department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    -- Handoff Information
    handoff_by UUID NOT NULL REFERENCES users(id),
    handoff_to UUID REFERENCES users(id),
    handoff_notes TEXT,
    handoff_status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, rejected
    required_actions JSONB, -- Specific actions needed by next department
    
    -- Timestamps
    handoff_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Department-specific billing rules and cost allocation
CREATE TABLE department_billing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    -- Billing Configuration
    billing_type VARCHAR(100) NOT NULL, -- "hourly_rate", "fixed_fee", "percentage", "cost_plus"
    rate DECIMAL(15,4), -- Hourly rate or fixed amount
    percentage DECIMAL(5,2), -- Percentage for percentage-based billing
    markup_percentage DECIMAL(5,2), -- For cost-plus billing
    
    -- Application Rules
    is_active BOOLEAN DEFAULT true,
    applies_to_services BOOLEAN DEFAULT true,
    applies_to_products BOOLEAN DEFAULT false,
    applies_to_materials BOOLEAN DEFAULT false,
    
    -- Limits
    minimum_charge DECIMAL(15,4),
    maximum_charge DECIMAL(15,4),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, department_id, billing_type)
);

-- 7. Consolidated department billing entries
CREATE TABLE department_billing_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    -- Billing Information
    invoice_id UUID REFERENCES invoices(id),
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) DEFAULT 1,
    unit_price DECIMAL(15,4) NOT NULL,
    total_amount DECIMAL(15,4) NOT NULL,
    billing_type VARCHAR(100) NOT NULL,
    cost_amount DECIMAL(15,4), -- Internal cost for profit calculation
    is_billable BOOLEAN DEFAULT true,
    billing_date DATE NOT NULL,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Department performance metrics
CREATE TABLE department_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    -- Metrics Date
    metric_date DATE NOT NULL,
    
    -- Job Metrics
    total_jobs_assigned INTEGER DEFAULT 0,
    total_jobs_completed INTEGER DEFAULT 0,
    average_completion_time_hours DECIMAL(10,2),
    on_time_completion_rate DECIMAL(5,2),
    
    -- Financial Metrics
    total_billable_amount DECIMAL(15,4) DEFAULT 0,
    total_cost_amount DECIMAL(15,4) DEFAULT 0,
    department_efficiency DECIMAL(5,2),
    
    -- Staff Metrics
    employee_utilization DECIMAL(5,2),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, department_id, metric_date)
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES (Following Week 8 Pattern)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_department_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_workflow_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_billing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_billing_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies using security context (following Week 8 pattern)
CREATE POLICY departments_business_isolation ON departments FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY department_roles_business_isolation ON department_roles FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY job_department_assignments_business_isolation ON job_department_assignments FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY department_workflow_states_business_isolation ON department_workflow_states FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY department_billing_rules_business_isolation ON department_billing_rules FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY department_billing_entries_business_isolation ON department_billing_entries FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY department_performance_metrics_business_isolation ON department_performance_metrics FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE (Following Week 8 Pattern)
-- ============================================================================

-- Departments Indexes
CREATE INDEX idx_departments_business_id ON departments(business_id);
CREATE INDEX idx_departments_parent_id ON departments(parent_department_id);
CREATE INDEX idx_departments_type ON departments(department_type);
CREATE INDEX idx_departments_active ON departments(is_active);

-- Department Roles Indexes
CREATE INDEX idx_department_roles_business_id ON department_roles(business_id);
CREATE INDEX idx_department_roles_department_id ON department_roles(department_id);
CREATE INDEX idx_department_roles_base_role ON department_roles(base_role_id);

-- Job Department Assignments Indexes
CREATE INDEX idx_job_department_assignments_job_id ON job_department_assignments(job_id);
CREATE INDEX idx_job_department_assignments_dept_id ON job_department_assignments(department_id);
CREATE INDEX idx_job_department_assignments_assigned_to ON job_department_assignments(assigned_to);
CREATE INDEX idx_job_department_assignments_status ON job_department_assignments(status);
CREATE INDEX idx_job_department_assignments_priority ON job_department_assignments(priority);

-- Department Workflow States Indexes
CREATE INDEX idx_department_workflow_states_job_id ON department_workflow_states(job_id);
CREATE INDEX idx_department_workflow_states_from_dept ON department_workflow_states(from_department_id);
CREATE INDEX idx_department_workflow_states_to_dept ON department_workflow_states(to_department_id);
CREATE INDEX idx_department_workflow_states_status ON department_workflow_states(handoff_status);

-- Department Billing Indexes
CREATE INDEX idx_department_billing_entries_job_id ON department_billing_entries(job_id);
CREATE INDEX idx_department_billing_entries_invoice_id ON department_billing_entries(invoice_id);
CREATE INDEX idx_department_billing_entries_dept_id ON department_billing_entries(department_id);
CREATE INDEX idx_department_billing_entries_date ON department_billing_entries(billing_date);

-- Performance Metrics Indexes
CREATE INDEX idx_department_performance_metrics_date ON department_performance_metrics(metric_date);
CREATE INDEX idx_department_performance_metrics_dept ON department_performance_metrics(department_id);

-- ============================================================================
-- HELPER FUNCTIONS FOR DEPARTMENT COORDINATION
-- ============================================================================

-- Function to assign job to department with intelligent routing
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

    -- Update job status if needed
    IF v_job_status = 'pending' THEN
        UPDATE jobs SET status = 'assigned' WHERE id = p_job_id;
    END IF;

    RETURN QUERY SELECT true, 'Job successfully assigned to department';
END;
$$ LANGUAGE plpgsql;

-- Function to process department handoff
CREATE OR REPLACE FUNCTION process_department_handoff(
    p_job_id UUID,
    p_from_department_id UUID,
    p_to_department_id UUID,
    p_handoff_by UUID,
    p_handoff_notes TEXT DEFAULT NULL,
    p_required_actions JSONB DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
    v_business_id UUID;
    v_assignment_exists BOOLEAN;
BEGIN
    -- Get business ID
    SELECT business_id INTO v_business_id
    FROM jobs WHERE id = p_job_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Job not found';
        RETURN;
    END IF;

    -- Verify both departments exist in same business
    IF NOT EXISTS(
        SELECT 1 FROM departments 
        WHERE id IN (p_from_department_id, p_to_department_id) 
        AND business_id = v_business_id
        HAVING COUNT(DISTINCT id) = 2
    ) THEN
        RETURN QUERY SELECT false, 'One or both departments not found or access denied';
        RETURN;
    END IF;

    -- Verify the job is currently assigned to the from_department
    SELECT EXISTS(
        SELECT 1 FROM job_department_assignments
        WHERE job_id = p_job_id 
        AND department_id = p_from_department_id
        AND status IN ('assigned', 'in_progress')
    ) INTO v_assignment_exists;

    IF NOT v_assignment_exists THEN
        RETURN QUERY SELECT false, 'Job is not currently assigned to the source department';
        RETURN;
    END IF;

    -- Create workflow state record
    INSERT INTO department_workflow_states (
        business_id, job_id, from_department_id, to_department_id,
        handoff_by, handoff_notes, required_actions, handoff_status
    ) VALUES (
        v_business_id, p_job_id, p_from_department_id, p_to_department_id,
        p_handoff_by, p_handoff_notes, p_required_actions, 'pending'
    );

    -- Update current assignment status to completed
    UPDATE job_department_assignments
    SET status = 'completed', actual_end = NOW()
    WHERE job_id = p_job_id 
    AND department_id = p_from_department_id
    AND status IN ('assigned', 'in_progress');

    RETURN QUERY SELECT true, 'Department handoff processed successfully';
END;
$$ LANGUAGE plpgsql;

-- Function to calculate department performance metrics
CREATE OR REPLACE FUNCTION calculate_department_metrics(
    p_business_id UUID,
    p_department_id UUID,
    p_metric_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    total_jobs_assigned INTEGER,
    total_jobs_completed INTEGER,
    average_completion_time_hours DECIMAL(10,2),
    on_time_completion_rate DECIMAL(5,2),
    total_billable_amount DECIMAL(15,4),
    total_cost_amount DECIMAL(15,4),
    department_efficiency DECIMAL(5,2),
    employee_utilization DECIMAL(5,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH job_metrics AS (
        SELECT
            COUNT(*) as total_assigned,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_completed,
            AVG(
                EXTRACT(EPOCH FROM (actual_end - actual_start)) / 3600
            ) as avg_completion_hours,
            AVG(
                CASE 
                    WHEN actual_end <= sla_deadline THEN 1.0
                    ELSE 0.0
                END
            ) * 100 as on_time_rate
        FROM job_department_assignments
        WHERE business_id = p_business_id
        AND department_id = p_department_id
        AND DATE(created_at) = p_metric_date
    ),
    financial_metrics AS (
        SELECT
            COALESCE(SUM(total_amount), 0) as total_billable,
            COALESCE(SUM(cost_amount), 0) as total_cost,
            CASE 
                WHEN COALESCE(SUM(total_amount), 0) > 0 THEN
                    (COALESCE(SUM(total_amount), 0) - COALESCE(SUM(cost_amount), 0)) / COALESCE(SUM(total_amount), 1) * 100
                ELSE 0
            END as efficiency
        FROM department_billing_entries
        WHERE business_id = p_business_id
        AND department_id = p_department_id
        AND billing_date = p_metric_date
        AND is_billable = true
    ),
    utilization_metrics AS (
        SELECT
            CASE 
                WHEN SUM(estimated_hours) > 0 THEN
                    (SUM(COALESCE(actual_hours, 0)) / SUM(estimated_hours)) * 100
                ELSE 0
            END as utilization
        FROM job_department_assignments
        WHERE business_id = p_business_id
        AND department_id = p_department_id
        AND DATE(created_at) = p_metric_date
    )
    SELECT
        jm.total_assigned::INTEGER,
        jm.total_completed::INTEGER,
        COALESCE(jm.avg_completion_hours, 0)::DECIMAL(10,2),
        COALESCE(jm.on_time_rate, 0)::DECIMAL(5,2),
        fm.total_billable::DECIMAL(15,4),
        fm.total_cost::DECIMAL(15,4),
        fm.efficiency::DECIMAL(5,2),
        um.utilization::DECIMAL(5,2)
    FROM job_metrics jm
    CROSS JOIN financial_metrics fm
    CROSS JOIN utilization_metrics um;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERMISSIONS FOR WEEK 9 FEATURES (Following Week 8 Pattern)
-- ============================================================================

-- Add Department Coordination permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Department Management Permissions
(NULL, 'departments:create', 'departments', 'Create new departments', 'departments', 'create', true),
(NULL, 'departments:read', 'departments', 'View departments', 'departments', 'read', true),
(NULL, 'departments:update', 'departments', 'Update departments', 'departments', 'update', true),
(NULL, 'departments:delete', 'departments', 'Delete departments', 'departments', 'delete', true),
(NULL, 'departments:manage_hierarchy', 'departments', 'Manage department hierarchy', 'departments', 'manage', true),

-- Department Roles Permissions
(NULL, 'department_roles:create', 'department_roles', 'Create department roles', 'department_roles', 'create', true),
(NULL, 'department_roles:read', 'department_roles', 'View department roles', 'department_roles', 'read', true),
(NULL, 'department_roles:update', 'department_roles', 'Update department roles', 'department_roles', 'update', true),
(NULL, 'department_roles:delete', 'department_roles', 'Delete department roles', 'department_roles', 'delete', true),
(NULL, 'department_roles:assign', 'department_roles', 'Assign roles to department users', 'department_roles', 'assign', true),

-- Job Assignment Permissions
(NULL, 'job_assignments:create', 'job_assignments', 'Assign jobs to departments', 'job_assignments', 'create', true),
(NULL, 'job_assignments:read', 'job_assignments', 'View job assignments', 'job_assignments', 'read', true),
(NULL, 'job_assignments:update', 'job_assignments', 'Update job assignments', 'job_assignments', 'update', true),
(NULL, 'job_assignments:reassign', 'job_assignments', 'Reassign jobs between departments', 'job_assignments', 'reassign', true),

-- Workflow Management Permissions
(NULL, 'workflow:manage', 'workflow', 'Manage department workflows', 'workflow', 'manage', true),
(NULL, 'workflow:handoff', 'workflow', 'Perform department handoffs', 'workflow', 'handoff', true),
(NULL, 'workflow:accept', 'workflow', 'Accept workflow handoffs', 'workflow', 'accept', true),
(NULL, 'workflow:escalate', 'workflow', 'Escalate workflow issues', 'workflow', 'escalate', true),

-- Department Billing Permissions
(NULL, 'department_billing:create', 'department_billing', 'Create department billing entries', 'department_billing', 'create', true),
(NULL, 'department_billing:read', 'department_billing', 'View department billing', 'department_billing', 'read', true),
(NULL, 'department_billing:update', 'department_billing', 'Update department billing', 'department_billing', 'update', true),
(NULL, 'department_billing:approve', 'department_billing', 'Approve department billing', 'department_billing', 'approve', true),

-- Department Analytics Permissions
(NULL, 'department_analytics:view', 'department_analytics', 'View department performance analytics', 'department_analytics', 'view', true),
(NULL, 'department_analytics:export', 'department_analytics', 'Export department reports', 'department_analytics', 'export', true),

-- Cross-Department Collaboration Permissions
(NULL, 'cross_department:collaborate', 'cross_department', 'Collaborate across departments', 'cross_department', 'collaborate', true),
(NULL, 'cross_department:view_all', 'cross_department', 'View all department data', 'cross_department', 'view_all', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- UPDATE TRIGGERS (Following Week 8 Pattern)
-- ============================================================================

-- Create update triggers for tables with updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_department_roles_updated_at BEFORE UPDATE ON department_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_department_assignments_updated_at BEFORE UPDATE ON job_department_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_department_billing_rules_updated_at BEFORE UPDATE ON department_billing_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_department_performance_metrics_updated_at BEFORE UPDATE ON department_performance_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETION
-- ============================================================================

-- Update migration tracking
INSERT INTO migrations (name, executed_at) 
VALUES ('010_week9_department_coordination', NOW())
ON CONFLICT (name) DO UPDATE SET executed_at = NOW();
