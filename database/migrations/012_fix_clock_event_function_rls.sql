-- Fix the process_clock_event function to handle RLS properly
BEGIN;

DROP FUNCTION IF EXISTS process_clock_event(UUID, VARCHAR, UUID, DECIMAL, DECIMAL);

CREATE OR REPLACE FUNCTION process_clock_event(
    p_staff_profile_id UUID,
    p_event_type VARCHAR(20),
    p_shift_roster_id UUID DEFAULT NULL,
    p_gps_latitude DECIMAL DEFAULT NULL,
    p_gps_longitude DECIMAL DEFAULT NULL
) RETURNS TABLE(success BOOLEAN, message TEXT, clock_event_id UUID) AS $$
DECLARE
    v_business_id UUID;
    v_staff_exists BOOLEAN;
    v_current_shift UUID;
    v_last_clock_event RECORD;
    v_new_clock_event_id UUID;
    v_current_business_id UUID;
BEGIN
    -- Get the current business ID from RLS context
    BEGIN
        v_current_business_id := current_setting('app.current_business_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT false, 'Business context not set'::TEXT, NULL::UUID;
        RETURN;
    END;

    -- Get business ID and verify staff exists (respecting RLS)
    SELECT business_id INTO v_business_id
    FROM staff_profiles 
    WHERE id = p_staff_profile_id AND business_id = v_current_business_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'Staff profile not found or access denied'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Validate event sequence (temporarily disable RLS for this query)
    EXECUTE 'SET LOCAL row_level_security = off';
    
    SELECT * INTO v_last_clock_event
    FROM clock_events
    WHERE staff_profile_id = p_staff_profile_id
    AND business_id = v_current_business_id
    ORDER BY event_time DESC
    LIMIT 1;
    
    EXECUTE 'SET LOCAL row_level_security = on';

    -- Validate clock in/out sequence
    IF v_last_clock_event IS NOT NULL THEN
        IF v_last_clock_event.event_type = p_event_type THEN
            RETURN QUERY SELECT false, 'Invalid event sequence: ' || p_event_type || ' after ' || v_last_clock_event.event_type, NULL::UUID;
            RETURN;
        END IF;
    ELSIF p_event_type != 'clock_in' THEN
        RETURN QUERY SELECT false, 'Must clock in first'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Create clock event
    INSERT INTO clock_events (
        business_id, staff_profile_id, shift_roster_id,
        event_type, gps_latitude, gps_longitude, event_time
    ) VALUES (
        v_business_id, p_staff_profile_id, p_shift_roster_id,
        p_event_type, p_gps_latitude, p_gps_longitude, NOW()
    ) RETURNING id INTO v_new_clock_event_id;

    -- Update shift status if clocking in/out
    IF p_shift_roster_id IS NOT NULL THEN
        IF p_event_type = 'clock_in' THEN
            UPDATE shift_rosters 
            SET shift_status = 'in_progress', actual_start_time = CURRENT_TIME
            WHERE id = p_shift_roster_id AND business_id = v_current_business_id;
        ELSIF p_event_type = 'clock_out' THEN
            UPDATE shift_rosters 
            SET shift_status = 'completed', actual_end_time = CURRENT_TIME
            WHERE id = p_shift_roster_id AND business_id = v_current_business_id;
        END IF;
    END IF;

    RETURN QUERY SELECT true, 'Clock event recorded successfully'::TEXT, v_new_clock_event_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
