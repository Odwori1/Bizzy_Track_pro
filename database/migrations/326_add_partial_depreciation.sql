-- Migration: Add partial period depreciation support
-- File: 504_add_partial_depreciation.sql

-- Add column to track if asset should use partial month depreciation
ALTER TABLE assets ADD COLUMN IF NOT EXISTS use_partial_month_depreciation BOOLEAN DEFAULT false;

-- Add column to track purchase day for partial depreciation calculation
ALTER TABLE assets ADD COLUMN IF NOT EXISTS purchase_day INTEGER;

-- Update existing assets: set purchase_day from purchase_date
UPDATE assets 
SET purchase_day = EXTRACT(DAY FROM purchase_date)
WHERE purchase_date IS NOT NULL AND purchase_day IS NULL;

-- Create function for partial month depreciation calculation
-- This wraps the existing calculate_monthly_depreciation function
CREATE OR REPLACE FUNCTION calculate_monthly_depreciation_with_partial(
    p_asset_id UUID,
    p_month INTEGER,
    p_year INTEGER
)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_asset RECORD;
    v_purchase_date DATE;
    v_depreciation_date DATE;
    v_days_in_month INTEGER;
    v_days_depreciated INTEGER;
    v_full_month_depreciation DECIMAL(15,2);
    v_partial_depreciation DECIMAL(15,2);
    v_depreciation_start_date DATE;
BEGIN
    -- Get asset details
    SELECT * INTO v_asset
    FROM assets 
    WHERE id = p_asset_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    -- Calculate normal depreciation using the existing function
    v_full_month_depreciation := calculate_monthly_depreciation(p_asset_id, p_month, p_year);
    
    -- If not using partial depreciation or no purchase day, return normal amount
    IF NOT v_asset.use_partial_month_depreciation 
       OR v_asset.purchase_day IS NULL 
       OR v_asset.purchase_date IS NULL THEN
        RETURN v_full_month_depreciation;
    END IF;
    
    v_purchase_date := v_asset.purchase_date;
    v_depreciation_date := MAKE_DATE(p_year, p_month, 1);
    
    -- Determine depreciation start date (same logic as existing function)
    v_depreciation_start_date := COALESCE(
        v_asset.depreciation_start_date,
        v_asset.acquisition_date,
        v_asset.purchase_date
    );
    
    -- Check if it's the purchase month AND the first month of depreciation
    IF EXTRACT(MONTH FROM v_purchase_date) = p_month 
       AND EXTRACT(YEAR FROM v_purchase_date) = p_year
       AND v_depreciation_start_date <= v_depreciation_date THEN
        
        -- Get days in month
        v_days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('MONTH', v_depreciation_date) + INTERVAL '1 MONTH - 1 DAY'));
        
        -- Calculate days from purchase date to end of month
        v_days_depreciated := v_days_in_month - EXTRACT(DAY FROM v_purchase_date) + 1;
        
        -- Ensure we don't depreciate more days than in the month
        v_days_depreciated := LEAST(GREATEST(v_days_depreciated, 1), v_days_in_month);
        
        -- Calculate partial depreciation
        v_partial_depreciation := (v_full_month_depreciation * v_days_depreciated) / v_days_in_month;
        
        -- Don't depreciate below salvage value
        IF v_asset.current_book_value - v_partial_depreciation < COALESCE(v_asset.salvage_value, 0) THEN
            v_partial_depreciation := GREATEST(v_asset.current_book_value - COALESCE(v_asset.salvage_value, 0), 0);
        END IF;
        
        RETURN ROUND(GREATEST(0, v_partial_depreciation), 2);
    END IF;
    
    -- For non-purchase months, return normal depreciation
    RETURN v_full_month_depreciation;
END;
$$ LANGUAGE plpgsql;

-- Create a NEW function for partial depreciation (don't replace existing ones)
CREATE OR REPLACE FUNCTION post_monthly_depreciation_partial(
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
    
    -- Get depreciation expense account (using same logic as existing function)
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
                -- Get previous accumulated depreciation (same logic as existing function)
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
                
                -- Get appropriate accumulated depreciation account (same as existing)
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
                
                -- Create journal entry (using same date fix as existing function)
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
                
                -- Create depreciation record with ALL required columns
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
                    created_by,
                    is_historical,
                    created_at,
                    updated_at
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
                    p_user_id,
                    false, -- is_historical
                    NOW(),
                    NOW()
                ) RETURNING id INTO v_new_depreciation_id;
                
                -- Update asset
                UPDATE assets
                SET 
                    current_book_value = v_book_value_before - v_depreciation_amount,
                    accumulated_depreciation = v_accumulated_before + v_depreciation_amount,
                    updated_at = NOW()
                WHERE id = v_asset.id;
                
                -- Return result (matching existing function pattern)
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
            -- Return error (matching existing function pattern)
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
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON COLUMN assets.use_partial_month_depreciation IS 'If true, calculates partial depreciation for purchase month based on purchase day';
COMMENT ON COLUMN assets.purchase_day IS 'Day of month when asset was purchased, for partial depreciation calculation';
COMMENT ON FUNCTION calculate_monthly_depreciation_with_partial IS 'Calculates depreciation with support for partial months based on purchase day';
COMMENT ON FUNCTION post_monthly_depreciation_partial IS 'Posts monthly depreciation with partial month support (alternative to post_monthly_depreciation_date_fixed)';
