-- Migration 305: Complete fix for depreciation functions
-- Date: 2026-01-11
-- Purpose: Fix all issues in depreciation functions (ambiguous columns, GROUP BY issues)

BEGIN;

-- First, drop the existing functions to recreate them
DROP FUNCTION IF EXISTS calculate_monthly_depreciation(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS post_monthly_depreciation(UUID, INTEGER, INTEGER, UUID);

-- Create fixed calculate_monthly_depreciation function
CREATE OR REPLACE FUNCTION calculate_monthly_depreciation(
    p_asset_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_asset RECORD;
    v_months_passed INTEGER;
    v_depreciation_amount DECIMAL(15,2);
    v_book_value DECIMAL(15,2);
    v_previous_month INTEGER;
    v_previous_year INTEGER;
    v_previous_depreciation RECORD;
BEGIN
    -- Get asset details
    SELECT * INTO v_asset
    FROM assets
    WHERE id = p_asset_id
      AND is_active = true
      AND status IN ('active', 'idle');

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Check if asset is fully depreciated
    IF v_asset.current_book_value <= v_asset.salvage_value THEN
        RETURN 0;
    END IF;

    -- Calculate months passed since purchase
    v_months_passed := (p_year - EXTRACT(YEAR FROM v_asset.purchase_date)) * 12
                       + (p_month - EXTRACT(MONTH FROM v_asset.purchase_date));

    IF v_months_passed < 1 THEN
        RETURN 0; -- Not yet time for depreciation
    END IF;

    -- Calculate previous month/year
    IF p_month = 1 THEN
        v_previous_month := 12;
        v_previous_year := p_year - 1;
    ELSE
        v_previous_month := p_month - 1;
        v_previous_year := p_year;
    END IF;

    -- Get previous depreciation record if exists
    SELECT book_value_after INTO v_previous_depreciation
    FROM asset_depreciations
    WHERE asset_id = p_asset_id
      AND period_year = v_previous_year
      AND period_month = v_previous_month
      AND is_posted = true
    LIMIT 1;

    -- Determine current book value
    IF FOUND THEN
        v_book_value := v_previous_depreciation.book_value_after;
    ELSE
        v_book_value := v_asset.purchase_cost;
    END IF;

    -- Calculate depreciation based on method
    IF v_asset.depreciation_method = 'straight_line' THEN
        -- Straight-line depreciation
        v_depreciation_amount := (v_asset.purchase_cost - v_asset.salvage_value)
                               / v_asset.useful_life_months;

        -- Don't depreciate below salvage value
        IF v_book_value - v_depreciation_amount < v_asset.salvage_value THEN
            v_depreciation_amount := v_book_value - v_asset.salvage_value;
        END IF;

    ELSE -- Declining balance method
        -- Calculate declining balance rate if not set
        IF v_asset.depreciation_rate IS NULL THEN
            -- Double declining balance: 2 / useful life in years
            v_asset.depreciation_rate := (2.0 / (v_asset.useful_life_months / 12.0)) * 100;
        END IF;

        -- Monthly depreciation
        v_depreciation_amount := v_book_value * (v_asset.depreciation_rate / 100 / 12);

        -- Don't depreciate below salvage value
        IF v_book_value - v_depreciation_amount < v_asset.salvage_value THEN
            v_depreciation_amount := v_book_value - v_asset.salvage_value;
        END IF;
    END IF;

    -- Ensure non-negative
    v_depreciation_amount := GREATEST(v_depreciation_amount, 0);

    RETURN v_depreciation_amount;
END;
$$ LANGUAGE plpgsql;

-- Create fixed post_monthly_depreciation function
CREATE OR REPLACE FUNCTION post_monthly_depreciation(
    p_business_id UUID,
    p_month INTEGER,
    p_year INTEGER,
    p_user_id UUID
)
RETURNS TABLE(
    asset_id UUID,
    asset_code VARCHAR,
    asset_name VARCHAR,
    depreciation_amount DECIMAL(15,2),
    success BOOLEAN,
    message TEXT
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
BEGIN
    -- Check if month/year is valid
    IF p_month < 1 OR p_month > 12 OR p_year < 2000 OR p_year > 2100 THEN
        RAISE EXCEPTION 'Invalid month/year: %/%', p_month, p_year;
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
        RAISE EXCEPTION 'Depreciation already posted for %/%', p_month, p_year;
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
        -- Calculate depreciation for this asset
        v_depreciation_amount := calculate_monthly_depreciation(
            v_asset.id,
            p_month,
            p_year
        );

        IF v_depreciation_amount > 0 THEN
            -- Get previous accumulated depreciation (using subquery to avoid GROUP BY issues)
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
                RAISE EXCEPTION 'Accumulated Depreciation account not found for category: %', v_asset.category;
            END IF;

            -- Generate reference number
            v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                LPAD(p_year::TEXT, 4, '0') || '-' ||
                LPAD(p_month::TEXT, 2, '0');

            -- Create journal entry for depreciation
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
                MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
                v_reference_number,
                'asset_depreciation',
                v_asset.id::TEXT,
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

            -- Record depreciation in asset_depreciations table
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
                MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day',
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

            -- Return success
            RETURN QUERY SELECT
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                v_depreciation_amount,
                true,
                'Depreciation posted successfully';
        ELSE
            -- Return no depreciation needed
            RETURN QUERY SELECT
                v_asset.id,
                v_asset.asset_code,
                v_asset.asset_name,
                0::DECIMAL(15,2),
                true,
                'No depreciation calculated (below salvage or not started)';
        END IF;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMIT;
