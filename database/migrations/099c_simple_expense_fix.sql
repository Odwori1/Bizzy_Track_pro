-- ============================================================================
-- MIGRATION 099c: SIMPLE EXPENSE ACCOUNTS FIX
-- ============================================================================
-- No functions, no triggers, just direct SQL
-- ============================================================================

-- Add missing expense accounts to ALL businesses
INSERT INTO chart_of_accounts (business_id, account_code, account_name, account_type, is_active)
SELECT 
    b.id,
    a.account_code,
    a.account_name,
    'expense',
    true
FROM businesses b
CROSS JOIN (VALUES
    ('5201', 'Office Supplies Expense'),
    ('5202', 'Utilities Expense'),
    ('5203', 'Rent Expense'),
    ('5204', 'Marketing Expense'),
    ('5205', 'Travel Expense')
) AS a(account_code, account_name)
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts ca
    WHERE ca.business_id = b.id
      AND ca.account_code = a.account_code
);

-- Fix 5200 name for ALL businesses
UPDATE chart_of_accounts 
SET account_name = 'Rent Expense',
    updated_at = NOW()
WHERE account_code = '5200'
  AND account_name = 'Salaries and Wages';

-- Report results
DO $$
DECLARE
    accounts_added BIGINT;
    accounts_renamed BIGINT;
BEGIN
    -- Count accounts added
    SELECT COUNT(*) INTO accounts_added
    FROM chart_of_accounts
    WHERE account_code IN ('5201', '5202', '5203', '5204', '5205');
    
    -- Count accounts renamed
    SELECT COUNT(*) INTO accounts_renamed
    FROM chart_of_accounts
    WHERE account_code = '5200'
      AND account_name = 'Rent Expense';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SIMPLE EXPENSE FIX COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Accounts added (5201-5205): %', accounts_added;
    RAISE NOTICE 'Accounts renamed (5200): %', accounts_renamed;
    RAISE NOTICE '';
    RAISE NOTICE '✅ All businesses now have complete expense accounts';
    RAISE NOTICE '✅ Account 5200 renamed to "Rent Expense"';
    RAISE NOTICE '========================================';
END;
$$;
