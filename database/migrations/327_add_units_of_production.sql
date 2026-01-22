-- Migration: Add units of production depreciation method (Idempotent)
-- File: 505_add_units_of_production.sql

-- 1. First, handle the functions in a safe way
DO $$
BEGIN
    -- Check if units of production function exists, create if not
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'calculate_units_of_production_depreciation' 
        AND pronargs = 4
    ) THEN
        -- Create the units of production function
        EXECUTE '
        CREATE OR REPLACE FUNCTION calculate_units_of_production_depreciation(
            p_asset_id UUID,
            p_month INTEGER,
            p_year INTEGER,
            p_units_produced INTEGER DEFAULT NULL
        )
        RETURNS DECIMAL(15,2) AS $func$
        DECLARE
            v_asset RECORD;
            v_depreciation_per_unit DECIMAL(15,6);
            v_depreciation_amount DECIMAL(15,2);
            v_units_this_period INTEGER;
            v_remaining_units INTEGER;
            v_depreciable_base DECIMAL(15,2);
            v_current_date DATE;
            v_depreciation_start_date DATE;
            v_months_passed INTEGER;
        BEGIN
            -- Get asset details
            SELECT * INTO v_asset
            FROM assets 
            WHERE id = p_asset_id;
            
            IF NOT FOUND THEN
                RETURN 0;
            END IF;
            
            -- Only calculate for units of production method
            IF v_asset.depreciation_method != ''units_of_production'' THEN
                RETURN 0;
            END IF;
            
            -- Check if depreciation should have started
            v_depreciation_start_date := COALESCE(
                v_asset.depreciation_start_date,
                v_asset.acquisition_date,
                v_asset.purchase_date
            );
            
            v_current_date := MAKE_DATE(p_year, p_month, 1);
            
            IF v_current_date < v_depreciation_start_date THEN
                RETURN 0; -- Not yet time for depreciation
            END IF;
            
            -- Calculate months passed since depreciation start
            v_months_passed := (p_year - EXTRACT(YEAR FROM v_depreciation_start_date)) * 12
                               + (p_month - EXTRACT(MONTH FROM v_depreciation_start_date));
            
            IF v_months_passed < 1 THEN
                RETURN 0; -- First month hasn''t completed
            END IF;
            
            -- Check if we have required data
            IF v_asset.production_units_total IS NULL OR v_asset.production_units_total <= 0 THEN
                RETURN 0;
            END IF;
            
            -- Check if asset is fully depreciated
            IF v_asset.current_book_value <= COALESCE(v_asset.salvage_value, 0) THEN
                RETURN 0;
            END IF;
            
            -- Check if all units have been used
            IF v_asset.production_units_used >= v_asset.production_units_total THEN
                RETURN 0;
            END IF;
            
            -- Determine units for this period
            IF p_units_produced IS NOT NULL AND p_units_produced > 0 THEN
                v_units_this_period := p_units_produced;
            ELSIF v_asset.production_units_period IS NOT NULL AND v_asset.production_units_period > 0 THEN
                v_units_this_period := v_asset.production_units_period;
            ELSE
                -- Default: evenly distribute remaining units over remaining months
                v_remaining_units := v_asset.production_units_total - v_asset.production_units_used;
                v_units_this_period := CEIL(v_remaining_units::DECIMAL / GREATEST(1, v_asset.useful_life_months - v_months_passed + 1));
            END IF;
            
            -- Ensure we don''t exceed total units
            IF v_asset.production_units_used + v_units_this_period > v_asset.production_units_total THEN
                v_units_this_period := GREATEST(0, v_asset.production_units_total - v_asset.production_units_used);
            END IF;
            
            IF v_units_this_period <= 0 THEN
                RETURN 0;
            END IF;
            
            -- Calculate depreciable base
            IF v_asset.is_existing_asset = true AND v_asset.initial_book_value IS NOT NULL THEN
                v_depreciable_base := v_asset.initial_book_value - COALESCE(v_asset.salvage_value, 0);
            ELSE
                v_depreciable_base := v_asset.purchase_cost - COALESCE(v_asset.salvage_value, 0);
            END IF;
            
            -- Calculate depreciation per unit
            v_depreciation_per_unit := v_depreciable_base / v_asset.production_units_total;
            
            -- Calculate depreciation for this period
            v_depreciation_amount := ROUND(v_depreciation_per_unit * v_units_this_period, 2);
            
            -- Check if we''ve reached salvage value
            IF v_asset.current_book_value - v_depreciation_amount < COALESCE(v_asset.salvage_value, 0) THEN
                v_depreciation_amount := GREATEST(0, v_asset.current_book_value - COALESCE(v_asset.salvage_value, 0));
            END IF;
            
            RETURN v_depreciation_amount;
        END;
        $func$ LANGUAGE plpgsql';
    END IF;
    
    -- Now handle the main depreciation function
    -- First drop the 4-parameter version if it exists
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'calculate_monthly_depreciation' 
        AND pronargs = 4
    ) THEN
        DROP FUNCTION calculate_monthly_depreciation(UUID, INTEGER, INTEGER, INTEGER);
    END IF;
    
    -- Create the 4-parameter version
    EXECUTE '
    CREATE OR REPLACE FUNCTION calculate_monthly_depreciation(
        p_asset_id UUID,
        p_month INTEGER,
        p_year INTEGER,
        p_units_produced INTEGER DEFAULT NULL
    )
    RETURNS DECIMAL(15,2) AS $func$
    DECLARE
        v_asset RECORD;
    BEGIN
        -- Get asset details
        SELECT * INTO v_asset
        FROM assets 
        WHERE id = p_asset_id
          AND is_active = true
          AND status IN (''active'', ''idle'');
        
        IF NOT FOUND THEN
            RETURN 0;
        END IF;
        
        -- Check if units of production method
        IF v_asset.depreciation_method = ''units_of_production'' THEN
            RETURN calculate_units_of_production_depreciation(p_asset_id, p_month, p_year, p_units_produced);
        END IF;
        
        -- For other methods, call the 3-parameter version
        -- This maintains backward compatibility
        RETURN calculate_monthly_depreciation(p_asset_id, p_month, p_year);
    END;
    $func$ LANGUAGE plpgsql';
