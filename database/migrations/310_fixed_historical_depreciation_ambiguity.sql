-- Migration 310: Fix historical depreciation function ambiguity (FIXED VERSION)
-- Date: 2026-01-12
-- Purpose: Fix ambiguous column references in historical depreciation functions

BEGIN;

-- First drop the existing functions
DROP FUNCTION IF EXISTS calculate_historical_depreciation(UUID, DATE);
DROP FUNCTION IF EXISTS post_historical_depreciation(UUID, UUID, UUID, DATE);

-- Now recreate calculate_historical_depreciation function
CREATE OR REPLACE FUNCTION calculate_historical_depreciation(
    p_asset_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    calc_period_month INTEGER,
    calc_period_year INTEGER,
    calc_depreciation_date DATE,
    calc_depreciation_amount DECIMAL(15,2),
    calc_accumulated_depreciation DECIMAL(15,2),
    calc_book_value DECIMAL(15,2)
) AS $$
DECLARE
    v_asset RECORD;
    v_current_date DATE;
    v_month INTEGER;
    v_year INTEGER;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated DECIMAL(15,2);
    v_book_value DECIMAL(15,2);
BEGIN
    -- Get asset details
    SELECT * INTO v_asset
    FROM assets
    WHERE id = p_asset_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Start from depreciation start date or acquisition date
    v_current_date := COALESCE(v_asset.depreciation_start_date, v_asset.acquisition_date, v_asset.purchase_date);
    
    -- If asset has existing depreciation, start from there
    v_accumulated := COALESCE(v_asset.existing_accumulated_depreciation, 0);
    v_book_value := COALESCE(v_asset.initial_book_value, v_asset.purchase_cost) - v_accumulated;
    
    -- Don't go past the as_of_date
    WHILE v_current_date <= LEAST(p_as_of_date, CURRENT_DATE) LOOP
        v_month := EXTRACT(MONTH FROM v_current_date);
        v_year := EXTRACT(YEAR FROM v_current_date);

        -- Skip if depreciation already posted for this period
        IF NOT EXISTS (
            SELECT 1 FROM asset_depreciations ad
            WHERE ad.asset_id = p_asset_id 
            AND ad.period_month = v_month 
            AND ad.period_year = v_year
        ) THEN
            -- Calculate depreciation for this month
            v_depreciation_amount := calculate_monthly_depreciation(
                p_asset_id,
                v_month,
                v_year
            );

            IF v_depreciation_amount > 0 THEN
                v_accumulated := v_accumulated + v_depreciation_amount;
                v_book_value := v_book_value - v_depreciation_amount;

                RETURN QUERY SELECT
                    v_month,
                    v_year,
                    v_current_date,
                    v_depreciation_amount,
                    v_accumulated,
                    v_book_value;
            END IF;
        END IF;

        -- Move to next month
        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Recreate post_historical_depreciation function
CREATE OR REPLACE FUNCTION post_historical_depreciation(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    posted_period_month INTEGER,
    posted_period_year INTEGER,
    posted_depreciation_amount DECIMAL(15,2),
    posted_success BOOLEAN,
    posted_message TEXT
) AS $$
DECLARE
    v_historical RECORD;
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_asset RECORD;
    v_month INTEGER;
    v_year INTEGER;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated DECIMAL(15,2);
    v_book_value DECIMAL(15,2);
    v_current_date DATE;
