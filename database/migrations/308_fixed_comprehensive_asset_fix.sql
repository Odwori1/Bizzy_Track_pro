-- Migration 308: Comprehensive asset system fix (FIXED VERSION)
-- Date: 2026-01-12
-- Purpose: Fix all constraint and column issues in asset system

BEGIN;

-- 1. First fix: Drop all problematic constraints
ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_category_check;

ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_category_check1;

ALTER TABLE assets 
DROP CONSTRAINT IF EXISTS assets_category_check2;

-- 2. Add correct category constraint
ALTER TABLE assets 
ADD CONSTRAINT assets_category_check 
CHECK (category IN (
    'land', 
    'building', 
    'vehicle', 
    'equipment', 
    'furniture', 
    'computer', 
    'software', 
    'other', 
    'electronics'
));

-- 3. Check and fix condition_status constraint if needed
DO $$
BEGIN
    -- Check if condition_status column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'assets' AND column_name = 'condition_status'
    ) THEN
        -- Drop existing constraint if it exists
        EXECUTE 'ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_condition_status_check';
        
        -- Add correct constraint
        EXECUTE 'ALTER TABLE assets ADD CONSTRAINT assets_condition_status_check 
                 CHECK (condition_status IN (''excellent'', ''good'', ''fair'', ''poor'', ''broken''))';
    END IF;
END $$;

-- 4. Update the register_existing_asset function to explicitly set condition_status
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
    v_condition_status VARCHAR(50);
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

    -- Get condition_status from input or use default
    v_condition_status := COALESCE(
        p_asset_data->>'condition_status',
        'excellent'
    );

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
        condition_status,  -- Explicitly set condition_status
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
        v_condition_status,  -- Use the determined condition_status
        true,
        COALESCE(p_asset_data->>'description', 'Existing asset registered in system'),
        p_user_id
    ) RETURNING id INTO v_asset_id;

    RETURN v_asset_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
