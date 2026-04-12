-- ============================================================================
-- MIGRATION: 1019_refund_approval_permissions_clean.sql
-- Purpose: Add permissions for dynamic refund approval system (clean version)
-- Date: April 6, 2026
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Add permissions if they don't exist
-- ============================================================================

INSERT INTO permissions (name, category, description, resource_type, action, is_system_permission, business_id) VALUES
    ('refund_approval:view_pending', 'refund_approval', 'View pending refund approvals', 'refund_approval', 'read', true, NULL),
    ('refund_approval:approve', 'refund_approval', 'Approve refund requests', 'refund_approval', 'approve', true, NULL),
    ('refund_approval:reject', 'refund_approval', 'Reject refund requests', 'refund_approval', 'reject', true, NULL),
    ('refund_approval:view_stats', 'refund_approval', 'View refund approval statistics', 'refund_approval', 'read', true, NULL),
    ('refund_approval:configure', 'refund_approval', 'Configure refund approval settings', 'refund_approval', 'write', true, NULL)
ON CONFLICT (name) WHERE business_id IS NULL DO NOTHING;

-- ============================================================================
-- SECTION 2: Assign permissions to roles (safe - won't duplicate)
-- ============================================================================

DO $$
DECLARE
    v_admin_role_id UUID;
    v_manager_role_id UUID;
    v_supervisor_role_id UUID;
    v_permission_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO v_admin_role_id FROM roles WHERE name = 'admin' LIMIT 1;
    SELECT id INTO v_manager_role_id FROM roles WHERE name = 'manager' LIMIT 1;
    SELECT id INTO v_supervisor_role_id FROM roles WHERE name = 'supervisor' LIMIT 1;
    
    -- Assign to admin role
    FOR v_permission_id IN 
        SELECT id FROM permissions 
        WHERE name IN (
            'refund_approval:view_pending', 'refund_approval:approve', 
            'refund_approval:reject', 'refund_approval:view_stats', 
            'refund_approval:configure'
        )
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_admin_role_id, v_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;
    
    -- Assign to manager role
    FOR v_permission_id IN 
        SELECT id FROM permissions 
        WHERE name IN (
            'refund_approval:view_pending', 'refund_approval:approve', 
            'refund_approval:reject', 'refund_approval:view_stats'
        )
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_manager_role_id, v_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;
    
    -- Assign to supervisor role
    FOR v_permission_id IN 
        SELECT id FROM permissions 
        WHERE name IN (
            'refund_approval:view_pending', 'refund_approval:approve', 
            'refund_approval:reject'
        )
    LOOP
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES (v_supervisor_role_id, v_permission_id)
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END LOOP;
    
    RAISE NOTICE 'Permissions assigned successfully';
END $$;

-- ============================================================================
-- SECTION 3: Simple verification (no ORDER BY issues)
-- ============================================================================

DO $$
DECLARE
    v_permission_count INTEGER;
    v_admin_count INTEGER;
    v_manager_count INTEGER;
    v_supervisor_count INTEGER;
BEGIN
    -- Count permissions
    SELECT COUNT(*) INTO v_permission_count 
    FROM permissions 
    WHERE name LIKE 'refund_approval:%';
    
    -- Count assignments
    SELECT COUNT(*) INTO v_admin_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'admin';
    
    SELECT COUNT(*) INTO v_manager_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'manager';
    
    SELECT COUNT(*) INTO v_supervisor_count
    FROM role_permissions rp
    JOIN roles r ON rp.role_id = r.id
    WHERE r.name = 'supervisor';
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'REFUND APPROVAL PERMISSIONS STATUS';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Permissions created: %', v_permission_count;
    RAISE NOTICE 'Admin role total permissions: %', v_admin_count;
    RAISE NOTICE 'Manager role total permissions: %', v_manager_count;
    RAISE NOTICE 'Supervisor role total permissions: %', v_supervisor_count;
    RAISE NOTICE '============================================================';
END $$;

COMMIT;
