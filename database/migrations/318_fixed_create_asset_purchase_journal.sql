CREATE OR REPLACE FUNCTION create_asset_purchase_journal_final(
    p_business_id uuid,
    p_asset_id uuid,
    p_user_id uuid,
    p_journal_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_journal_entry_id UUID;
    v_asset_cost NUMERIC(15,2);
    v_asset_code TEXT;
    v_asset_name TEXT;
    v_asset_category TEXT;
    v_fixed_asset_account_code TEXT;
    v_fixed_asset_account_id UUID;
    v_cash_account_id UUID;
    v_cash_account_code TEXT;
    v_reference_number TEXT;
    v_total_amount NUMERIC(15,2);
BEGIN
    -- Get asset details including category
    SELECT purchase_cost, asset_code, asset_name, category
    INTO v_asset_cost, v_asset_code, v_asset_name, v_asset_category
    FROM assets
    WHERE id = p_asset_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found: %', p_asset_id;
    END IF;

    -- Map asset category to correct account code
    v_fixed_asset_account_code := CASE v_asset_category
        WHEN 'land' THEN '1410'
        WHEN 'building' THEN '1420'
        WHEN 'vehicle' THEN '1430'
        WHEN 'equipment' THEN '1440'
        WHEN 'furniture' THEN '1450'
        WHEN 'computer' THEN '1460'
        WHEN 'electronics' THEN '1460'
        WHEN 'software' THEN '1460'
        WHEN 'other' THEN '1480'
        ELSE '1480'
    END;

    -- Get Fixed Assets account - CORRECT: chart_of_accounts
    SELECT id INTO v_fixed_asset_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = v_fixed_asset_account_code
      AND is_active = true
    LIMIT 1;

    IF v_fixed_asset_account_id IS NULL THEN
        RAISE EXCEPTION 'Fixed Assets account (% - %) not found.', 
            v_fixed_asset_account_code, v_asset_category;
    END IF;

    -- Get Cash/Bank account - CORRECT: account_name (not name)
    SELECT id, account_code INTO v_cash_account_id, v_cash_account_code
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_type = 'asset'
      AND (account_name ILIKE '%cash%' OR account_name ILIKE '%bank%' OR account_code IN ('1110', '1120', '1130'))
      AND is_active = true
    ORDER BY
        CASE WHEN account_name ILIKE '%cash%' THEN 1 
             WHEN account_code = '1110' THEN 2
             WHEN account_code = '1120' THEN 3
             WHEN account_code = '1130' THEN 4
             ELSE 5 END,
        created_at
    LIMIT 1;

    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'No active cash/bank account found';
    END IF;

    -- Generate reference number
    v_reference_number := 'ASSET-' || v_asset_code || '-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                         (EXTRACT(SECOND FROM NOW())::INTEGER);

    -- Total amount = sum of all line amounts (debit + credit, but they're both positive amounts)
    v_total_amount := v_asset_cost * 2;  -- Debit + Credit

    -- Create journal entry header - USING ACTUAL COLUMNS
    INSERT INTO journal_entries (
        business_id,
        journal_date,
        reference_number,
        reference_type,    -- REQUIRED
        reference_id,      -- REQUIRED
        description,
        total_amount,      -- REQUIRED
        status,
        created_by,
        posted_at
    ) VALUES (
        p_business_id,
        p_journal_date,
        v_reference_number,
        'asset',           -- reference_type
        p_asset_id::text,  -- reference_id
        'Asset Purchase: ' || v_asset_name || ' (' || v_asset_category || ')',
        v_total_amount,
        'posted',
        p_user_id,
        NOW()
    ) RETURNING id INTO v_journal_entry_id;

    -- Debit: Fixed Assets account - CORRECT: line_type/amount (not debit/credit)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        p_business_id,
        v_journal_entry_id,
        v_fixed_asset_account_id,
        'debit',
        v_asset_cost,
        'Purchase of ' || v_asset_name || ' (' || v_asset_category || ')'
    );

    -- Credit: Cash/Bank account - CORRECT: line_type/amount (not debit/credit)
    INSERT INTO journal_entry_lines (
        business_id,
        journal_entry_id,
        account_id,
        line_type,
        amount,
        description
    ) VALUES (
        p_business_id,
        v_journal_entry_id,
        v_cash_account_id,
        'credit',
        v_asset_cost,
        'Payment for asset purchase from ' || v_cash_account_code
    );

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in create_asset_purchase_journal_final: %', SQLERRM;
        RAISE;
END;
$function$;
