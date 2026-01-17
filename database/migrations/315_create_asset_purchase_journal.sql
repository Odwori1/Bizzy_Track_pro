-- ============================================================================
-- FIX: Update create_asset_purchase_journal to accept journal_date parameter
-- ============================================================================

-- Drop the old version
DROP FUNCTION IF EXISTS create_asset_purchase_journal(uuid, uuid, uuid);

-- Create new version with 4 parameters (adding p_journal_date)
CREATE OR REPLACE FUNCTION create_asset_purchase_journal(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID,
    p_journal_date DATE  -- NEW PARAMETER
) RETURNS UUID AS $$
DECLARE
    v_journal_entry_id UUID;
    v_asset_cost NUMERIC;
    v_asset_code TEXT;
    v_asset_name TEXT;
    v_fixed_asset_account_id UUID;
    v_cash_account_id UUID;
BEGIN
    -- Get asset details
    SELECT purchase_cost, asset_code, asset_name
    INTO v_asset_cost, v_asset_code, v_asset_name
    FROM assets 
    WHERE id = p_asset_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found: %', p_asset_id;
    END IF;

    -- Get Fixed Assets account (should exist from ensure_fixed_asset_accounts)
    SELECT id INTO v_fixed_asset_account_id
    FROM accounts
    WHERE business_id = p_business_id
      AND account_code = '1600'  -- Fixed Assets account code
    LIMIT 1;

    IF v_fixed_asset_account_id IS NULL THEN
        RAISE EXCEPTION 'Fixed Assets account not found. Run ensure_fixed_asset_accounts first.';
    END IF;

    -- Get Cash/Bank account
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE business_id = p_business_id
      AND account_type = 'asset'
      AND (name ILIKE '%cash%' OR name ILIKE '%bank%')
      AND is_active = true
    ORDER BY 
        CASE WHEN name ILIKE '%cash%' THEN 1 ELSE 2 END,
        created_at
    LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'No active cash/bank account found for business';
    END IF;

    -- Create journal entry header
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        description,
        created_by,
        status,
        entry_type
    ) VALUES (
        p_business_id,
        p_journal_date,  -- Use the provided date
        'ASSET-' || v_asset_code,
        'Asset Purchase: ' || v_asset_name,
        p_user_id,
        'posted',
        'asset_purchase'
    ) RETURNING id INTO v_journal_entry_id;

    -- Debit: Fixed Assets account (asset increases)
    INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit,
        credit,
        description
    ) VALUES (
        v_journal_entry_id,
        v_fixed_asset_account_id,
        v_asset_cost,
        0,
        'Purchase of ' || v_asset_name
    );

    -- Credit: Cash/Bank account (cash decreases)
    INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit,
        credit,
        description
    ) VALUES (
        v_journal_entry_id,
        v_cash_account_id,
        0,
        v_asset_cost,
        'Payment for ' || v_asset_name
    );

    RETURN v_journal_entry_id;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and re-raise
        RAISE NOTICE 'Error in create_asset_purchase_journal: %', SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to your app role
GRANT EXECUTE ON FUNCTION create_asset_purchase_journal(UUID, UUID, UUID, DATE) 
TO postgres;  -- Replace 'postgres' with your actual app database role

-- Verify the fix
SELECT 
    p.proname,
    pg_catalog.pg_get_function_arguments(p.oid) as arguments,
    pg_catalog.pg_get_function_result(p.oid) as result_type
FROM pg_proc p
WHERE p.proname = 'create_asset_purchase_journal';
