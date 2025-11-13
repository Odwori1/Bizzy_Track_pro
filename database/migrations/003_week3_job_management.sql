-- ============================================================================
-- WEEK 3: JOB MANAGEMENT CORE
-- ============================================================================

-- Jobs table for tracking service jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Job basic info
    job_number VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    
    -- Customer and service assignment
    customer_id UUID REFERENCES customers(id),
    service_id UUID REFERENCES services(id),
    
    -- Job details
    scheduled_date TIMESTAMPTZ,
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    
    -- Pricing
    base_price DECIMAL(10,2) NOT NULL,
    final_price DECIMAL(10,2),
    discount_amount DECIMAL(10,2) DEFAULT 0,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    
    -- Assignment
    assigned_to UUID REFERENCES users(id),
    
    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job status history for audit trail
CREATE TABLE job_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    changed_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_business_isolation ON jobs FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY job_history_business_isolation ON job_status_history FOR ALL USING (
    job_id IN (SELECT id FROM jobs WHERE business_id = current_setting('app.current_business_id')::UUID)
);

-- ============================================================================
-- PERMISSIONS FOR JOB MANAGEMENT
-- ============================================================================

-- Add job permissions to system permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Job permissions
(NULL, 'job:create', 'job', 'Create new jobs', 'job', 'create', true),
(NULL, 'job:read', 'job', 'View jobs', 'job', 'read', true),
(NULL, 'job:update', 'job', 'Update job details', 'job', 'update', true),
(NULL, 'job:delete', 'job', 'Delete jobs', 'job', 'delete', true),
(NULL, 'job:assign', 'job', 'Assign jobs to staff', 'job', 'assign', true),
(NULL, 'job:status:update', 'job', 'Update job status', 'job', 'status_update', true);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_jobs_business_status ON jobs(business_id, status);
CREATE INDEX idx_jobs_customer_id ON jobs(customer_id);
CREATE INDEX idx_jobs_assigned_to ON jobs(assigned_to);
CREATE INDEX idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX idx_job_history_job_id ON job_status_history(job_id);

-- ============================================================================
-- ADD PERMISSION MANAGEMENT PERMISSION
-- ============================================================================

-- Add permission management permission to system permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
(NULL, 'permission:manage', 'security', 'Manage user permissions and feature toggles', 'permission', 'manage', true);
