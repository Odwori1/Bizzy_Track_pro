-- File: 024_enhanced_package_deconstruction.sql
-- ============================================================================
-- MIGRATION 024: ENHANCED PACKAGE DECONSTRUCTION CAPABILITIES
-- ============================================================================

-- Purpose: Add dynamic deconstruction features to existing package system
-- Builds upon: Existing service_packages and package_services tables
-- ============================================================================

-- Step 1: Enhance existing package_services table
ALTER TABLE package_services 
ADD COLUMN service_dependencies UUID[],
ADD COLUMN timing_constraints JSONB,
ADD COLUMN resource_requirements JSONB,
ADD COLUMN substitution_rules JSONB;

-- Step 2: Create package deconstruction rules table
CREATE TABLE package_deconstruction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id UUID REFERENCES service_packages(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('dependency', 'timing', 'resource', 'pricing', 'substitution')),
    rule_conditions JSONB NOT NULL,
    rule_actions JSONB NOT NULL,
    priority INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: RLS Policies (following existing pattern)
ALTER TABLE package_deconstruction_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY package_rules_business_isolation ON package_deconstruction_rules FOR ALL USING (
    package_id IN (
        SELECT id FROM service_packages 
        WHERE business_id = current_setting('app.current_business_id')::UUID
    )
);

-- Step 4: Add new permissions for deconstruction features
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
(NULL, 'package:deconstruct', 'package', 'Customize and deconstruct service packages', 'package', 'deconstruct', true),
(NULL, 'package:rules:manage', 'package', 'Manage package deconstruction rules', 'package', 'rules_manage', true);

-- Step 5: Performance indexes
CREATE INDEX idx_package_rules_package ON package_deconstruction_rules(package_id, rule_type);
CREATE INDEX idx_package_rules_active ON package_deconstruction_rules(is_active, priority);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
