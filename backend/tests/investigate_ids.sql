# Create a file called "investigate_ids.sql" on your desktop
# Copy this content into it:

-- ID RELATIONSHIP INVESTIGATION
-- This shows how all IDs connect across tables

SELECT 
    -- User table info
    u.id as user_uuid,
    u.email,
    
    -- Staff profile info  
    sp.id as staff_profile_uuid,
    sp.employee_id as human_readable_id,
    sp.user_id as staff_user_id,
    
    -- Check if IDs match
    CASE 
        WHEN u.id = sp.user_id THEN '✅ MATCHES'
        ELSE '❌ MISMATCH'
    END as user_match,
    
    -- Clock events (if any)
    ce.id as clock_event_id,
    ce.staff_profile_id as clock_staff_id,
    ce.event_time
    
FROM users u
LEFT JOIN staff_profiles sp ON u.id = sp.user_id
LEFT JOIN clock_events ce ON sp.id = ce.staff_profile_id
WHERE u.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY u.email
LIMIT 10;

-- Check what the triggers do
SELECT 
    tgname as trigger_name,
    tgenabled as status,
    tgisinternal as is_internal
FROM pg_trigger 
WHERE tgname LIKE 'trg_%' 
   OR tgname LIKE '%employee%'
   OR tgname LIKE '%profile%'
ORDER BY tgname;

-- Look at trigger function definitions
SELECT 
    proname as function_name,
    prosrc as function_code
FROM pg_proc 
WHERE proname LIKE '%create_workforce%'
   OR proname LIKE '%sync%'
LIMIT 5;
