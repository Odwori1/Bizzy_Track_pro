-- 016_week15_multi_location_security.sql
-- WEEK 15: Multi-Location Security System

BEGIN;

-- Business branches/locations table
CREATE TABLE business_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'US',
    postal_code VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(255),
    manager_id UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    timezone VARCHAR(50) DEFAULT 'UTC',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_branch_code UNIQUE(business_id, code)
);

-- Branch-specific permission sets
CREATE TABLE branch_permission_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES business_branches(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_branch_permission_set UNIQUE(business_id, branch_id, name)
);

-- Cross-branch access control rules
CREATE TABLE cross_branch_access_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    from_branch_id UUID NOT NULL REFERENCES business_branches(id) ON DELETE CASCADE,
    to_branch_id UUID NOT NULL REFERENCES business_branches(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL, -- 'view', 'edit', 'transfer', 'manage'
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_cross_branch_rule UNIQUE(business_id, from_branch_id, to_branch_id, access_type),
    CONSTRAINT no_self_access CHECK (from_branch_id != to_branch_id)
);

-- User branch assignments
CREATE TABLE user_branch_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES business_branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    assigned_permissions JSONB DEFAULT '[]',
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_user_branch_assignment UNIQUE(business_id, user_id, branch_id)
);

-- Multi-location audit trails
CREATE TABLE multi_location_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES business_branches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all new tables
ALTER TABLE business_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_permission_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_branch_access_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_location_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for business isolation
CREATE POLICY business_branches_isolation_policy ON business_branches 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY branch_permission_sets_isolation_policy ON branch_permission_sets 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY cross_branch_access_rules_isolation_policy ON cross_branch_access_rules 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY user_branch_assignments_isolation_policy ON user_branch_assignments 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

CREATE POLICY multi_location_audit_logs_isolation_policy ON multi_location_audit_logs 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- Create indexes for performance
CREATE INDEX idx_business_branches_business_id ON business_branches(business_id);
CREATE INDEX idx_branch_permission_sets_branch_id ON branch_permission_sets(branch_id);
CREATE INDEX idx_cross_branch_access_rules_from_branch ON cross_branch_access_rules(from_branch_id);
CREATE INDEX idx_cross_branch_access_rules_to_branch ON cross_branch_access_rules(to_branch_id);
CREATE INDEX idx_user_branch_assignments_user_id ON user_branch_assignments(user_id);
CREATE INDEX idx_user_branch_assignments_branch_id ON user_branch_assignments(branch_id);
CREATE INDEX idx_multi_location_audit_logs_branch_id ON multi_location_audit_logs(branch_id);
CREATE INDEX idx_multi_location_audit_logs_created_at ON multi_location_audit_logs(created_at);

-- Add Week 15 permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Branch management permissions
(NULL, 'branches:manage', 'multi_location', 'Manage business branches and locations', 'branches', 'manage', true),
(NULL, 'branches:view', 'multi_location', 'View business branches and locations', 'branches', 'view', true),
(NULL, 'branches:assign', 'multi_location', 'Assign users to branches', 'branches', 'assign', true),
-- Cross-branch permissions  
(NULL, 'cross_branch:view', 'multi_location', 'View data across branches', 'cross_branch', 'view', true),
(NULL, 'cross_branch:edit', 'multi_location', 'Edit data across branches', 'cross_branch', 'edit', true),
(NULL, 'cross_branch:transfer', 'multi_location', 'Transfer resources between branches', 'cross_branch', 'transfer', true),
(NULL, 'cross_branch:manage', 'multi_location', 'Manage cross-branch access rules', 'cross_branch', 'manage', true),
-- Location security permissions
(NULL, 'location_security:manage', 'multi_location', 'Manage location-based security rules', 'location_security', 'manage', true),
(NULL, 'location_security:view', 'multi_location', 'View location security configurations', 'location_security', 'view', true),
-- Multi-location reporting
(NULL, 'multi_location_reports:view', 'multi_location', 'View consolidated multi-location reports', 'multi_location_reports', 'view', true),
(NULL, 'multi_location_reports:export', 'multi_location', 'Export multi-location reports', 'multi_location_reports', 'export', true);

-- Update triggers
CREATE TRIGGER update_business_branches_updated_at
    BEFORE UPDATE ON business_branches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_branch_permission_sets_updated_at
    BEFORE UPDATE ON branch_permission_sets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cross_branch_access_rules_updated_at
    BEFORE UPDATE ON cross_branch_access_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
