-- File: ~/Bizzy_Track_pro/database/migrations/071_complete_chart_of_accounts.sql
-- ============================================================================
-- COMPLETE CHART OF ACCOUNTS - DYNAMIC VERSION
-- ============================================================================
-- This adds missing accounts for ALL businesses
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_chart_of_accounts_for_business(p_business_id UUID)
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
    v_account_exists BOOLEAN;
BEGIN
    -- Get a user from this business to use as created_by
    SELECT id INTO v_user_id
    FROM users
    WHERE business_id = p_business_id
    LIMIT 1;

    -- If no user exists, use NULL (system)
    v_user_id := COALESCE(v_user_id, NULL);

    -- Check and add each missing account
    -- 1120 Bank Account
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '1120'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '1120', 'Bank Account', 'asset',
            'current_asset', 0, 0, true, v_user_id
        );
    END IF;

    -- 1130 Mobile Money
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '1130'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '1130', 'Mobile Money', 'asset',
            'current_asset', 0, 0, true, v_user_id
        );
    END IF;

    -- 1400 Fixed Assets
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '1400'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '1400', 'Fixed Assets', 'asset',
            'fixed_asset', 0, 0, true, v_user_id
        );
    END IF;

    -- 1410 Accumulated Depreciation (CONTRA-ASSET)
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '1410'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '1410', 'Accumulated Depreciation', 'asset',
            'contra_asset', 0, 0, true, v_user_id
        );
    END IF;

    -- 2100 Accounts Payable
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '2100'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '2100', 'Accounts Payable', 'liability',
            'current_liability', 0, 0, true, v_user_id
        );
    END IF;

    -- 2210 Short-term Loans
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '2210'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '2210', 'Short-term Loans', 'liability',
            'current_liability', 0, 0, true, v_user_id
        );
    END IF;

    -- 2220 Long-term Loans
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '2220'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '2220', 'Long-term Loans', 'liability',
            'long_term_liability', 0, 0, true, v_user_id
        );
    END IF;

    -- 2300 Interest Payable
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '2300'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '2300', 'Interest Payable', 'liability',
            'current_liability', 0, 0, true, v_user_id
        );
    END IF;

    -- 5600 Depreciation Expense
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '5600'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '5600', 'Depreciation Expense', 'expense',
            'operating_expense', 0, 0, true, v_user_id
        );
    END IF;

    -- 5700 Interest Expense
    SELECT EXISTS(
        SELECT 1 FROM chart_of_accounts
        WHERE business_id = p_business_id AND account_code = '5700'
    ) INTO v_account_exists;

    IF NOT v_account_exists THEN
        INSERT INTO chart_of_accounts (
            business_id, account_code, account_name, account_type,
            account_subtype, opening_balance, current_balance, is_active, created_by
        ) VALUES (
            p_business_id, '5700', 'Interest Expense', 'expense',
            'operating_expense', 0, 0, true, v_user_id
        );
    END IF;

    RAISE NOTICE 'Completed chart of accounts for business: %', p_business_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RUN FOR ALL EXISTING BUSINESSES
-- ============================================================================
DO $$
DECLARE
    business_record RECORD;
BEGIN
    -- FIXED: Removed the WHERE deleted_at IS NULL clause since businesses table doesn't have deleted_at
    FOR business_record IN
        SELECT id FROM businesses
    LOOP
        BEGIN
            PERFORM complete_chart_of_accounts_for_business(business_record.id);
            RAISE NOTICE 'Processed business: %', business_record.id;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed for business %: %', business_record.id, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- ============================================================================
-- DROP THE TEMPORARY FUNCTION
-- ============================================================================
DROP FUNCTION complete_chart_of_accounts_for_business(UUID);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- FIXED: Replaced invalid COMMENT ON MIGRATION with a simple notice
DO $$
BEGIN
    RAISE NOTICE 'Migration 071 completed: Added missing financial accounts for all businesses';
END;
$$;
