-- ============================================================================
-- WEEK 5: SERVICE CATEGORIES SYSTEM
-- ============================================================================

-- Service categories table for proper service organization
CREATE TABLE service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_categories_business_isolation ON service_categories 
    FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- Update services table to use proper foreign key
ALTER TABLE services ADD COLUMN service_category_id UUID REFERENCES service_categories(id);
CREATE INDEX idx_services_category_id ON services(service_category_id);

-- ============================================================================
-- PERMISSIONS FOR SERVICE CATEGORIES
-- ============================================================================

INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
(NULL, 'service_category:create', 'service', 'Create service categories', 'service_category', 'create', true),
(NULL, 'service_category:read', 'service', 'View service categories', 'service_category', 'read', true),
(NULL, 'service_category:update', 'service', 'Update service categories', 'service_category', 'update', true),
(NULL, 'service_category:delete', 'service', 'Delete service categories', 'service_category', 'delete', true);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_service_categories_business_id ON service_categories(business_id);
CREATE INDEX idx_service_categories_sort_order ON service_categories(sort_order);
CREATE INDEX idx_service_categories_is_active ON service_categories(is_active);

