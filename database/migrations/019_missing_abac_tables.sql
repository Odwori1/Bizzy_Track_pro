-- ============================================================================
-- MISSING ABAC TABLES FOR WEEK 5 COMPLETION
-- ============================================================================

-- Permissions table for RBAC/ABAC system
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Permission details
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50),
    action VARCHAR(50),
    
    -- System vs custom permissions
    is_system_permission BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(business_id, name)
);

-- User permissions table for ABAC attribute storage
CREATE TABLE IF NOT EXISTS user_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    
    -- ABAC attributes (stored as JSON or key-value pairs)
    value TEXT, -- Can store JSON, numbers, or boolean strings
    conditions JSONB, -- ABAC conditions for this permission
    
    -- Scope and constraints
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Audit
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, business_id, permission_id)
);

-- ============================================================================
-- RLS POLICIES FOR SECURITY
-- ============================================================================

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

-- Business isolation policies
CREATE POLICY permissions_business_isolation ON permissions
FOR ALL USING (
    business_id = current_setting('app.current_business_id')::UUID 
    OR is_system_permission = true
);

CREATE POLICY user_permissions_business_isolation ON user_permissions
FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_permissions_business_name ON permissions(business_id, name);
CREATE INDEX idx_permissions_system ON permissions(is_system_permission) WHERE is_system_permission = true;
CREATE INDEX idx_user_permissions_user_business ON user_permissions(user_id, business_id);
CREATE INDEX idx_user_permissions_permission ON user_permissions(permission_id);
CREATE INDEX idx_user_permissions_validity ON user_permissions(valid_from, valid_until);

-- ============================================================================
-- DEFAULT SYSTEM PERMISSIONS
-- ============================================================================

-- Insert system permissions (business_id is NULL for system-wide permissions)
INSERT INTO permissions (id, business_id, name, category, description, resource_type, action, is_system_permission) VALUES
-- Pricing permissions
(gen_random_uuid(), NULL, 'pricing:override', 'pricing', 'Override pricing restrictions', 'pricing', 'override', true),
(gen_random_uuid(), NULL, 'pricing:bulk_update', 'pricing', 'Perform bulk pricing updates', 'pricing', 'bulk_update', true),
(gen_random_uuid(), NULL, 'discount:approve', 'pricing', 'Approve discounts above limit', 'discount', 'approve', true),
(gen_random_uuid(), NULL, 'discount:limit', 'pricing', 'Set discount approval limit', 'discount', 'limit', true),

-- Seasonal pricing permissions
(gen_random_uuid(), NULL, 'seasonal_pricing:create', 'pricing', 'Create seasonal pricing rules', 'seasonal_pricing', 'create', true),
(gen_random_uuid(), NULL, 'seasonal_pricing:read', 'pricing', 'View seasonal pricing rules', 'seasonal_pricing', 'read', true),
(gen_random_uuid(), NULL, 'seasonal_pricing:update', 'pricing', 'Update seasonal pricing rules', 'seasonal_pricing', 'update', true),
(gen_random_uuid(), NULL, 'seasonal_pricing:delete', 'pricing', 'Delete seasonal pricing rules', 'seasonal_pricing', 'delete', true),

-- Price history permissions
(gen_random_uuid(), NULL, 'price_history:read', 'pricing', 'View price change history', 'price_history', 'read', true),

-- Pricing rule permissions
(gen_random_uuid(), NULL, 'pricing_rule:create', 'pricing', 'Create pricing rules', 'pricing_rule', 'create', true),
(gen_random_uuid(), NULL, 'pricing_rule:read', 'pricing', 'View pricing rules', 'pricing_rule', 'read', true),
(gen_random_uuid(), NULL, 'pricing_rule:update', 'pricing', 'Update pricing rules', 'pricing_rule', 'update', true),
(gen_random_uuid(), NULL, 'pricing_rule:delete', 'pricing', 'Delete pricing rules', 'pricing_rule', 'delete', true)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- DEFAULT USER PERMISSIONS FOR OWNERS
-- ============================================================================

-- Grant all pricing permissions to business owners
INSERT INTO user_permissions (user_id, business_id, permission_id, value, granted_by)
SELECT 
    u.id as user_id,
    u.business_id,
    p.id as permission_id,
    'true' as value,
    u.id as granted_by
FROM users u
CROSS JOIN permissions p
WHERE u.role = 'owner'
  AND p.name IN (
    'pricing:override', 'pricing:bulk_update', 'discount:approve', 'discount:limit',
    'seasonal_pricing:create', 'seasonal_pricing:read', 'seasonal_pricing:update', 'seasonal_pricing:delete',
    'price_history:read', 'pricing_rule:create', 'pricing_rule:read', 'pricing_rule:update', 'pricing_rule:delete'
  )
ON CONFLICT DO NOTHING;

-- Grant limited permissions to managers
INSERT INTO user_permissions (user_id, business_id, permission_id, value, granted_by)
SELECT 
    u.id as user_id,
    u.business_id,
    p.id as permission_id,
    CASE 
        WHEN p.name = 'discount:limit' THEN '30' -- Managers can approve up to 30%
        ELSE 'true'
    END as value,
    u.id as granted_by
FROM users u
CROSS JOIN permissions p
WHERE u.role = 'manager'
  AND p.name IN (
    'pricing:bulk_update', 'discount:approve', 'discount:limit',
    'seasonal_pricing:create', 'seasonal_pricing:read', 'seasonal_pricing:update',
    'price_history:read', 'pricing_rule:create', 'pricing_rule:read', 'pricing_rule:update'
  )
ON CONFLICT DO NOTHING;

-- Grant basic permissions to staff
INSERT INTO user_permissions (user_id, business_id, permission_id, value, granted_by)
SELECT 
    u.id as user_id,
    u.business_id,
    p.id as permission_id,
    CASE 
        WHEN p.name = 'discount:limit' THEN '20' -- Staff can approve up to 20%
        ELSE 'true'
    END as value,
    u.id as granted_by
FROM users u
CROSS JOIN permissions p
WHERE u.role = 'staff'
  AND p.name IN (
    'seasonal_pricing:read', 'price_history:read', 'pricing_rule:read'
  )
ON CONFLICT DO NOTHING;
