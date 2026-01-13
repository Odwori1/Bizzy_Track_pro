-- Migration 307: Enhance asset system for real-world scenarios
-- Date: 2026-01-11
-- Purpose: Add support for existing assets and historical depreciation

BEGIN;

-- Add new columns to assets table for existing business support
ALTER TABLE assets ADD COLUMN IF NOT EXISTS acquisition_date DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS existing_accumulated_depreciation DECIMAL(15,2) DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS acquisition_method VARCHAR(50) DEFAULT 'purchase' CHECK (acquisition_method IN ('purchase', 'existing', 'transfer', 'donation', 'construction', 'exchange'));
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_existing_asset BOOLEAN DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS depreciation_start_date DATE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS historical_depreciation_calculated BOOLEAN DEFAULT false;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS initial_book_value DECIMAL(15,2);

-- Set initial values for existing assets (the 3 we already have)
UPDATE assets 
SET 
    acquisition_date = purchase_date,
    initial_book_value = purchase_cost,
    depreciation_start_date = purchase_date,
    acquisition_method = 'purchase',
    is_existing_asset = false
WHERE business_id = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256'
AND acquisition_date IS NULL;

-- Create function to register existing asset (without purchase journal entry)
CREATE OR REPLACE FUNCTION register_existing_asset(
    p_business_id UUID,
    p_asset_data JSONB,
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_asset_id UUID;
    v_asset_code VARCHAR(50);
    v_prefix VARCHAR(10);
    v_next_number INTEGER;
    v_acquisition_date DATE;
    v_initial_book_value DECIMAL(15,2);
    v_existing_depreciation DECIMAL(15,2);
    v_useful_life_months INTEGER;
    v_salvage_value DECIMAL(15,2);
    v_category VARCHAR(100);
    v_purchase_cost DECIMAL(15,2);
BEGIN
    -- Generate asset code
    SELECT SUBSTRING(name FROM 1 FOR 3) INTO v_prefix
    FROM businesses
    WHERE id = p_business_id;

    IF LENGTH(v_prefix) < 3 THEN
        v_prefix := 'AST';
    END IF;

    SELECT COALESCE(MAX(CAST(SUBSTRING(asset_code FROM '[0-9]+$') AS INTEGER)), 0) + 1
    INTO v_next_number
    FROM assets
    WHERE business_id = p_business_id
      AND asset_code ~ ('^' || v_prefix || '-[0-9]+$');

    v_asset_code := v_prefix || '-' || LPAD(v_next_number::TEXT, 4, '0');

    -- Parse input data
    v_acquisition_date := COALESCE(
        (p_asset_data->>'acquisition_date')::DATE,
        (p_asset_data->>'purchase_date')::DATE,
        CURRENT_DATE
    );

    v_initial_book_value := COALESCE(
        (p_asset_data->>'current_book_value')::DECIMAL(15,2),
        (p_asset_data->>'purchase_cost')::DECIMAL(15,2),
        0
    );

    v_existing_depreciation := COALESCE(
        (p_asset_data->>'existing_accumulated_depreciation')::DECIMAL(15,2),
        0
    );

    v_useful_life_months := COALESCE(
        (p_asset_data->>'useful_life_months')::INTEGER,
        (p_asset_data->>'useful_life_years')::INTEGER * 12,
        60  -- Default 5 years
    );

    v_salvage_value := COALESCE(
        (p_asset_data->>'salvage_value')::DECIMAL(15,2),
        0
    );

    v_category := COALESCE(
        p_asset_data->>'category',
        'equipment'
    );

    -- Map 'electronics' to 'computer' for database consistency
    IF v_category = 'electronics' THEN
        v_category := 'computer';
    END IF;

    -- Purchase cost = current book value + accumulated depreciation
    v_purchase_cost := v_initial_book_value + v_existing_depreciation;

    -- Insert the asset WITHOUT creating purchase journal entry
    INSERT INTO assets (
        business_id,
        asset_code,
        asset_name,
        asset_type,
        category,
        acquisition_date,
        purchase_date,
        purchase_cost,
        initial_book_value,
        existing_accumulated_depreciation,
        acquisition_method,
        is_existing_asset,
        depreciation_start_date,
        salvage_value,
        useful_life_months,
        depreciation_method,
        current_book_value,
        accumulated_depreciation,
        location,
        status,
        is_active,
        notes,
        created_by
    ) VALUES (
        p_business_id,
        v_asset_code,
        p_asset_data->>'asset_name',
        COALESCE(p_asset_data->>'asset_type', 'tangible'),
        v_category,
        v_acquisition_date,
        v_acquisition_date, -- For existing assets, purchase_date = acquisition_date
        v_purchase_cost,
        v_initial_book_value,
        v_existing_depreciation,
        'existing',
        true,
        v_acquisition_date,
        v_salvage_value,
        v_useful_life_months,
        COALESCE(p_asset_data->>'depreciation_method', 'straight_line'),
        v_initial_book_value,
        v_existing_depreciation,
        COALESCE(p_asset_data->>'location', ''),
        'active',
        true,
        COALESCE(p_asset_data->>'description', 'Existing asset registered in system'),
        p_user_id
    ) RETURNING id INTO v_asset_id;

    RETURN v_asset_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to calculate and backdate historical depreciation
CREATE OR REPLACE FUNCTION calculate_historical_depreciation(
    p_asset_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    period_month INTEGER,
    period_year INTEGER,
    depreciation_date DATE,
    depreciation_amount DECIMAL(15,2),
    accumulated_depreciation DECIMAL(15,2),
    book_value DECIMAL(15,2)
) AS $$
DECLARE
    v_asset RECORD;
    v_current_date DATE;
    v_month INTEGER;
    v_year INTEGER;
    v_depreciation_amount DECIMAL(15,2);
    v_accumulated DECIMAL(15,2);
    v_book_value DECIMAL(15,2);
    v_has_existing_dep BOOLEAN := false;
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
            SELECT 1 FROM asset_depreciations 
            WHERE asset_id = p_asset_id 
            AND period_month = v_month 
            AND period_year = v_year
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

-- Create function to post historical depreciation
CREATE OR REPLACE FUNCTION post_historical_depreciation(
    p_business_id UUID,
    p_asset_id UUID,
    p_user_id UUID,
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    period_month INTEGER,
    period_year INTEGER,
    depreciation_amount DECIMAL(15,2),
    success BOOLEAN,
    message TEXT
) AS $$
DECLARE
    v_historical RECORD;
    v_depreciation_account_id UUID;
    v_accumulated_account_id UUID;
    v_journal_entry_id UUID;
    v_reference_number VARCHAR(100);
    v_asset RECORD;
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
        ELSE '1495'
      END
      AND is_active = true;

    -- Calculate and post historical depreciation
    FOR v_historical IN 
        SELECT * FROM calculate_historical_depreciation(p_asset_id, p_as_of_date)
    LOOP
        -- Generate reference number
        v_reference_number := 'HIST-DEPR-' || v_asset.asset_code || '-' ||
            LPAD(v_historical.period_year::TEXT, 4, '0') || '-' ||
            LPAD(v_historical.period_month::TEXT, 2, '0');

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
            v_historical.depreciation_date,
            v_reference_number,
            'asset_depreciation_historical',
            p_asset_id::TEXT,
            'Historical Depreciation: ' || v_asset.asset_name || ' (' || v_asset.asset_code || ') for ' || 
            TO_CHAR(v_historical.depreciation_date, 'Month YYYY'),
            v_historical.depreciation_amount,
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
            v_historical.depreciation_amount,
            'Historical depreciation: ' || v_asset.asset_name || ' - ' || 
            TO_CHAR(v_historical.depreciation_date, 'Month YYYY'),
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
            v_historical.depreciation_amount,
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
            v_historical.depreciation_date,
            v_historical.period_month,
            v_historical.period_year,
            v_historical.depreciation_amount,
            v_historical.accumulated_depreciation - v_historical.depreciation_amount,
            v_historical.accumulated_depreciation,
            v_historical.book_value + v_historical.depreciation_amount,
            v_historical.book_value,
            v_journal_entry_id,
            true,
            NOW(),
            true
        );

        -- Return success
        RETURN QUERY SELECT
            v_historical.period_month,
            v_historical.period_year,
            v_historical.depreciation_amount,
            true,
            'Historical depreciation posted for ' || 
            TO_CHAR(v_historical.depreciation_date, 'Month YYYY');
    END LOOP;

    -- Update asset to mark historical depreciation as calculated
    UPDATE assets
    SET historical_depreciation_calculated = true,
        current_book_value = (SELECT book_value FROM calculate_historical_depreciation(p_asset_id, p_as_of_date) 
                             ORDER BY period_year DESC, period_month DESC LIMIT 1),
        accumulated_depreciation = (SELECT accumulated_depreciation FROM calculate_historical_depreciation(p_asset_id, p_as_of_date) 
                                   ORDER BY period_year DESC, period_month DESC LIMIT 1),
        updated_at = NOW()
    WHERE id = p_asset_id;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Add is_historical column to asset_depreciations table
