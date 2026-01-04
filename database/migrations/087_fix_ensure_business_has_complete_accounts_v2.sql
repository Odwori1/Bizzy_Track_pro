-- Migration 087 v2: Fix ensure_business_has_complete_accounts() with proper business check
-- Drops and recreates the function to ensure it's updated

DROP FUNCTION IF EXISTS ensure_business_has_complete_accounts(UUID);

CREATE OR REPLACE FUNCTION ensure_business_has_complete_accounts(p_business_id UUID)
RETURNS VOID AS $$
DECLARE
    v_business_exists BOOLEAN;
BEGIN
    -- Check if business exists
    SELECT EXISTS (
        SELECT 1 FROM businesses WHERE id = p_business_id
    ) INTO v_business_exists;
    
    IF NOT v_business_exists THEN
        RAISE NOTICE 'Business % does not exist, skipping account creation', p_business_id;
        RETURN;
    END IF;

    RAISE NOTICE 'Ensuring complete chart of accounts for business: %', p_business_id;

    -- Insert all accounts atomically with ON CONFLICT DO NOTHING
    INSERT INTO chart_of_accounts (
        id,
        business_id,
        account_code,
        account_name,
        account_type,
        is_active,
        created_at,
        updated_at
    ) VALUES 
        -- Assets (1000-1999)
        (gen_random_uuid(), p_business_id, '1110', 'Cash', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1120', 'Bank Account', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1130', 'Mobile Money', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1200', 'Accounts Receivable', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1300', 'Inventory', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1400', 'Prepaid Expenses', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1500', 'Equipment', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1600', 'Furniture and Fixtures', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1700', 'Accumulated Depreciation', 'asset', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '1800', 'Other Assets', 'asset', true, NOW(), NOW()),

        -- Liabilities (2000-2999)
        (gen_random_uuid(), p_business_id, '2100', 'Accounts Payable', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2200', 'Loans Payable', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2300', 'Accrued Expenses', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2400', 'Unearned Revenue', 'liability', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '2500', 'Other Liabilities', 'liability', true, NOW(), NOW()),

        -- Equity (3000-3999)
        (gen_random_uuid(), p_business_id, '3100', 'Owner''s Capital', 'equity', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3200', 'Owner''s Drawings', 'equity', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3300', 'Retained Earnings', 'equity', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '3400', 'Current Earnings', 'equity', true, NOW(), NOW()),

        -- Revenue (4000-4999)
        (gen_random_uuid(), p_business_id, '4100', 'Sales Revenue', 'revenue', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4200', 'Service Revenue', 'revenue', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4300', 'Discounts Given', 'revenue', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '4400', 'Other Revenue', 'revenue', true, NOW(), NOW()),

        -- Expenses (5000-5999)
        (gen_random_uuid(), p_business_id, '5100', 'Cost of Goods Sold', 'expense', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5200', 'Salaries and Wages', 'expense', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5300', 'Rent Expense', 'expense', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5400', 'Utilities Expense', 'expense', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5500', 'Marketing Expense', 'expense', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5600', 'Depreciation Expense', 'expense', true, NOW(), NOW()),
        (gen_random_uuid(), p_business_id, '5700', 'Other Expenses', 'expense', true, NOW(), NOW())
    ON CONFLICT (business_id, account_code) DO NOTHING;

    RAISE NOTICE '✅ Chart of accounts complete for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;
