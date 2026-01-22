-- Fix the function to properly update all constrained fields
DROP FUNCTION IF EXISTS apply_depreciation_override(
    UUID, UUID, INTEGER, INTEGER, DECIMAL, VARCHAR, UUID
);

CREATE OR REPLACE FUNCTION apply_depreciation_override(
    p_business_id UUID,
    p_asset_id UUID,
    p_period_month INTEGER,
    p_period_year INTEGER,
    p_override_amount DECIMAL(15,2),
    p_reason VARCHAR(500),
    p_user_id UUID
)
RETURNS TABLE(
    success BOOLEAN,
    message VARCHAR(500),
    original_amount DECIMAL(15,2),
    new_amount DECIMAL(15,2),
    override_id UUID
) AS $$
DECLARE
    v_depreciation_record RECORD;
    v_override_id UUID;
    v_difference DECIMAL(15,2);
BEGIN
    -- Get the depreciation record with all fields
    SELECT * INTO v_depreciation_record
    FROM asset_depreciations 
    WHERE asset_id = p_asset_id 
      AND period_month = p_period_month 
      AND period_year = p_period_year;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'No depreciation found for the specified period'::VARCHAR, 
                        0::DECIMAL(15,2), 0::DECIMAL(15,2), NULL::UUID;
        RETURN;
    END IF;
    
    -- Calculate the difference
    v_difference := p_override_amount - v_depreciation_record.depreciation_amount;
    
    -- Check if override already exists
    PERFORM id FROM depreciation_overrides
    WHERE business_id = p_business_id 
      AND asset_id = p_asset_id 
      AND period_month = p_period_month 
      AND period_year = p_period_year;
    
    IF FOUND THEN
        RETURN QUERY SELECT false, 'Override already exists for this period'::VARCHAR, 
                        v_depreciation_record.depreciation_amount, 
                        p_override_amount, 
                        NULL::UUID;
        RETURN;
    END IF;
    
    -- Create override record
    INSERT INTO depreciation_overrides (
        business_id, asset_id, period_month, period_year,
        override_amount, reason, created_by
    ) VALUES (
        p_business_id, p_asset_id, p_period_month, p_period_year,
        p_override_amount, p_reason, p_user_id
    ) RETURNING id INTO v_override_id;
    
    -- Update the depreciation record with ALL required fields to satisfy constraints
    UPDATE asset_depreciations
    SET 
        depreciation_amount = p_override_amount,
        accumulated_depreciation_after = accumulated_depreciation_before + p_override_amount,
        book_value_after = book_value_before - p_override_amount,
        updated_at = NOW()
    WHERE id = v_depreciation_record.id;
    
    -- Update asset's accumulated depreciation and book value
    UPDATE assets
    SET 
        accumulated_depreciation = accumulated_depreciation + v_difference,
        current_book_value = current_book_value - v_difference,
        updated_at = NOW()
    WHERE id = p_asset_id;
    
    RETURN QUERY SELECT true, 
        'Depreciation override applied successfully'::VARCHAR, 
        v_depreciation_record.depreciation_amount, 
        p_override_amount, 
        v_override_id;
    
EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 
        ('Error applying override: ' || SQLERRM)::VARCHAR(500), 
        0::DECIMAL(15,2), 
        0::DECIMAL(15,2), 
        NULL::UUID;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT * FROM apply_depreciation_override(
    'ac7de9dd-7cc8-41c9-94f7-611a4ade5256',
    '664aa218-ccf6-4975-97bf-4a7a59c81cb0',
    2,
    2026,
    700000.00,
    'Fixed: Now respects constraints',
    'd5f407e3-ac71-4b91-b03e-ec50f908c3d1'
);
