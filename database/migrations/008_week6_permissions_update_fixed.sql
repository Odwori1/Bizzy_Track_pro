-- ============================================================================
-- WEEK 6: ASSET MANAGEMENT PERMISSIONS UPDATE - FIXED
-- ============================================================================

-- Add asset management permissions to system permissions
INSERT INTO permissions (business_id, name, category, description, resource_type, action, is_system_permission)
VALUES
-- Fixed Asset permissions
(NULL, 'asset:create', 'asset', 'Create new fixed assets', 'asset', 'create', true),
(NULL, 'asset:read', 'asset', 'View fixed assets', 'asset', 'read', true),
(NULL, 'asset:update', 'asset', 'Update asset details', 'asset', 'update', true),
(NULL, 'asset:delete', 'asset', 'Delete assets', 'asset', 'delete', true),
(NULL, 'asset:depreciate', 'asset', 'Calculate asset depreciation', 'asset', 'depreciate', true),
(NULL, 'asset:maintenance:create', 'asset', 'Record maintenance activities', 'asset', 'maintenance_create', true),
(NULL, 'asset:maintenance:read', 'asset', 'View maintenance history', 'asset', 'maintenance_read', true),

-- Equipment Hire permissions
(NULL, 'equipment:create', 'equipment', 'Add equipment for hire', 'equipment', 'create', true),
(NULL, 'equipment:read', 'equipment', 'View equipment inventory', 'equipment', 'read', true),
(NULL, 'equipment:update', 'equipment', 'Update equipment details', 'equipment', 'update', true),
(NULL, 'equipment:delete', 'equipment', 'Remove equipment', 'equipment', 'delete', true),
(NULL, 'equipment:hire:create', 'equipment', 'Create hire bookings', 'equipment', 'hire_create', true),
(NULL, 'equipment:hire:read', 'equipment', 'View hire bookings', 'equipment', 'hire_read', true),
(NULL, 'equipment:hire:update', 'equipment', 'Update hire bookings', 'equipment', 'hire_update', true),
(NULL, 'equipment:condition:update', 'equipment', 'Update equipment condition', 'equipment', 'condition_update', true),

-- Business Valuation permissions
(NULL, 'valuation:view', 'financial', 'View business valuation reports', 'valuation', 'view', true),
(NULL, 'valuation:export', 'financial', 'Export valuation reports', 'valuation', 'export', true)
ON CONFLICT (business_id, name) DO NOTHING;
