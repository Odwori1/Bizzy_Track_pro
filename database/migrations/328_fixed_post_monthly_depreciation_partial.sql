-- Drop the problematic function and recreate it correctly
DROP FUNCTION IF EXISTS post_monthly_depreciation_partial(uuid, integer, integer, uuid);

-- Create the CORRECTED function
CREATE OR REPLACE FUNCTION post_monthly_depreciation_partial(
    p_business_id uuid, 
    p_month integer, 
    p_year integer, 
    p_user_id uuid
) 
RETURNS TABLE(
    asset_id uuid, 
    asset_code character varying, 
    asset_name character varying, 
    depreciation_amount numeric, 
    success boolean, 
    message text
) 
LANGUAGE plpgsql
AS $function$
DECLARE
    v_asset RECORD;
    v_depreciation_amount DECIMAL(15,2);
    v_depreciation_date DATE;
    v_new_depreciation_id UUID;
    v_previous_depreciation RECORD;
    v_book_value_before DECIMAL(15,2);
    v_accumulated_before DECIMAL(15,2);
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_unique_suffix VARCHAR(20);
    v_asset_counter INTEGER := 0;
    v_has_depreciation BOOLEAN;
BEGIN
    v_depreciation_date := MAKE_DATE(p_year, p_month, 1);

    -- Check if depreciation already posted for this period
    SELECT EXISTS (
        SELECT 1 FROM asset_depreciations ad
        WHERE ad.business_id = p_business_id
          AND ad.period_month = p_month
          AND ad.period_year = p_year
          AND ad.is_posted = true
    ) INTO v_has_depreciation;

    IF v_has_depreciation THEN
        RAISE EXCEPTION 'Depreciation already posted for period %/%', p_month, p_year;
    END IF;

    -- Get depreciation expense account
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts coa
    WHERE coa.business_id = p_business_id
      AND coa.account_code = '5600' -- Depreciation Expense
      AND coa.is_active = true;

    IF v_depreciation_account_id IS NULL THEN
        RAISE EXCEPTION 'Depreciation Expense account (5600) not found';
    END IF;

    FOR v_asset IN (
        SELECT a.*
        FROM assets a
        WHERE a.business_id = p_business_id
          AND a.is_active = true
          AND a.status IN ('active', 'idle')
          AND a.purchase_cost > 0
          AND a.useful_life_months > 0
          AND COALESCE(a.depreciation_start_date, a.acquisition_date, a.purchase_date) <=
              (v_depreciation_date + INTERVAL '1 month' - INTERVAL '1 day')
        ORDER BY a.asset_code
    ) LOOP
        v_asset_counter := v_asset_counter + 1;

        BEGIN
            -- Use partial depreciation calculation
            v_depreciation_amount := calculate_monthly_depreciation_with_partial(
                v_asset.id, p_month, p_year
            );

            IF v_depreciation_amount > 0 THEN
                -- Get previous accumulated depreciation
                SELECT ad.accumulated_depreciation_after, ad.book_value_after
                INTO v_previous_depreciation
                FROM asset_depreciations ad
                WHERE ad.asset_id = v_asset.id
                  AND ad.is_posted = true
                  AND (ad.period_year < p_year OR (ad.period_year = p_year AND ad.period_month < p_month))
                ORDER BY ad.period_year DESC, ad.period_month DESC
                LIMIT 1;

                IF FOUND THEN
                    v_accumulated_before := v_previous_depreciation.accumulated_depreciation_after;
                    v_book_value_before := v_previous_depreciation.book_value_after;
                ELSE
                    v_accumulated_before := COALESCE(v_asset.accumulated_depreciation, 0);
                    v_book_value_before := v_asset.current_book_value;
                END IF;

                -- Get appropriate accumulated depreciation account
                SELECT id INTO v_accumulated_account_id
                FROM chart_of_accounts coa
                WHERE coa.business_id = p_business_id
                  AND coa.account_code = CASE
                    WHEN v_asset.category = 'building' THEN '1490'
                    WHEN v_asset.category = 'vehicle' THEN '1491'
                    WHEN v_asset.category = 'equipment' THEN '1492'
                    WHEN v_asset.category = 'furniture' THEN '1493'
                    WHEN v_asset.category IN ('computer', 'electronics', 'software') THEN '1494'
                    ELSE '1495'
                  END
                  AND coa.is_active = true;

                IF v_accumulated_account_id IS NULL THEN
                    SELECT id INTO v_accumulated_account_id
                    FROM chart_of_accounts coa
                    WHERE coa.business_id = p_business_id
                      AND coa.account_code = '1495'
                      AND coa.is_active = true;
                END IF;

                IF v_accumulated_account_id IS NULL THEN
                    RAISE EXCEPTION 'Accumulated Depreciation account not found for category: %', v_asset.category;
                END IF;

                -- Generate unique reference number
                v_unique_suffix := (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 +
                                   (random() * 999)::INTEGER +
                                   v_asset_counter) % 1000000;

                v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                    LPAD(p_year::TEXT, 4, '0') || '-' ||
                    LPAD(p_month::TEXT, 2, '0') || '-' ||
                    LPAD(v_unique_suffix::TEXT, 6, '0');

                -- Create journal entry with CORRECT date handling
                INSERT INTO journal_entries (
                    business_id,
                    journal_date,
                    reference_number,
                    reference_type,
                    reference_id,
                    description,
                    total_amount,
                    status,
                    created_by,
                    posted_at
                ) VALUES (
                    p_business_id,
                    LEAST(
                        v_depreciation_date + INTERVAL '1 month' - INTERVAL '1 day',
                        CURRENT_DATE
                    ),
                    v_reference_number,
                    'asset_depreciation',
                    'month_' || v_asset.id::TEXT || '_' ||
                    p_year::TEXT || p_month::TEXT || '_' ||
                    v_unique_suffix::TEXT || '_' ||
                    txid_current()::TEXT,
                    'Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ')',
                    v_depreciation_amount,
                    'posted',
                    p_user_id,
                    NOW()
                ) RETURNING id INTO v_journal_entry_id;

                -- Create journal entry lines
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
                    v_depreciation_account_id,
                    'debit',
                    v_depreciation_amount,
                    'Depreciation expense: ' || v_asset.asset_name
                );

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
                    v_accumulated_account_id,
                    'credit',
                    v_depreciation_amount,
                    'Accumulated depreciation: ' || v_asset.asset_name
                );

                -- ✅✅✅ CRITICAL FIX: Create depreciation record WITHOUT created_by column
                INSERT INTO asset_depreciations (
                    business_id,
                    asset_id,
                    depreciation_date,
                    period_month,
                    period_year,
                    depreciation_amount,
                    accumulated_depreciation_before,
                    accumulated_depreciation_after,
                    book_value_before,
                    book_value_after,
                    journal_entry_id,
                    is_posted,
                    posted_at,
                    is_historical
                    -- ⚠️ REMOVED: created_by, created_at, updated_at (they have defaults)
                ) VALUES (
                    p_business_id,
                    v_asset.id,
                    LEAST(
                        v_depreciation_date + INTERVAL '1 month' - INTERVAL '1 day',
                        CURRENT_DATE
                    ),
                    p_month,
                    p_year,
                    v_depreciation_amount,
                    v_accumulated_before,
                    v_accumulated_before + v_depreciation_amount,
                    v_book_value_before,
                    v_book_value_before - v_depreciation_amount,
                    v_journal_entry_id,
                    true,
                    NOW(),
                    false
                ) RETURNING id INTO v_new_depreciation_id;

                -- Update asset
                UPDATE assets
                SET
                    current_book_value = v_book_value_before - v_depreciation_amount,
                    accumulated_depreciation = v_accumulated_before + v_depreciation_amount,
                    updated_at = NOW()
                WHERE id = v_asset.id;

                -- Return success result
                RETURN QUERY SELECT
                    v_asset.id,
                    v_asset.asset_code,
                    v_asset.asset_name,
                    v_depreciation_amount,
                    true,
                    CASE
                        WHEN v_asset.use_partial_month_depreciation
                            AND v_asset.purchase_date IS NOT NULL
                            AND EXTRACT(MONTH FROM v_asset.purchase_date) = p_month
                            AND EXTRACT(YEAR FROM v_asset.purchase_date) = p_year
                            AND COALESCE(v_asset.depreciation_start_date, v_asset.acquisition_date, v_asset.purchase_date) <= v_depreciation_date
                        THEN 'Depreciation posted successfully (partial month)'
                        ELSE 'Depreciation posted successfully'
                    END;

            ELSE
                -- No depreciation needed
                RETURN QUERY SELECT
                    v_asset.id,
                    v_asset.asset_code,
                    v_asset.asset_name,
                    0::DECIMAL(15,2),
                    true,
                    'No depreciation calculated';
            END IF;

        EXCEPTION WHEN OTHERS THEN
            -- Return error
            RETURN QUERY SELECT
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                0::DECIMAL(15,2),
                false,
                'Error: ' || SQLERRM;
        END;
    END LOOP;

    RETURN;
END;
$function$;

-- Verify the function was created
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc 
WHERE proname = 'post_monthly_depreciation_partial';
