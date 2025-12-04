-- Check for all functions that might handle POS accounting
SELECT 
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE 
        WHEN p.prosrc LIKE '%journal_entries%' THEN 'Uses journal_entries'
        WHEN p.prosrc LIKE '%journal_entry_lines%' THEN 'Uses journal_entry_lines'
        ELSE 'Other'
    END as uses_accounting,
    LENGTH(p.prosrc) as source_length
FROM pg_proc p
WHERE p.proname LIKE '%pos%' 
   OR p.proname LIKE '%sale%'
   OR p.prosrc LIKE '%journal_entries%'
   OR p.prosrc LIKE '%journal_entry_lines%'
ORDER BY p.proname;
