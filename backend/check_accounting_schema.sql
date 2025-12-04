-- 1. Check all accounting-related tables
SELECT table_name, COUNT(*) as column_count 
FROM information_schema.columns 
WHERE table_name IN (
  'chart_of_accounts',
  'journal_entries', 
  'journal_entry_lines',
  'general_ledger',
  'inventory_transactions'
) AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- 2. Detailed column info for chart_of_accounts
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'chart_of_accounts'
ORDER BY ordinal_position;

-- 3. Detailed column info for journal_entry_lines
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'journal_entry_lines'
ORDER BY ordinal_position;

-- 4. Sample data from chart_of_accounts
SELECT * FROM chart_of_accounts 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
LIMIT 5;

-- 5. Sample data from journal_entry_lines
SELECT * FROM journal_entry_lines 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
LIMIT 5;
