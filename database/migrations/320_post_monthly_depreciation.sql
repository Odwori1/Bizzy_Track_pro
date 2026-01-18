-- First, create a backup of the original function
COMMENT ON FUNCTION post_monthly_depreciation(uuid,integer,integer,uuid) 
IS 'Original version before date fix on 2026-01-17';

-- Now create the fixed version
CREATE OR REPLACE FUNCTION post_monthly_depreciation_date_fixed(
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
) AS $$
DECLARE
    v_asset RECORD;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated_before DECIMAL(15,2);
    v_accumulated_after DECIMAL(15,2);
    v_book_value_before DECIMAL(15,2);
    v_book_value_after DECIMAL(15,2);
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_has_depreciation BOOLEAN;
    v_previous_depreciation RECORD;
    v_unique_suffix VARCHAR(20);
    v_transaction_trace_id VARCHAR(100);
    v_asset_counter INTEGER := 0;
    v_success_counter INTEGER := 0;
BEGIN
    -- Generate transaction trace ID
    v_transaction_trace_id := 'month_' || REPLACE(gen_random_uuid()::TEXT, '-', '_') || '_' ||
                             EXTRACT(EPOCH FROM NOW())::BIGINT::TEXT;

    RAISE NOTICE '[%] Starting monthly depreciation for %/%',
        v_transaction_trace_id, p_month, p_year;

    -- Check if month/year is valid
    IF p_month < 1 OR p_month > 12 OR p_year < 2000 OR p_year > 2100 THEN
        RAISE EXCEPTION '[%] Invalid month/year: %/%', v_transaction_trace_id, p_month, p_year;
    END IF;

    -- Check if depreciation already posted for this period
    SELECT EXISTS (
        SELECT 1 FROM asset_depreciations ad
        WHERE ad.business_id = p_business_id
          AND ad.period_month = p_month
          AND ad.period_year = p_year
          AND ad.is_posted = true
    ) INTO v_has_depreciation;

    IF v_has_depreciation THEN
        RAISE EXCEPTION '[%] Depreciation already posted for %/%', v_transaction_trace_id, p_month, p_year;
    END IF;

    -- Get depreciation expense account
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts coa
    WHERE coa.business_id = p_business_id
      AND coa.account_code = '5600' -- Depreciation Expense
      AND coa.is_active = true;

    IF v_depreciation_account_id IS NULL THEN
        RAISE EXCEPTION '[%] Depreciation Expense account (5600) not found', v_transaction_trace_id;
    END IF;

    -- Loop through all active assets
    FOR v_asset IN
        SELECT a.* FROM assets a
        WHERE a.business_id = p_business_id
          AND a.is_active = true
          AND a.status IN ('active', 'idle')
          AND a.purchase_cost > 0
          AND a.useful_life_months > 0
        ORDER BY a.asset_code
    LOOP
        v_asset_counter := v_asset_counter + 1;

        -- Calculate depreciation for this asset
        v_depreciation_amount := calculate_monthly_depreciation(
            v_asset.id,
            p_month,
            p_year
        );

        IF v_depreciation_amount > 0 THEN
            -- Get previous accumulated depreciation
            SELECT ad.accumulated_depreciation_after INTO v_previous_depreciation
            FROM asset_depreciations ad
            WHERE ad.asset_id = v_asset.id
              AND ad.is_posted = true
              AND (ad.period_year < p_year OR (ad.period_year = p_year AND ad.period_month < p_month))
            ORDER BY ad.period_year DESC, ad.period_month DESC
            LIMIT 1;

            IF FOUND THEN
                v_accumulated_before := v_previous_depreciation.accumulated_depreciation_after;
                v_book_value_before := v_asset.purchase_cost - v_accumulated_before;
            ELSE
                v_accumulated_before := 0;
                v_book_value_before := v_asset.purchase_cost;
            END IF;

            v_accumulated_after := v_accumulated_before + v_depreciation_amount;
            v_book_value_after := v_book_value_before - v_depreciation_amount;

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
                -- Fallback to general accumulated depreciation
                SELECT id INTO v_accumulated_account_id
                FROM chart_of_accounts coa
                WHERE coa.business_id = p_business_id
                  AND coa.account_code = '1495'
                  AND coa.is_active = true;
            END IF;

            IF v_accumulated_account_id IS NULL THEN
                RAISE EXCEPTION '[%] Accumulated Depreciation account not found for category: %',
                    v_transaction_trace_id, v_asset.category;
            END IF;

            -- Generate GUARANTEED UNIQUE reference ID
            v_unique_suffix := (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000 +
                               (random() * 999)::INTEGER +
                               v_asset_counter) % 1000000;

            v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                LPAD(p_year::TEXT, 4, '0') || '-' ||
                LPAD(p_month::TEXT, 2, '0') || '-' ||
                LPAD(v_unique_suffix::TEXT, 6, '0');

            RAISE NOTICE '[%] Processing asset % (%): depreciation %, reference: %',
                v_transaction_trace_id, v_asset.asset_code, v_asset_counter, v_depreciation_amount, v_reference_number;

            -- ✅✅✅ CRITICAL FIX: Use LEAST(end_of_month, CURRENT_DATE) to avoid future dates
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
                -- FIXED: Prevents future date constraint violation
                LEAST(
                    MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
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

            -- Debit: Depreciation Expense
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

            -- Credit: Accumulated Depreciation
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

            -- ✅✅✅ CRITICAL FIX: Use same date fix here
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
                posted_at
            ) VALUES (
                p_business_id,
                v_asset.id,
                -- FIXED: Same date logic
                LEAST(
                    MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
                    CURRENT_DATE
                ),
                p_month,
                p_year,
                v_depreciation_amount,
                v_accumulated_before,
                v_accumulated_after,
                v_book_value_before,
                v_book_value_after,
                v_journal_entry_id,
                true,
                NOW()
            );

            -- Update asset's current book value and accumulated depreciation
            UPDATE assets
            SET
                current_book_value = v_book_value_after,
                accumulated_depreciation = v_accumulated_after,
                updated_at = NOW()
            WHERE id = v_asset.id;

            v_success_counter := v_success_counter + 1;

            -- Return success
            asset_id := v_asset.id;
            asset_code := v_asset.asset_code;
            asset_name := v_asset.asset_name;
            depreciation_amount := v_depreciation_amount;
            success := true;
            message := 'Depreciation posted successfully';
            RETURN NEXT;
        ELSE
            -- Return no depreciation needed
            asset_id := v_asset.id;
            asset_code := v_asset.asset_code;
            asset_name := v_asset.asset_name;
            depreciation_amount := 0;
            success := true;
            message := 'No depreciation calculated (below salvage or not started)';
            RETURN NEXT;
        END IF;
    END LOOP;

    RAISE NOTICE '[%] Completed: % assets processed, % posted successfully',
        v_transaction_trace_id, v_asset_counter, v_success_counter;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '[%] ERROR: %', v_transaction_trace_id, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql;
