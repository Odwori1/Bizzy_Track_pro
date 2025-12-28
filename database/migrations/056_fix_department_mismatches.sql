-- Save as: fix_department_mismatches.sql
-- Fix department assignment discrepancies

BEGIN;

-- 1. Sync departments from users to staff_profiles
UPDATE staff_profiles sp
SET department_id = u.department_id,
    updated_at = NOW()
FROM users u
WHERE sp.user_id = u.id 
    AND sp.business_id = u.business_id
    AND u.department_id IS DISTINCT FROM sp.department_id
    AND u.role IN ('owner', 'manager', 'supervisor', 'staff');

-- 2. Report what was fixed
SELECT 
    'Fixed Department Mismatches:' as action,
    COUNT(*) as rows_updated
FROM staff_profiles sp
INNER JOIN users u ON sp.user_id = u.id 
    AND sp.business_id = u.business_id
WHERE u.department_id IS DISTINCT FROM sp.department_id
    AND u.role IN ('owner', 'manager', 'supervisor', 'staff');

-- 3. Verify fix
SELECT 
    'Verification:' as check_type,
    COUNT(*) as remaining_mismatches
FROM users u
INNER JOIN staff_profiles sp ON u.id = sp.user_id AND u.business_id = sp.business_id
WHERE u.department_id IS DISTINCT FROM sp.department_id
    AND u.role IN ('owner', 'manager', 'supervisor', 'staff');

COMMIT;
