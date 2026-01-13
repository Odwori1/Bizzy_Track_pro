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
    v_depreciation_start_date DATE;
    v_current_date DATE;
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

    -- Determine depreciation start date
    v_depreciation_start_date := COALESCE(
        v_asset.depreciation_start_date,
        v_asset.acquisition_date,
        v_asset.purchase_date
    );
    
    v_current_date := MAKE_DATE(p_year, p_month, 1);
    
    -- Check if depreciation should have started
    IF v_current_date < v_depreciation_start_date THEN
        RETURN 0; -- Not yet time for depreciation
    END IF;

    -- Calculate months passed since depreciation start
    v_months_passed := (p_year - EXTRACT(YEAR FROM v_depreciation_start_date)) * 12
                       + (p_month - EXTRACT(MONTH FROM v_depreciation_start_date));
    
    IF v_months_passed < 1 THEN
        RETURN 0; -- First month hasn't completed
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

    -- Determine current book value (FIXED!)
    IF FOUND THEN
        -- Use previous book value
        v_book_value := v_previous_depreciation.book_value_after;
    ELSE
        -- First depreciation entry for this asset
        IF v_asset.is_existing_asset = true AND v_asset.initial_book_value IS NOT NULL THEN
            -- For existing assets: start from initial_book_value
            v_book_value := v_asset.initial_book_value;
        ELSE
            -- For new assets: start from purchase_cost
            v_book_value := v_asset.purchase_cost;
        END IF;
    END IF;

    -- Calculate depreciation based on method (FIXED!)
    IF v_asset.depreciation_method = 'straight_line' THEN
        -- CORRECTED: Use appropriate base value
        IF v_asset.is_existing_asset = true AND v_asset.initial_book_value IS NOT NULL THEN
            -- Existing asset: depreciate from initial_book_value
            v_depreciation_amount := (v_asset.initial_book_value - v_asset.salvage_value)
                                   / v_asset.useful_life_months;
        ELSE
            -- New asset: depreciate from purchase_cost
            v_depreciation_amount := (v_asset.purchase_cost - v_asset.salvage_value)
                                   / v_asset.useful_life_months;
        END IF;

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

        -- Monthly depreciation (based on current book value)
        v_depreciation_amount := v_book_value * (v_asset.depreciation_rate / 100 / 12);

        -- Don't depreciate below salvage value
        IF v_book_value - v_depreciation_amount < v_asset.salvage_value THEN
            v_depreciation_amount := v_book_value - v_asset.salvage_value;
        END IF;
    END IF;

    -- Ensure non-negative
    v_depreciation_amount := GREATEST(v_depreciation_amount, 0);

    -- Round to 2 decimal places
    v_depreciation_amount := ROUND(v_depreciation_amount, 2);

    RETURN v_depreciation_amount;
END;
$$ LANGUAGE plpgsql;
