-- ============================================================================
-- COMPLETE RBAC + ABAC + RLS FOUNDATION
-- ============================================================================

-- 1. RBAC: Role Definitions
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT false,
    permissions_template JSONB, -- For quick role setup
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(business_id, name)
);

-- 2. RBAC: Permissions Matrix
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., 'customer:create', 'service:read'
    category VARCHAR(50) NOT NULL, -- e.g., 'customer', 'service', 'financial'
    description TEXT,
    resource_type VARCHAR(50), -- e.g., 'customer', 'service'
    action VARCHAR(50), -- e.g., 'create', 'read', 'update', 'delete'
    is_system_permission BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(business_id, name)
);

-- 3. RBAC: Role-Permission Mapping
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- 4. ABAC: User-Feature Toggles (Granular permissions)
CREATE TABLE user_feature_toggles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    is_allowed BOOLEAN DEFAULT false,
    conditions JSONB, -- ABAC conditions: {"max_discount": 100, "time_restriction": "9-5"}
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    UNIQUE(user_id, permission_id)
);

-- 5. ABAC: Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL, -- e.g., 'customer.created'
    resource_type VARCHAR(50) NOT NULL, -- e.g., 'customer', 'service'
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB, -- Additional ABAC context
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BUSINESS TABLES WITH SECURITY IN MIND
-- ============================================================================

-- 6. Customer Categories
CREATE TABLE customer_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6B7280',
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(business_id, name)
);

-- 7. Customers
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES customer_categories(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company_name VARCHAR(255),
    tax_number VARCHAR(100),
    address JSONB,
    notes TEXT,
    total_spent DECIMAL(12,2) DEFAULT 0,
    last_visit TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2) NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    category VARCHAR(100) DEFAULT 'General',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Customer Category Discount Rules
CREATE TABLE category_discount_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    category_id UUID REFERENCES customer_categories(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    discount_type VARCHAR(20) CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL,
    min_amount DECIMAL(10,2) DEFAULT 0,
    max_discount DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category_id, service_id)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feature_toggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_discount_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies using security context
CREATE POLICY roles_business_isolation ON roles FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY permissions_business_isolation ON permissions FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY role_permissions_business_isolation ON role_permissions FOR ALL USING (
    role_id IN (SELECT id FROM roles WHERE business_id = current_setting('app.current_business_id')::UUID)
);
CREATE POLICY user_toggles_business_isolation ON user_feature_toggles FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE business_id = current_setting('app.current_business_id')::UUID)
);
CREATE POLICY audit_logs_business_isolation ON audit_logs FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY customer_categories_business_isolation ON customer_categories FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY customers_business_isolation ON customers FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY services_business_isolation ON services FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY discount_rules_business_isolation ON category_discount_rules FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- DEFAULT SYSTEM ROLES AND PERMISSIONS
-- ============================================================================

-- Insert default permissions (run this after tables are created)
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES 
-- Customer permissions
(NULL, 'customer:create', 'customer', 'Create new customers', 'customer', 'create', true),
(NULL, 'customer:read', 'customer', 'View customer information', 'customer', 'read', true),
(NULL, 'customer:update', 'customer', 'Update customer details', 'customer', 'update', true),
(NULL, 'customer:delete', 'customer', 'Delete customers', 'customer', 'delete', true),

-- Service permissions  
(NULL, 'service:create', 'service', 'Create new services', 'service', 'create', true),
(NULL, 'service:read', 'service', 'View service catalog', 'service', 'read', true),
(NULL, 'service:update', 'service', 'Update service details', 'service', 'update', true),
(NULL, 'service:delete', 'service', 'Delete services', 'service', 'delete', true),

-- Category permissions
(NULL, 'category:create', 'customer', 'Create customer categories', 'category', 'create', true),
(NULL, 'category:read', 'customer', 'View customer categories', 'category', 'read', true),
(NULL, 'category:update', 'customer', 'Update category details', 'category', 'update', true),
(NULL, 'category:delete', 'customer', 'Delete categories', 'category', 'delete', true);
