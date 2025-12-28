-- FIX_PERMISSIONS_CONSTRAINT.sql
BEGIN;

-- 1. First, backup the constraint names (just in case)
CREATE TABLE IF NOT EXISTS constraint_backup AS 
SELECT conname, contype, pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'permissions'::regclass;

-- 2. Remove the WRONG constraint (global name uniqueness)
ALTER TABLE permissions DROP CONSTRAINT IF EXISTS permissions_name_key;

-- 3. Rename the CORRECT constraint for clarity
ALTER TABLE permissions 
RENAME CONSTRAINT permissions_business_id_name_key TO permissions_unique_name_per_business;

-- 4. Add a partial unique index for NULL business_id (if needed)
-- This allows: (NULL, 'customer:read') to exist once globally
CREATE UNIQUE INDEX IF NOT EXISTS permissions_global_name_unique 
ON permissions (name) 
WHERE business_id IS NULL;

-- 5. Verify the fix
SELECT 
    c.conname as constraint_name,
    CASE c.contype 
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'f' THEN 'FOREIGN KEY'
        ELSE c.contype 
    END as constraint_type,
    pg_get_constraintdef(c.oid) as definition
FROM pg_constraint c
WHERE c.conrelid = 'permissions'::regclass
ORDER BY c.contype;

-- 6. Check data integrity
SELECT 
    'Global permissions (business_id IS NULL):' as check_type,
    COUNT(DISTINCT name) as unique_names,
    COUNT(*) as total_records
FROM permissions 
WHERE business_id IS NULL

UNION ALL

SELECT 
    'Business-specific permissions:' as check_type,
    COUNT(DISTINCT (business_id::text || ':' || name)) as unique_combinations,
    COUNT(*) as total_records
FROM permissions 
WHERE business_id IS NOT NULL;

COMMIT;