ALTER TABLE asset_depreciations ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT false;

-- Create view for enhanced asset reporting
CREATE OR REPLACE VIEW enhanced_asset_register AS
SELECT
    a.id,
    a.business_id,
    a.asset_code,
    a.asset_name,
    a.asset_type,
    a.category,
    a.acquisition_date,
    a.acquisition_method,
    a.is_existing_asset,
    a.purchase_date,
    a.purchase_cost,
    a.initial_book_value,
    a.existing_accumulated_depreciation,
    a.salvage_value,
    a.useful_life_months,
    a.depreciation_method,
    a.current_book_value,
    a.accumulated_depreciation,
    a.depreciation_start_date,
    a.historical_depreciation_calculated,
    a.serial_number,
    a.model,
    a.manufacturer,
    a.location,
    d.name as department_name,
    a.status,
    a.is_active,
    a.created_at,
    a.updated_at,
    -- Calculated fields
    CASE
        WHEN a.is_existing_asset THEN 'Existing Asset'
        WHEN a.acquisition_method = 'purchase' THEN 'New Purchase'
        ELSE INITCAP(a.acquisition_method)
    END as acquisition_type,
    (a.purchase_cost - a.salvage_value) as depreciable_cost,
    CASE
        WHEN a.useful_life_months > 0
        THEN (a.purchase_cost - a.salvage_value) / a.useful_life_months
        ELSE 0
    END as monthly_depreciation,
    CASE
        WHEN a.useful_life_months > 0 AND (a.purchase_cost - a.salvage_value) > 0
        THEN (a.accumulated_depreciation / (a.purchase_cost - a.salvage_value)) * 100
        ELSE 0
    END as percent_depreciated,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, a.acquisition_date)) * 12
    + EXTRACT(MONTH FROM AGE(CURRENT_DATE, a.acquisition_date)) as months_since_acquisition,
    -- Net book value calculation
    a.current_book_value as net_book_value
FROM assets a
LEFT JOIN departments d ON a.department_id = d.id
WHERE a.is_active = true;

COMMIT;

-- Add comments
COMMENT ON FUNCTION register_existing_asset IS 'Registers an existing asset without creating purchase journal entry';
COMMENT ON FUNCTION calculate_historical_depreciation IS 'Calculates historical depreciation for assets acquired before system implementation';
COMMENT ON FUNCTION post_historical_depreciation IS 'Posts historical depreciation entries for existing assets';
COMMENT ON VIEW enhanced_asset_register IS 'Enhanced asset register with support for existing assets and historical depreciation';