BEGIN
    -- Get asset details
    SELECT * INTO v_asset
    FROM assets
    WHERE id = p_asset_id AND business_id = p_business_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found or access denied';
    END IF;

    -- Get depreciation expense account
    SELECT id INTO v_depreciation_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = '5600'
      AND is_active = true;

    IF v_depreciation_account_id IS NULL THEN
        RAISE EXCEPTION 'Depreciation expense account (5600) not found';
    END IF;

    -- Get appropriate accumulated depreciation account
    SELECT id INTO v_accumulated_account_id
    FROM chart_of_accounts
    WHERE business_id = p_business_id
      AND account_code = CASE v_asset.category
        WHEN 'building' THEN '1490'
        WHEN 'vehicle' THEN '1491'
        WHEN 'equipment' THEN '1492'
        WHEN 'furniture' THEN '1493'
        WHEN 'computer' THEN '1494'
        WHEN 'software' THEN '1494'
        WHEN 'electronics' THEN '1494'
        ELSE '1495'
      END
      AND is_active = true;

    IF v_accumulated_account_id IS NULL THEN
        -- Fallback to general accumulated depreciation
        SELECT id INTO v_accumulated_account_id
        FROM chart_of_accounts
        WHERE business_id = p_business_id
          AND account_code = '1495'
          AND is_active = true;
    END IF;

    IF v_accumulated_account_id IS NULL THEN
        RAISE EXCEPTION 'Accumulated depreciation account not found';
    END IF;

    -- Start from depreciation start date
    v_current_date := COALESCE(v_asset.depreciation_start_date, v_asset.acquisition_date, v_asset.purchase_date);
    v_accumulated := COALESCE(v_asset.existing_accumulated_depreciation, 0);
    v_book_value := COALESCE(v_asset.initial_book_value, v_asset.purchase_cost) - v_accumulated;

    -- Loop through months
    WHILE v_current_date <= LEAST(p_as_of_date, CURRENT_DATE) LOOP
        v_month := EXTRACT(MONTH FROM v_current_date);
        v_year := EXTRACT(YEAR FROM v_current_date);

        -- Skip if depreciation already posted for this period
        IF NOT EXISTS (
            SELECT 1 FROM asset_depreciations ad
            WHERE ad.asset_id = p_asset_id 
            AND ad.period_month = v_month 
            AND ad.period_year = v_year
        ) THEN
            -- Calculate depreciation for this month
            v_depreciation_amount := calculate_monthly_depreciation(
                p_asset_id,
                v_month,
                v_year
            );

            IF v_depreciation_amount > 0 THEN
                v_accumulated := v_accumulated + v_depreciation_amount;
                v_book_value := v_book_value - v_depreciation_amount;

                -- Generate reference number
                v_reference_number := 'HIST-DEPR-' || v_asset.asset_code || '-' ||
                    LPAD(v_year::TEXT, 4, '0') || '-' ||
                    LPAD(v_month::TEXT, 2, '0');

                -- Create journal entry for historical depreciation
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
                    posted_at,
                    is_adjusting_entry
                ) VALUES (
                    p_business_id,
                    v_current_date,
                    v_reference_number,
                    'asset_depreciation_historical',
                    p_asset_id::TEXT,
                    'Historical Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ') for ' || 
                    TO_CHAR(v_current_date, 'Month YYYY'),
                    v_depreciation_amount,
                    'posted',
                    p_user_id,
                    NOW(),
                    true
                ) RETURNING id INTO v_journal_entry_id;

                -- Debit: Depreciation Expense
                INSERT INTO journal_entry_lines (
                    business_id,
                    journal_entry_id,
                    account_id,
                    line_type,
                    amount,
                    description,
                    is_adjusting_entry
                ) VALUES (
                    p_business_id,
                    v_journal_entry_id,
                    v_depreciation_account_id,
                    'debit',
                    v_depreciation_amount,
                    'Historical depreciation: ' || v_asset.asset_name || ' - ' || 
                    TO_CHAR(v_current_date, 'Month YYYY'),
                    true
                );

                -- Credit: Accumulated Depreciation
                INSERT INTO journal_entry_lines (
                    business_id,
                    journal_entry_id,
                    account_id,
                    line_type,
                    amount,
                    description,
                    is_adjusting_entry
                ) VALUES (
                    p_business_id,
                    v_journal_entry_id,
                    v_accumulated_account_id,
                    'credit',
                    v_depreciation_amount,
                    'Historical accumulated depreciation: ' || v_asset.asset_name,
                    true
                );

                -- Record in asset_depreciations table (marked as historical)
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
                ) VALUES (
                    p_business_id,
                    p_asset_id,
                    v_current_date,
                    v_month,
                    v_year,
                    v_depreciation_amount,
                    v_accumulated - v_depreciation_amount,
                    v_accumulated,
                    v_book_value + v_depreciation_amount,
                    v_book_value,
                    v_journal_entry_id,
                    true,
                    NOW(),
                    true
                );

                -- Return success
                RETURN QUERY SELECT
                    v_month,
                    v_year,
                    v_depreciation_amount,
                    true,
                    'Historical depreciation posted for ' || 
                    TO_CHAR(v_current_date, 'Month YYYY');
            END IF;
        END IF;

        -- Move to next month
        v_current_date := v_current_date + INTERVAL '1 month';
    END LOOP;

    -- Update asset to mark historical depreciation as calculated
    UPDATE assets
    SET historical_depreciation_calculated = true,
        current_book_value = v_book_value,
        accumulated_depreciation = v_accumulated,
        updated_at = NOW()
    WHERE id = p_asset_id;

    RETURN;
END;
$$ LANGUAGE plpgsql;

COMMIT;