END $$;

-- 2. Add/update columns with proper checks
ALTER TABLE assets 
    DROP CONSTRAINT IF EXISTS assets_production_units_total_check,
    DROP CONSTRAINT IF EXISTS assets_production_units_used_check,
    DROP CONSTRAINT IF EXISTS assets_production_units_period_check;

ALTER TABLE assets 
    ALTER COLUMN production_units_total DROP NOT NULL,
    ALTER COLUMN production_units_total TYPE INTEGER,
    ADD CONSTRAINT assets_production_units_total_check 
        CHECK (production_units_total IS NULL OR production_units_total > 0);

ALTER TABLE assets 
    ALTER COLUMN production_units_used SET DEFAULT 0,
    ALTER COLUMN production_units_used TYPE INTEGER,
    ADD CONSTRAINT assets_production_units_used_check 
        CHECK (production_units_used >= 0);

ALTER TABLE assets 
    ALTER COLUMN production_units_period DROP NOT NULL,
    ALTER COLUMN production_units_period TYPE INTEGER,
    ADD CONSTRAINT assets_production_units_period_check 
        CHECK (production_units_period IS NULL OR production_units_period >= 0);

-- 3. Update depreciation method constraint
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_depreciation_method_check;
ALTER TABLE assets ADD CONSTRAINT assets_depreciation_method_check 
    CHECK (depreciation_method IN ('straight_line', 'declining_balance', 'units_of_production'));

-- 4. Clean up any invalid data
UPDATE assets 
SET depreciation_method = 'straight_line'
WHERE depreciation_method NOT IN ('straight_line', 'declining_balance', 'units_of_production')
   OR depreciation_method IS NULL;

-- 5. Update the asset_production_units table if needed
DO $$
BEGIN
    -- Add depreciation_amount column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'asset_production_units' 
        AND column_name = 'depreciation_amount'
    ) THEN
        ALTER TABLE asset_production_units 
        ADD COLUMN depreciation_amount DECIMAL(15,2);
    END IF;
END $$;

-- 6. Add comments with explicit function signatures
COMMENT ON FUNCTION calculate_units_of_production_depreciation(UUID, INTEGER, INTEGER, INTEGER) 
IS 'Calculates depreciation based on units produced for units of production method';

COMMENT ON FUNCTION calculate_monthly_depreciation(UUID, INTEGER, INTEGER, INTEGER) 
IS 'Calculates monthly depreciation supporting all methods including units_of_production';
