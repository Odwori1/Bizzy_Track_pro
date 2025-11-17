-- 017_week16_security_audit_compliance.sql
-- WEEK 16: Security Audit & Compliance System

BEGIN;

-- =============================================================================
-- SECURITY AUDIT TABLES
-- =============================================================================

-- Security vulnerability scans
CREATE TABLE security_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    scan_type VARCHAR(100) NOT NULL, -- 'permission_audit', 'rls_verification', 'api_security'
    scan_name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    results JSONB, -- Scan findings and details
    vulnerabilities_found INTEGER DEFAULT 0,
    critical_issues INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,
    scanned_by UUID REFERENCES users(id),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Permission usage analytics
CREATE TABLE permission_usage_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    permission_name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    user_count INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    is_used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, permission_name)
);

-- Compliance framework templates
CREATE TABLE compliance_frameworks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    framework_name VARCHAR(100) NOT NULL, -- 'gdpr', 'hipaa', 'pci_dss', 'custom'
    version VARCHAR(50) NOT NULL,
    description TEXT,
    requirements JSONB NOT NULL, -- Framework requirements and controls
    is_active BOOLEAN DEFAULT true,
    applies_to_branches UUID[] DEFAULT '{}', -- Which branches this applies to
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance audit logs
CREATE TABLE compliance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    framework_id UUID NOT NULL REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
    requirement_id VARCHAR(100) NOT NULL, -- ID from the framework requirements
    status VARCHAR(50) NOT NULL, -- 'compliant', 'non_compliant', 'not_applicable'
    evidence JSONB, -- Evidence of compliance
    notes TEXT,
    audited_by UUID REFERENCES users(id),
    audited_at TIMESTAMPTZ DEFAULT NOW(),
    next_audit_due TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Security certification tracking
CREATE TABLE security_certifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    certification_name VARCHAR(255) NOT NULL,
    issuing_authority VARCHAR(255),
    certificate_id VARCHAR(100),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'expired', 'revoked'
    documents JSONB, -- Certificate documents and evidence
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automated security testing results
CREATE TABLE security_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    test_type VARCHAR(100) NOT NULL, -- 'penetration_test', 'vulnerability_scan', 'code_review'
    test_name VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL, -- 'critical', 'high', 'medium', 'low'
    description TEXT NOT NULL,
    vulnerability_details JSONB,
    remediation_steps TEXT,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
    assigned_to UUID REFERENCES users(id),
    due_date TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- AUDIT TRAIL VERIFICATION
-- =============================================================================

-- Audit trail integrity checks
CREATE TABLE audit_trail_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    verification_type VARCHAR(100) NOT NULL, -- 'integrity_check', 'tamper_detection'
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_records INTEGER DEFAULT 0,
    verified_records INTEGER DEFAULT 0,
    tampered_records INTEGER DEFAULT 0,
    verification_hash VARCHAR(64), -- SHA-256 hash of audit records
    status VARCHAR(50) DEFAULT 'pending',
    verified_by UUID REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- SECURITY DASHBOARD ANALYTICS
-- =============================================================================

-- Security metrics aggregation
CREATE TABLE security_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    metric_type VARCHAR(100) NOT NULL, -- 'login_attempts', 'permission_usage', 'audit_events'
    total_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(business_id, metric_date, metric_type)
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Security scans
CREATE INDEX idx_security_scans_business_id ON security_scans(business_id);
CREATE INDEX idx_security_scans_status ON security_scans(status);
CREATE INDEX idx_security_scans_created_at ON security_scans(created_at);

-- Permission analytics
CREATE INDEX idx_permission_analytics_business_id ON permission_usage_analytics(business_id);
CREATE INDEX idx_permission_analytics_permission ON permission_usage_analytics(permission_name);
CREATE INDEX idx_permission_analytics_used ON permission_usage_analytics(is_used);

