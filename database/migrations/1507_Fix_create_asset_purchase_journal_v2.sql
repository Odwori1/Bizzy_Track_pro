-- Migration 1507: Fix create_asset_purchase_journal_v2 total_amount doubling bug
--
-- ROOT CAUSE:
-- v_total_amount was set to v_asset_cost * 2, then written to
-- journal_entries.total_amount, while each journal_entry_lines row
-- (debit fixed-asset, credit payment account) correctly used v_asset_cost.
-- This meant journal_entries.total_amount was double the real economic
-- amount for every asset purchase, while the underlying double-entry lines
-- were always correct.
--
-- IMPACT CONFIRMED:
-- - journal_entry_lines rows were NEVER wrong (verified against live data:
--   total_debits == total_credits == v_asset_cost in all sampled rows).
-- - No reporting function (get_balance_sheet, get_profit_loss,
--   get_financial_summary, get_trial_balance_enhanced) reads
--   journal_entries.total_amount directly -- all derive figures from
--   SUM(journal_entry_lines.amount). Confirmed via pg_get_functiondef().
-- - Depreciation calculation reads assets.purchase_cost /
--   assets.current_book_value, not journal_entries.total_amount.
-- => This bug could not have corrupted the balance sheet, P&L, trial
--    balance, financial summary, or depreciation schedule. It only
--    affects any future feature that reads journal_entries.total_amount
--    directly (e.g. a raw journal list view, CSV export, audit dashboard).
--
-- SCOPE OF THIS MIGRATION:
-- Fixes the function going forward only. Historical rows with the doubled
-- total_amount are left as-is; if a backfill is ever wanted, use:
--
--   UPDATE journal_entries je
--   SET total_amount = sub.total_debits
--   FROM (
--     SELECT journal_entry_id, SUM(amount) AS total_debits
--     FROM journal_entry_lines
--     WHERE line_type = 'debit'
--     GROUP BY journal_entry_id
--   ) sub
--   WHERE je.id = sub.journal_entry_id
--     AND je.reference_type = 'asset'
--     AND je.total_amount != sub.total_debits;
--
-- (Not run automatically here -- deliberate decision, not an oversight.)

CREATE OR REPLACE FUNCTION public.create_asset_purchase_journal_v2(
    p_business_id uuid,
    p_asset_id uuid,
    p_user_id uuid,
    p_journal_date date,
    p_payment_method character varying DEFAULT 'cash'::character varying
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
    v_payment_account_id UUID;
    v_payment_account_code TEXT;
    v_reference_number TEXT;
    v_total_amount NUMERIC(15,2);
    v_payment_method_lower TEXT;
BEGIN
    SELECT purchase_cost, asset_code, asset_name, category
    INTO v_asset_cost, v_asset_code, v_asset_name, v_asset_category
    FROM assets
    WHERE id = p_asset_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found: %', p_asset_id;
    END IF;

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

    SELECT id INTO v_fixed_asset_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = v_fixed_asset_account_code
      AND is_active = true
    LIMIT 1;

    IF v_fixed_asset_account_id IS NULL THEN
        RAISE EXCEPTION 'Fixed Assets account (% - %) not found for business.', v_fixed_asset_account_code, v_asset_category;
    END IF;

    v_payment_method_lower := LOWER(p_payment_method);
    v_payment_account_code := CASE v_payment_method_lower
        WHEN 'cash' THEN '1110'
        WHEN 'bank' THEN '1120'
        WHEN 'mobile_money' THEN '1130'
        WHEN 'mobile' THEN '1130'
        WHEN 'credit' THEN '2100'
        WHEN 'payable' THEN '2100'
        WHEN 'account_payable' THEN '2100'
        ELSE '1110'
    END;

    SELECT id, account_code INTO v_payment_account_id, v_payment_account_code
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = v_payment_account_code
      AND is_active = true
    LIMIT 1;

    IF v_payment_account_id IS NULL THEN
        RAISE EXCEPTION 'Payment account (% - %) not found for business.', v_payment_account_code, p_payment_method;
    END IF;

    v_reference_number := 'ASSET-' || v_asset_code || '-' ||
                         TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                         (EXTRACT(SECOND FROM NOW())::INTEGER) || '-' ||
                         (FLOOR(RANDOM() * 1000)::INTEGER);

    -- FIX (1507): was v_asset_cost * 2, which double-counted the amount
    -- against the actual balanced debit/credit lines below.
    v_total_amount := v_asset_cost;

    INSERT INTO journal_entries (
        business_id, journal_date, reference_number, reference_type, reference_id,
        description, total_amount, status, created_by, posted_at
    ) VALUES (
        p_business_id, p_journal_date, v_reference_number, 'asset', p_asset_id::text,
        'Asset Purchase: ' || v_asset_name || ' (' || v_asset_category || ') - Paid via ' || p_payment_method,
        v_total_amount, 'posted', p_user_id, NOW()
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        p_business_id, v_journal_entry_id, v_fixed_asset_account_id, 'debit', v_asset_cost,
        'Purchase of ' || v_asset_name || ' (' || v_asset_category || ')'
    );

    INSERT INTO journal_entry_lines (
        business_id, journal_entry_id, account_id, line_type, amount, description
    ) VALUES (
        p_business_id, v_journal_entry_id, v_payment_account_id, 'credit', v_asset_cost,
        'Payment for asset purchase from ' || v_payment_account_code || ' (' || p_payment_method || ')'
    );

    -- FIX: Added business_id to WHERE clause
    UPDATE assets
    SET
        payment_method = p_payment_method,
        payment_account_code = v_payment_account_code,
        depreciation_start_date = COALESCE(depreciation_start_date, p_journal_date)
    WHERE id = p_asset_id AND business_id = p_business_id;

    RETURN v_journal_entry_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in create_asset_purchase_journal_v2: %', SQLERRM;
        RAISE NOTICE 'Asset ID: %, Business ID: %, Category: %, Payment Method: %',
            p_asset_id, p_business_id, v_asset_category, p_payment_method;
        RAISE;
END;
$function$;
