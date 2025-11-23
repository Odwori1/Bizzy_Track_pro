-- ============================================================================
-- WEEK 6: ENHANCED JOB PACKAGE SUPPORT
-- ============================================================================

-- Check if columns already exist before adding them
DO $$ 
BEGIN
    -- Add is_package_job column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'jobs' AND column_name = 'is_package_job') THEN
        ALTER TABLE jobs ADD COLUMN is_package_job BOOLEAN DEFAULT false;
    END IF;

    -- Add package_configuration column if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'jobs' AND column_name = 'package_configuration') THEN
        ALTER TABLE jobs ADD COLUMN package_configuration JSONB;
    END IF;
END $$;

-- ============================================================================
-- RLS POLICIES FOR EXISTING TABLES (IF NOT ALREADY CREATED)
-- ============================================================================

-- Enable RLS on job_services if not already enabled
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'job_services' AND rowsecurity = true) THEN
        ALTER TABLE job_services ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'job_service_status_history' AND rowsecurity = true) THEN
        ALTER TABLE job_service_status_history ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- Create RLS policies only if they don't exist
DO $$ 
BEGIN
    -- Check if job_services policy exists
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'job_services_business_isolation') THEN
        CREATE POLICY job_services_business_isolation ON job_services FOR ALL USING (
            job_id IN (SELECT id FROM jobs WHERE business_id = current_setting('app.current_business_id')::UUID)
        );
    END IF;

    -- Check if job_service_history policy exists
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'job_service_history_business_isolation') THEN
        CREATE POLICY job_service_history_business_isolation ON job_service_status_history FOR ALL USING (
            job_service_id IN (
                SELECT js.id FROM job_services js 
                JOIN jobs j ON js.job_id = j.id 
                WHERE j.business_id = current_setting('app.current_business_id')::UUID
            )
        );
    END IF;
END $$;

-- ============================================================================
-- PERMISSIONS FOR PACKAGE JOB MANAGEMENT
-- ============================================================================

-- Add package job permissions to system permissions following existing pattern
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
SELECT 
    NULL, 
    name, 
    category, 
    description, 
    resource_type, 
    action, 
    true
FROM (VALUES
    ('job:package:create', 'job', 'Create jobs from packages', 'job', 'package_create'),
    ('job:package:deconstruct', 'job', 'Deconstruct packages into jobs', 'job', 'package_deconstruct'),
    ('job:service:manage', 'job', 'Manage job services in package jobs', 'job', 'service_manage')
) AS new_perms(name, category, description, resource_type, action)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = new_perms.name);

-- ============================================================================
-- INDEXES FOR PERFORMANCE - FOLLOWING EXISTING PATTERNS
-- ============================================================================

-- Index for package jobs (only create if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_jobs_is_package_job ON jobs(is_package_job) WHERE is_package_job = true;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