-- Compliance frameworks
CREATE INDEX idx_compliance_frameworks_business_id ON compliance_frameworks(business_id);
CREATE INDEX idx_compliance_frameworks_active ON compliance_frameworks(is_active) WHERE is_active = true;

-- Compliance audit logs
CREATE INDEX idx_compliance_audit_business_id ON compliance_audit_logs(business_id);
CREATE INDEX idx_compliance_audit_framework_id ON compliance_audit_logs(framework_id);
CREATE INDEX idx_compliance_audit_status ON compliance_audit_logs(status);
CREATE INDEX idx_compliance_audit_audited_at ON compliance_audit_logs(audited_at);

-- Security certifications
CREATE INDEX idx_security_certifications_business_id ON security_certifications(business_id);
CREATE INDEX idx_security_certifications_status ON security_certifications(status);
CREATE INDEX idx_security_certifications_valid_until ON security_certifications(valid_until);

-- Security test results
CREATE INDEX idx_security_test_results_business_id ON security_test_results(business_id);
CREATE INDEX idx_security_test_results_severity ON security_test_results(severity);
CREATE INDEX idx_security_test_results_status ON security_test_results(status);

-- Audit trail verification
CREATE INDEX idx_audit_trail_verification_business_id ON audit_trail_verification(business_id);
CREATE INDEX idx_audit_trail_verification_period ON audit_trail_verification(period_start, period_end);

-- Security metrics
CREATE INDEX idx_security_metrics_business_id ON security_metrics(business_id);
CREATE INDEX idx_security_metrics_date ON security_metrics(metric_date);
CREATE INDEX idx_security_metrics_type ON security_metrics(metric_type);

-- =============================================================================
-- ROW LEVEL SECURITY ENABLEMENT
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_usage_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_metrics ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for all new tables
CREATE POLICY business_isolation_security_scans ON security_scans
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_permission_analytics ON permission_usage_analytics
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_compliance_frameworks ON compliance_frameworks
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_compliance_audit_logs ON compliance_audit_logs
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_security_certifications ON security_certifications
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_security_test_results ON security_test_results
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_audit_trail_verification ON audit_trail_verification
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY business_isolation_security_metrics ON security_metrics
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- =============================================================================
-- WEEK 16 PERMISSIONS
-- =============================================================================

-- Add Security Audit & Compliance permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Security audit permissions
(NULL, 'security_audit:view', 'security_compliance', 'View security audit reports', 'security_audit', 'view', true),
(NULL, 'security_audit:manage', 'security_compliance', 'Manage security audits and scans', 'security_audit', 'manage', true),
(NULL, 'security_audit:run', 'security_compliance', 'Run security scans and tests', 'security_audit', 'run', true),

-- Compliance management permissions
(NULL, 'compliance:view', 'security_compliance', 'View compliance frameworks and reports', 'compliance', 'view', true),
(NULL, 'compliance:manage', 'security_compliance', 'Manage compliance frameworks', 'compliance', 'manage', true),
(NULL, 'compliance:audit', 'security_compliance', 'Perform compliance audits', 'compliance', 'audit', true),

-- Security analytics permissions
(NULL, 'security_analytics:view', 'security_compliance', 'View security analytics and metrics', 'security_analytics', 'view', true),

-- Certification management permissions
(NULL, 'certifications:view', 'security_compliance', 'View security certifications', 'certifications', 'view', true),
(NULL, 'certifications:manage', 'security_compliance', 'Manage security certifications', 'certifications', 'manage', true);

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE TRIGGER update_security_scans_updated_at
    BEFORE UPDATE ON security_scans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permission_usage_analytics_updated_at
    BEFORE UPDATE ON permission_usage_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compliance_frameworks_updated_at
    BEFORE UPDATE ON compliance_frameworks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_certifications_updated_at
    BEFORE UPDATE ON security_certifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_test_results_updated_at
    BEFORE UPDATE ON security_test_results
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
