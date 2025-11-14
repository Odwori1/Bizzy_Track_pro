-- ============================================================================
-- WEEK 5: ADVANCED PRICING & ABAC INTEGRATION
-- ============================================================================

-- Service packages for bundling multiple services
CREATE TABLE service_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Package details
    name VARCHAR(200) NOT NULL,
    description TEXT,
    base_price DECIMAL(10,2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    category VARCHAR(100),
    
    -- Package configuration
    is_customizable BOOLEAN DEFAULT false,
    min_services INTEGER DEFAULT 1,
    max_services INTEGER,
    
    -- Status and audit
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Services included in packages (many-to-many relationship)
CREATE TABLE package_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID REFERENCES service_packages(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    
    -- Service-specific configuration in package
    is_required BOOLEAN DEFAULT false,
    default_quantity INTEGER DEFAULT 1,
    max_quantity INTEGER,
    
    -- Pricing within package (can be different from standalone price)
    package_price DECIMAL(10,2),
    is_price_overridden BOOLEAN DEFAULT false,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(package_id, service_id)
);

-- Dynamic pricing rules
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Rule configuration
    name VARCHAR(200) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('customer_category', 'time_based', 'quantity', 'bundle')),
    
    -- Conditions
    conditions JSONB NOT NULL,
    
    -- Pricing adjustment
    adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('percentage', 'fixed', 'override')),
    adjustment_value DECIMAL(10,2) NOT NULL,
    
    -- Rule applicability
    target_entity VARCHAR(50) NOT NULL CHECK (target_entity IN ('service', 'package', 'customer')),
    target_id UUID, -- Specific service/package/customer, NULL for all
    
    -- Rule priority (higher number = higher priority)
    priority INTEGER DEFAULT 1,
    
    -- Status and dates
    is_active BOOLEAN DEFAULT true,
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Discount approval workflow
CREATE TABLE discount_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Request details
    job_id UUID REFERENCES jobs(id),
    invoice_id UUID REFERENCES invoices(id),
    requested_by UUID REFERENCES users(id),
    
    -- Discount details
    original_amount DECIMAL(10,2) NOT NULL,
    requested_discount DECIMAL(10,2) NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL,
    reason TEXT NOT NULL,
    
    -- Approval workflow
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    
    -- ABAC conditions
    requires_approval BOOLEAN DEFAULT false,
    approval_threshold DECIMAL(5,2), -- Percentage that triggers approval
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY packages_business_isolation ON service_packages FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY package_services_business_isolation ON package_services FOR ALL USING (package_id IN (SELECT id FROM service_packages WHERE business_id = current_setting('app.current_business_id')::UUID));
CREATE POLICY pricing_rules_business_isolation ON pricing_rules FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);
CREATE POLICY discount_approvals_business_isolation ON discount_approvals FOR ALL USING (business_id = current_setting('app.current_business_id')::UUID);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_service_packages_business ON service_packages(business_id, is_active);
CREATE INDEX idx_package_services_package ON package_services(package_id);
CREATE INDEX idx_package_services_service ON package_services(service_id);
CREATE INDEX idx_pricing_rules_business_active ON pricing_rules(business_id, is_active, rule_type);
CREATE INDEX idx_pricing_rules_dates ON pricing_rules(valid_from, valid_until);
CREATE INDEX idx_discount_approvals_status ON discount_approvals(business_id, status);
CREATE INDEX idx_discount_approvals_job ON discount_approvals(job_id);
CREATE INDEX idx_discount_approvals_invoice ON discount_approvals(invoice_id);

-- ============================================================================
-- PERMISSIONS FOR ADVANCED PRICING
-- ============================================================================

-- Add pricing permissions to system permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Package permissions
(NULL, 'package:create', 'pricing', 'Create service packages', 'package', 'create', true),
(NULL, 'package:read', 'pricing', 'View service packages', 'package', 'read', true),
(NULL, 'package:update', 'pricing', 'Update service packages', 'package', 'update', true),
(NULL, 'package:delete', 'pricing', 'Delete service packages', 'package', 'delete', true),

-- Pricing rule permissions
(NULL, 'pricing_rule:create', 'pricing', 'Create pricing rules', 'pricing_rule', 'create', true),
(NULL, 'pricing_rule:read', 'pricing', 'View pricing rules', 'pricing_rule', 'read', true),
(NULL, 'pricing_rule:update', 'pricing', 'Update pricing rules', 'pricing_rule', 'update', true),
(NULL, 'pricing_rule:delete', 'pricing', 'Delete pricing rules', 'pricing_rule', 'delete', true),

-- Pricing override permissions (ABAC)
(NULL, 'pricing:override', 'pricing', 'Override standard pricing', 'pricing', 'override', true),
(NULL, 'discount:approve', 'pricing', 'Approve large discounts', 'discount', 'approve', true),
(NULL, 'discount:request', 'pricing', 'Request discount approvals', 'discount', 'request', true);

-- ============================================================================
-- UPDATE JOBS TABLE FOR PACKAGE SUPPORT
-- ============================================================================

-- Add package reference to jobs table
ALTER TABLE jobs ADD COLUMN package_id UUID REFERENCES service_packages(id);

-- Update job_status_check constraint to include package jobs
-- Note: We'll handle this carefully to avoid breaking existing data

-- ============================================================================
-- SAMPLE PRICING RULES FOR DEMONSTRATION
-- ============================================================================

-- These will be inserted by the demo data generator
