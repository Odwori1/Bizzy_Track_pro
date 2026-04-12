-- ============================================================================
-- MIGRATION: 1018_refund_approval_permissions.sql
-- Purpose: Add permissions for dynamic refund approval system
-- Dependencies: 1017_dynamic_refund_approval.sql
-- Date: April 6, 2026
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Add permissions for refund approvals (system-wide, business_id = NULL)
-- ============================================================================

INSERT INTO permissions (name, category, description, resource_type, action, is_system_permission, business_id) VALUES
    ('refund_approval:view_pending', 'refund_approval', 'View pending refund approvals', 'refund_approval', 'read', true, NULL),
    ('refund_approval:approve', 'refund_approval', 'Approve refund requests', 'refund_approval', 'approve', true, NULL),
    ('refund_approval:reject', 'refund_approval', 'Reject refund requests', 'refund_approval', 'reject', true, NULL),
    ('refund_approval:view_stats', 'refund_approval', 'View refund approval statistics', 'refund_approval', 'read', true, NULL),
    ('refund_approval:configure', 'refund_approval', 'Configure refund approval settings', 'refund_approval', 'write', true, NULL)
ON CONFLICT (name) WHERE business_id IS NULL DO NOTHING;

-- ============================================================================
-- SECTION 2: Assign permissions to roles
-- ============================================================================

DO $$
DECLARE
    v_admin_role_id UUID;
    v_manager_role_id UUID;
    v_supervisor_role_id UUID;
    v_permission_record RECORD;
BEGIN
    -- Get role IDs
    SELECT id INTO v_admin_role_id FROM roles WHERE name = 'admin' LIMIT 1;
    SELECT id INTO v_manager_role_id FROM roles WHERE name = 'manager' LIMIT 1;
    SELECT id INTO v_supervisor_role_id FROM roles WHERE name = 'supervisor' LIMIT 1;
    
    -- Assign to admin role (all 5 permissions)
    FOR v_permission_record IN 
        SELECT id FROM permissions 
        WHERE name IN (
            'refund_approval:view_pending', 'refund_approval:approve', 
            'refund_approval:reject', 'refund_approval:view_stats', 
            'refund_approval:configure'
        )
        AND business_id IS NULL
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_admin_role_id, v_permission_record.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;
    
    -- Assign to manager role (all except configure)
    FOR v_permission_record IN 
        SELECT id FROM permissions 
        WHERE name IN (
            'refund_approval:view_pending', 'refund_approval:approve', 
            'refund_approval:reject', 'refund_approval:view_stats'
        )
        AND business_id IS NULL
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_manager_role_id, v_permission_record.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;
    
    -- Assign to supervisor role (view_pending, approve, reject only)
    FOR v_permission_record IN 
        SELECT id FROM permissions 
        WHERE name IN (
            'refund_approval:view_pending', 'refund_approval:approve', 
            'refund_approval:reject'
        )
        AND business_id IS NULL
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_supervisor_role_id, v_permission_record.id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'REFUND APPROVAL PERMISSIONS ASSIGNED';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Admin role: All 5 permissions';
    RAISE NOTICE 'Manager role: 4 permissions (all except configure)';
    RAISE NOTICE 'Supervisor role: 3 permissions (view_pending, approve, reject)';
    RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- SECTION 3: Verify permissions were created
-- ============================================================================

DO $$
DECLARE
    v_permission_count INTEGER;
    v_permission_names TEXT;
BEGIN
    SELECT COUNT(*) INTO v_permission_count 
    FROM permissions 
    WHERE name LIKE 'refund_approval:%' AND business_id IS NULL;
    
    SELECT string_agg(name, ', ') INTO v_permission_names
    FROM permissions 
    WHERE name LIKE 'refund_approval:%' AND business_id IS NULL
    ORDER BY name;
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'REFUND APPROVAL PERMISSIONS INSTALLED';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '✅ % permissions created', v_permission_count;
    RAISE NOTICE '✅ Permissions: %', v_permission_names;
    RAISE NOTICE '✅ Permissions assigned to admin, manager, supervisor roles';
    RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- SECTION 4: Verify role assignments
-- ============================================================================

DO $$
DECLARE
    v_admin_perm_count INTEGER;
    v_manager_perm_count INTEGER;
    v_supervisor_perm_count INTEGER;
BEGIN
    -- Count permissions for admin role
    SELECT COUNT(*) INTO v_admin_perm_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE r.name = 'admin' AND p.name LIKE 'refund_approval:%';
    
    -- Count permissions for manager role
    SELECT COUNT(*) INTO v_manager_perm_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE r.name = 'manager' AND p.name LIKE 'refund_approval:%';
    
    -- Count permissions for supervisor role
    SELECT COUNT(*) INTO v_supervisor_perm_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE r.name = 'supervisor' AND p.name LIKE 'refund_approval:%';
    
    RAISE NOTICE 'Role permission counts:';
    RAISE NOTICE '  - Admin: % permissions', v_admin_perm_count;
    RAISE NOTICE '  - Manager: % permissions', v_manager_perm_count;
    RAISE NOTICE '  - Supervisor: % permissions', v_supervisor_perm_count;
    RAISE NOTICE '============================================================';
END $$;

COMMIT;
