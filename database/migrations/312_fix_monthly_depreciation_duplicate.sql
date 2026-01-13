-- Migration 312: Fix monthly depreciation duplicate constraint issue
-- Date: 2026-01-12
-- Purpose: Fix duplicate key constraint in monthly depreciation posting

BEGIN;

-- First, let's check what journal entries exist for asset depreciation
-- This is just for debugging
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM journal_entries
    WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
    AND reference_type = 'asset_depreciation';
    
    RAISE NOTICE 'Found % asset depreciation journal entries', v_count;
END $$;

-- Update the post_monthly_depreciation function to generate unique reference_id
-- The issue is that reference_id is the asset_id as text, and we can't have multiple
-- depreciation entries for the same asset in the same period
-- Actually, reference_id should be unique per depreciation entry, not per asset

-- Let me check the current function structure first
-- The issue is in the journal_entries insert where reference_id = v_asset.id::TEXT
-- But we're creating multiple entries for the same asset in a loop!
-- Each needs a unique reference_id

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
    v_unique_suffix VARCHAR(10);
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
                RAISE EXCEPTION 'Accumulated Depreciation account not found for category: %', v_asset.category;
            END IF;

            -- Generate unique reference number with timestamp suffix
            v_unique_suffix := EXTRACT(EPOCH FROM NOW())::BIGINT % 10000;
            v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                LPAD(p_year::TEXT, 4, '0') || '-' ||
                LPAD(p_month::TEXT, 2, '0') || '-' ||
                LPAD(v_unique_suffix::TEXT, 4, '0');

            -- Create journal entry for depreciation
            -- Use a unique reference_id by combining asset_id with timestamp
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
                v_asset.id::TEXT || '-' || v_unique_suffix::TEXT, -- Make reference_id unique
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
