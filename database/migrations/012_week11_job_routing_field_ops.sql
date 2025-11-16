-- Migration: 012_week11_job_routing_field_ops.sql
-- Description: Job Routing & Field Operations System

BEGIN;

-- =============================================================================
-- JOB ROUTING & SLA CONFIGURATION TABLES
-- =============================================================================

-- SLA Configuration Table
CREATE TABLE sla_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    service_type_id UUID REFERENCES services(id) ON DELETE SET NULL,
    priority_level VARCHAR(50) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    response_time_minutes INTEGER NOT NULL, -- Time to first response
    resolution_time_minutes INTEGER NOT NULL, -- Time to complete job
    escalation_rules JSONB NOT NULL DEFAULT '{}', -- JSON configuration for escalations
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Job Routing Rules Table
CREATE TABLE job_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL, -- Rules for auto-assignment
    target_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    required_skills JSONB, -- Skills required for this job type
    priority_boost INTEGER DEFAULT 0, -- Priority adjustment
    max_jobs_per_day INTEGER, -- Load balancing
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- FIELD OPERATIONS TABLES
-- =============================================================================

-- Field Checklists Template
CREATE TABLE field_checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    service_type_id UUID REFERENCES services(id) ON DELETE SET NULL,
    items JSONB NOT NULL, -- Array of checklist items
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Field Job Assignments (extends existing jobs)
CREATE TABLE field_job_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    assigned_by UUID NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'assigned', -- assigned, in_progress, completed, cancelled
    completion_notes TEXT,
    customer_feedback TEXT,
    customer_rating INTEGER CHECK (customer_rating >= 1 AND customer_rating <= 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GPS Location Tracking
CREATE TABLE location_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    field_job_assignment_id UUID REFERENCES field_job_assignments(id) ON DELETE SET NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(5, 2), -- Accuracy in meters
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    device_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Digital Signatures & Proof of Delivery
CREATE TABLE digital_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    field_job_assignment_id UUID NOT NULL REFERENCES field_job_assignments(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    signature_data TEXT NOT NULL, -- Base64 encoded signature
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address INET,
    device_info JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Proof of Delivery Documents
CREATE TABLE proof_of_delivery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    field_job_assignment_id UUID NOT NULL REFERENCES field_job_assignments(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL, -- photo, video, document, etc.
    file_path VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- OFFLINE SYNC TABLES
-- =============================================================================

-- Offline Sync Queue
CREATE TABLE offline_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(50) NOT NULL, -- create, update, delete
    data JSONB NOT NULL,
    sync_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, synced, error
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mobile Device Registration
CREATE TABLE mobile_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    staff_profile_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL UNIQUE,
    device_type VARCHAR(100), -- ios, android, etc.
    app_version VARCHAR(50),
    last_sync_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SLA MONITORING TABLES
-- =============================================================================

-- SLA Violation Logs
CREATE TABLE sla_violation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    sla_configuration_id UUID NOT NULL REFERENCES sla_configurations(id) ON DELETE CASCADE,
    violation_type VARCHAR(100) NOT NULL, -- response_time, resolution_time
    expected_time TIMESTAMPTZ NOT NULL,
    actual_time TIMESTAMPTZ,
    violation_minutes INTEGER NOT NULL,
    escalated_to UUID REFERENCES users(id),
    escalation_level INTEGER DEFAULT 1,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- SLA Configurations
CREATE INDEX idx_sla_configurations_business_id ON sla_configurations(business_id);
CREATE INDEX idx_sla_configurations_service_type ON sla_configurations(service_type_id);
CREATE INDEX idx_sla_configurations_active ON sla_configurations(is_active) WHERE is_active = true;

-- Job Routing Rules
CREATE INDEX idx_job_routing_rules_business_id ON job_routing_rules(business_id);
CREATE INDEX idx_job_routing_rules_active ON job_routing_rules(is_active) WHERE is_active = true;

-- Field Job Assignments
CREATE INDEX idx_field_job_assignments_business_id ON field_job_assignments(business_id);
CREATE INDEX idx_field_job_assignments_job_id ON field_job_assignments(job_id);
CREATE INDEX idx_field_job_assignments_staff_id ON field_job_assignments(staff_profile_id);
CREATE INDEX idx_field_job_assignments_status ON field_job_assignments(status);

-- Location Tracking
CREATE INDEX idx_location_tracking_business_id ON location_tracking(business_id);
CREATE INDEX idx_location_tracking_staff_id ON location_tracking(staff_profile_id);
CREATE INDEX idx_location_tracking_timestamp ON location_tracking(timestamp);

-- Digital Signatures
CREATE INDEX idx_digital_signatures_business_id ON digital_signatures(business_id);
CREATE INDEX idx_digital_signatures_assignment_id ON digital_signatures(field_job_assignment_id);

-- Offline Sync
CREATE INDEX idx_offline_sync_queue_business_id ON offline_sync_queue(business_id);
CREATE INDEX idx_offline_sync_queue_staff_id ON offline_sync_queue(staff_profile_id);
CREATE INDEX idx_offline_sync_queue_status ON offline_sync_queue(sync_status);

-- Mobile Devices
CREATE INDEX idx_mobile_devices_business_id ON mobile_devices(business_id);
CREATE INDEX idx_mobile_devices_staff_id ON mobile_devices(staff_profile_id);
CREATE INDEX idx_mobile_devices_device_id ON mobile_devices(device_id);

-- SLA Violations
CREATE INDEX idx_sla_violations_business_id ON sla_violation_logs(business_id);
CREATE INDEX idx_sla_violations_job_id ON sla_violation_logs(job_id);
CREATE INDEX idx_sla_violations_created_at ON sla_violation_logs(created_at);

-- =============================================================================
-- ROW LEVEL SECURITY ENABLEMENT
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE sla_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_of_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_violation_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for all new tables
CREATE POLICY business_isolation_sla_configurations ON sla_configurations
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_job_routing_rules ON job_routing_rules
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_field_checklist_templates ON field_checklist_templates
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_field_job_assignments ON field_job_assignments
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_location_tracking ON location_tracking
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_digital_signatures ON digital_signatures
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_proof_of_delivery ON proof_of_delivery
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_offline_sync_queue ON offline_sync_queue
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_mobile_devices ON mobile_devices
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_sla_violation_logs ON sla_violation_logs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- =============================================================================
-- WEEK 11 PERMISSIONS (Added directly to migration following Week 10 pattern)
-- =============================================================================

-- Add Job Routing & Field Operations permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Job Routing Permissions
(NULL, 'job_routing:configure', 'job_routing', 'Configure job routing rules', 'job_routing', 'configure', true),
(NULL, 'job_routing:view', 'job_routing', 'View job routing rules', 'job_routing', 'view', true),
(NULL, 'job_routing:override', 'job_routing', 'Override automatic job routing', 'job_routing', 'override', true),

-- SLA Management Permissions
(NULL, 'sla:manage', 'sla', 'Manage SLA configurations', 'sla', 'manage', true),
(NULL, 'sla:view', 'sla', 'View SLA configurations and violations', 'sla', 'view', true),
(NULL, 'sla:escalate', 'sla', 'Escalate SLA violations', 'sla', 'escalate', true),

-- Field Operations Permissions
(NULL, 'field_ops:manage', 'field_operations', 'Manage field operations', 'field_operations', 'manage', true),
(NULL, 'field_ops:view', 'field_operations', 'View field operations', 'field_operations', 'view', true),
(NULL, 'field_ops:mobile_access', 'field_operations', 'Access mobile field operations', 'field_operations', 'mobile_access', true),

-- Location Tracking Permissions
(NULL, 'location:track', 'location', 'Track staff locations', 'location', 'track', true),
(NULL, 'location:view', 'location', 'View location history', 'location', 'view', true),

-- Digital Signature Permissions
(NULL, 'digital_signatures:capture', 'digital_signatures', 'Capture digital signatures', 'digital_signatures', 'capture', true),
(NULL, 'digital_signatures:verify', 'digital_signatures', 'Verify digital signatures', 'digital_signatures', 'verify', true),

-- Offline Sync Permissions
(NULL, 'offline_sync:manage', 'offline_sync', 'Manage offline sync', 'offline_sync', 'manage', true),
(NULL, 'offline_sync:view', 'offline_sync', 'View sync status', 'offline_sync', 'view', true);

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_sla_configurations_updated_at
    BEFORE UPDATE ON sla_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_routing_rules_updated_at
    BEFORE UPDATE ON job_routing_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_checklist_templates_updated_at
    BEFORE UPDATE ON field_checklist_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_field_job_assignments_updated_at
    BEFORE UPDATE ON field_job_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offline_sync_queue_updated_at
    BEFORE UPDATE ON offline_sync_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mobile_devices_updated_at
    BEFORE UPDATE ON mobile_devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
