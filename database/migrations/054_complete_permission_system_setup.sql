-- Migration: Fix User-Role Relationship and Permission System
-- Date: 2025-12-09
-- Description: Complete overhaul of role-permission-user relationship

BEGIN;

-- ============================================
-- STEP 1: ADD ROLE_ID TO USERS TABLE
-- ============================================

-- Add role_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- ============================================
-- STEP 2: MIGRATE EXISTING ROLE STRINGS TO ROLE_IDs
-- ============================================

-- Update users to have correct role_id based on role string
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE r.business_id = u.business_id 
  AND r.name = u.role
  AND u.role IS NOT NULL
  AND u.role_id IS NULL;

-- ============================================
-- STEP 3: CREATE DEFAULT PERMISSION TEMPLATES FOR SYSTEM ROLES
-- ============================================

-- Function to setup role permissions
CREATE OR REPLACE FUNCTION setup_role_permissions_for_business(business_uuid UUID) RETURNS void AS $$
DECLARE
    owner_role_id UUID;
    manager_role_id UUID;
    staff_role_id UUID;
    supervisor_role_id UUID;
BEGIN
    -- Get role IDs for this business
    SELECT id INTO owner_role_id FROM roles WHERE business_id = business_uuid AND name = 'owner';
    SELECT id INTO manager_role_id FROM roles WHERE business_id = business_uuid AND name = 'manager';
    SELECT id INTO staff_role_id FROM roles WHERE business_id = business_uuid AND name = 'staff';
    SELECT id INTO supervisor_role_id FROM roles WHERE business_id = business_uuid AND name = 'supervisor';
    
    -- Clear existing permissions
    DELETE FROM role_permissions 
    WHERE role_id IN (owner_role_id, manager_role_id, staff_role_id, supervisor_role_id);
    
    -- OWNER: Get all system permissions
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT 
        gen_random_uuid(),
        owner_role_id,
        p.id,
        NOW()
    FROM permissions p
    WHERE p.business_id IS NULL  -- System permissions
    ON CONFLICT (role_id, permission_id) DO NOTHING;
    
    -- MANAGER: Get most permissions except business settings
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT 
        gen_random_uuid(),
        manager_role_id,
        p.id,
        NOW()
    FROM permissions p
    WHERE p.business_id IS NULL
      AND p.name NOT IN (
          'business:settings:read', 'business:settings:update',
          'staff:delete'  -- Managers can't delete staff
      )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
    
    -- SUPERVISOR: Limited permissions (if role exists)
    IF supervisor_role_id IS NOT NULL THEN
        INSERT INTO role_permissions (id, role_id, permission_id, created_at)
        SELECT 
            gen_random_uuid(),
            supervisor_role_id,
            p.id,
            NOW()
        FROM permissions p
        WHERE p.business_id IS NULL
          AND p.category IN ('dashboard', 'customer', 'service', 'job', 'inventory', 'pos', 'invoice', 'staff')
          AND p.action IN ('read', 'update', 'create')
          AND p.name NOT LIKE '%delete%'
          AND p.name NOT LIKE 'business:%'
        ON CONFLICT (role_id, permission_id) DO NOTHING;
    END IF;
    
    -- STAFF: Basic read-only permissions
    INSERT INTO role_permissions (id, role_id, permission_id, created_at)
    SELECT 
        gen_random_uuid(),
        staff_role_id,
        p.id,
        NOW()
    FROM permissions p
    WHERE p.business_id IS NULL
      AND p.category IN ('dashboard', 'customer', 'service', 'job', 'inventory', 'pos')
      AND p.action = 'read'
    ON CONFLICT (role_id, permission_id) DO NOTHING;
    
    RAISE NOTICE 'Setup permissions for business: %', business_uuid;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 4: APPLY TO ALL BUSINESSES
-- ============================================

DO $$
DECLARE
    business_record RECORD;
BEGIN
    FOR business_record IN SELECT id FROM businesses
    LOOP
        PERFORM setup_role_permissions_for_business(business_record.id);
    END LOOP;
END $$;

-- ============================================
-- STEP 5: UPDATE PERMISSIONS MIDDLEWARE TO USE ROLE_ID
-- ============================================

-- This requires backend code changes, but we'll document what needs to change

-- ============================================
-- STEP 6: CLEANUP AND VERIFICATION
-- ============================================

DROP FUNCTION setup_role_permissions_for_business(UUID);

-- Verify the setup
SELECT 
    b.name as business,
    r.name as role,
    COUNT(rp.permission_id) as permission_count
FROM businesses b
JOIN roles r ON r.business_id = b.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
GROUP BY b.id, b.name, r.id, r.name
ORDER BY b.name, 
    CASE r.name 
        WHEN 'owner' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'supervisor' THEN 3
        WHEN 'staff' THEN 4
    END;

-- Check user role_id assignments
SELECT 
    u.email,
    u.role as old_role_string,
    r.name as actual_role_name,
    CASE WHEN u.role_id IS NOT NULL THEN '✓' ELSE '✗' END as role_id_assigned
FROM users u
LEFT JOIN roles r ON u.role_id = r.id
WHERE u.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY u.role;

COMMIT;
