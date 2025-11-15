-- ============================================================================
-- WEEK 6: ASSET MANAGEMENT PERMISSIONS UPDATE
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
(NULL, 'valuation:export', 'financial', 'Export valuation reports', 'valuation', 'export', true);

-- Update role permission templates for the new permissions
UPDATE roles SET permissions_template = '{"permissions": ["all"]}'::jsonb 
WHERE name = 'owner' AND business_id IS NULL;

UPDATE roles SET permissions_template = '{
  "permissions": [
    "customer:create", "customer:read", "customer:update",
    "service:create", "service:read", "service:update", 
    "job:create", "job:read", "job:update", "job:assign", "job:status:update",
    "invoice:create", "invoice:read", "invoice:update", "invoice:send", "invoice:payment:record",
    "package:create", "package:read", "package:update",
    "pricing_rule:create", "pricing_rule:read", "pricing_rule:update",
    "pricing:override", "discount:approve", "discount:request",
    "asset:create", "asset:read", "asset:update", "asset:depreciate", "asset:maintenance:create", "asset:maintenance:read",
    "equipment:create", "equipment:read", "equipment:update", "equipment:hire:create", "equipment:hire:read", "equipment:hire:update", "equipment:condition:update",
    "valuation:view"
  ]
}'::jsonb 
WHERE name = 'manager' AND business_id IS NULL;

UPDATE roles SET permissions_template = '{
  "permissions": [
    "customer:read", "customer:create",
    "service:read", 
    "job:read", "job:status:update",
    "invoice:read", "invoice:create",
    "package:read",
    "pricing_rule:read",
    "discount:request",
    "asset:read", "asset:maintenance:create", "asset:maintenance:read",
    "equipment:read", "equipment:hire:create", "equipment:hire:read",
    "valuation:view"
  ]
}'::jsonb 
WHERE name = 'staff' AND business_id IS NULL;
