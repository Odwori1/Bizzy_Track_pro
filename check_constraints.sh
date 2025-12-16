#!/bin/bash

echo "Checking database constraints for departments table..."

psql -h localhost -p 5434 -U postgres -d bizzytrack_pro << 'SQL'
-- Check department table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'departments'
ORDER BY ordinal_position;

-- Check foreign key constraints referencing departments
SELECT
    tc.table_name AS foreign_table_name,
    kcu.column_name AS foreign_column_name,
    ccu.table_name AS referenced_table_name,
    ccu.column_name AS referenced_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE ccu.table_name = 'departments'
   AND tc.constraint_type = 'FOREIGN KEY';

-- Check if there are any child records for a specific department
SELECT 'users' as table_name, COUNT(*) as count FROM users WHERE department_id IS NOT NULL
UNION ALL
SELECT 'staff_invitations', COUNT(*) FROM staff_invitations WHERE department_id IS NOT NULL
UNION ALL
SELECT 'department_roles', COUNT(*) FROM department_roles WHERE department_id IS NOT NULL
UNION ALL
SELECT 'job_department_assignments', COUNT(*) FROM job_department_assignments WHERE department_id IS NOT NULL
UNION ALL
SELECT 'department_billing_rules', COUNT(*) FROM department_billing_rules WHERE department_id IS NOT NULL
UNION ALL
SELECT 'departments as child', COUNT(*) FROM departments WHERE parent_department_id IS NOT NULL;
SQL
