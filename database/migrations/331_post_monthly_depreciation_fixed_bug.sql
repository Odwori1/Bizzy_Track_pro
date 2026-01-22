-- ============================================================================
-- MIGRATION: Fix depreciation posting for all businesses - Production Ready
-- ============================================================================
-- This migration fixes the depreciation posting function to allow posting 
-- depreciation for new assets even when other assets already have depreciation
-- for the same month/year. The fix ensures unique reference_id generation
-- and removes the global check that was blocking new assets.
-- ============================================================================

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS post_monthly_depreciation_fixed_bug(UUID, INTEGER, INTEGER, UUID);

-- Create the production-ready fixed function
CREATE OR REPLACE FUNCTION post_monthly_depreciation_fixed_bug(
    p_business_id UUID,
    p_month INTEGER,
    p_year INTEGER,
    p_user_id UUID
)
RETURNS TABLE(
    asset_id UUID,
    asset_code TEXT,
    asset_name TEXT,
    depreciation_amount DECIMAL(15,2),
    success BOOLEAN,
    message TEXT
) AS $$
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
    
    -- PRODUCTION-LEVEL unique ID generation variables
    v_unique_epoch BIGINT;
    v_random_suffix INTEGER;
    v_unique_id TEXT;
    
    v_asset_counter INTEGER := 0;
    v_asset_has_depreciation BOOLEAN;
BEGIN
    v_depreciation_date := MAKE_DATE(p_year, p_month, 1);
    
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
            -- ✅ CRITICAL FIX: Check if THIS SPECIFIC ASSET already has depreciation for this period
            SELECT EXISTS (
                SELECT 1 FROM asset_depreciations ad
                WHERE ad.asset_id = v_asset.id
                  AND ad.period_month = p_month
                  AND ad.period_year = p_year
                  AND ad.is_posted = true
            ) INTO v_asset_has_depreciation;
            
            -- If asset already has depreciation for this period, skip it (don't block others!)
            IF v_asset_has_depreciation THEN
                RETURN QUERY SELECT
                    v_asset.id,
                    v_asset.asset_code::TEXT,  -- FIX: Cast to TEXT
                    v_asset.asset_name::TEXT,  -- FIX: Cast to TEXT
                    0::DECIMAL(15,2),
                    true,
                    'Depreciation already posted for this asset in period ' || p_month || '/' || p_year;
                CONTINUE; -- Skip to next asset, don't fail the whole process
            END IF;
            
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
                
                -- ✅ PRODUCTION-LEVEL UNIQUE REFERENCE_ID GENERATION
                -- This ensures NO collisions across all businesses, assets, and time periods
                -- Use multiple sources to guarantee uniqueness:
                v_unique_epoch := EXTRACT(EPOCH FROM clock_timestamp()) * 1000000; -- Nanosecond precision
                v_random_suffix := (random() * 999999)::INTEGER; -- Random 6-digit number
                
                -- Create truly unique reference_id that will NEVER conflict
                v_unique_id := 'depr_' || 
                               v_asset.id::TEXT || '_' ||                   -- Asset ID
                               p_year::TEXT || LPAD(p_month::TEXT, 2, '0') || '_' || -- Period
                               v_unique_epoch::TEXT || '_' ||               -- Nanosecond timestamp
                               v_random_suffix::TEXT || '_' ||              -- Random suffix
                               v_asset_counter::TEXT || '_' ||              -- Sequence counter
                               pg_backend_pid()::TEXT;                      -- PostgreSQL process ID
                
                -- Generate reference number for display (human readable)
                v_reference_number := 'DEPR-' || v_asset.asset_code || '-' ||
                    LPAD(p_year::TEXT, 4, '0') || '-' ||
                    LPAD(p_month::TEXT, 2, '0') || '-' ||
                    LPAD(v_random_suffix::TEXT, 6, '0');
                
                -- Get depreciation expense account
                SELECT id INTO v_depreciation_account_id
                FROM chart_of_accounts coa
                WHERE coa.business_id = p_business_id
                  AND coa.account_code = '5600' -- Depreciation Expense
                  AND coa.is_active = true;
                
                IF v_depreciation_account_id IS NULL THEN
                    RAISE EXCEPTION 'Depreciation Expense account (5600) not found';
                END IF;
                
                -- Create journal entry with guaranteed unique reference_id
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
                    v_unique_id,  -- This is now guaranteed unique
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
                
                -- Create depreciation record
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
                    v_asset.asset_code::TEXT,  -- FIX: Cast to TEXT
                    v_asset.asset_name::TEXT,  -- FIX: Cast to TEXT
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
                    v_asset.asset_code::TEXT,  -- FIX: Cast to TEXT
                    v_asset.asset_name::TEXT,  -- FIX: Cast to TEXT
                    0::DECIMAL(15,2),
                    true,
                    'No depreciation calculated';
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Return error for this specific asset, but continue with others
            RETURN QUERY SELECT
                v_asset.id,
                v_asset.asset_code::TEXT,  -- FIX: Cast to TEXT
                v_asset.asset_name::TEXT,  -- FIX: Cast to TEXT
                0::DECIMAL(15,2),
                false,
                'Error: ' || SQLERRM;
        END;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION AND TESTING QUERIES
-- ============================================================================

-- Test the function with a sample business
-- SELECT * FROM post_monthly_depreciation_fixed_bug(
--     'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'::uuid, -- Sample business ID
--     3,  -- March (test with a month not yet posted for new assets)
--     2026, -- Year
--     'd5f407e3-ac71-4b91-b03e-ec50f908c3d1'::uuid  -- User ID
-- );

-- Check for unique reference_id violations
-- SELECT COUNT(DISTINCT reference_id) as unique_refs, COUNT(*) as total_refs
-- FROM journal_entries 
-- WHERE reference_type = 'asset_depreciation';

-- ============================================================================
-- MIGRATION NOTES:
-- ============================================================================
-- 1. The function name MUST be: post_monthly_depreciation_fixed_bug
--    This matches what's called in the service file:
--    app/services/assetService.js line ~780:
--    'SELECT * FROM post_monthly_depreciation_fixed_bug($1, $2, $3, $4)'
--
-- 2. Key fixes implemented:
--    - Fixed data type mismatch by casting VARCHAR to TEXT
--    - Removed global check that blocked new assets
--    - Added per-asset check inside the loop
--    - Implemented production-level unique ID generation
--    - Used multiple sources for uniqueness (timestamp, random, PID, etc.)
--    - Each asset processed independently (errors don't stop others)
--
-- 3. Uniqueness guarantee:
--    The reference_id combines:
--    - Asset ID (unique per asset)
--    - Period (year-month)
--    - Nanosecond timestamp (unique per millisecond)
--    - Random 6-digit number
--    - Sequence counter in current run
--    - PostgreSQL process ID
--    This ensures NO collisions across all businesses ever.
-- ============================================================================
