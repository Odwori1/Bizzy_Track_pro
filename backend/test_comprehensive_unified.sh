#!/bin/bash

echo "🧪 COMPREHENSIVE UNIFIED SYSTEM TEST"
echo "==================================="

# Get fresh token
./test_login.sh
source current_token.txt

BASE_URL="http://localhost:8002/api"

echo ""
echo "1. Testing New Unified Endpoint..."
echo "--------------------------------"

echo -n "Testing GET /api/employees... "
employees_response=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/employees")
if echo "$employees_response" | grep -q '"success":true'; then
    employee_count=$(echo "$employees_response" | grep -o '"id"' | wc -l)
    echo "✅ ($employee_count employees)"
else
    echo "❌ (Endpoint not implemented yet)"
    echo "   Response: $(echo "$employees_response" | head -c 200)"
fi

echo ""
echo "2. Testing Supervisor Functionality..."
echo "-------------------------------------"

# Test supervisor login with correct endpoint
echo "Attempting supervisor login..."
sup_response=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@new.com","password":"supervisor123"}')

sup_token=$(echo "$sup_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$sup_token" ]; then
    echo "✅ Supervisor login successful"
    
    # Test if supervisor can access time clock
    echo -n "Testing supervisor time clock access... "
    clock_response=$(curl -s -H "Authorization: Bearer $sup_token" "$BASE_URL/workforce/staff-profiles")
    if echo "$clock_response" | grep -q '"success":true'; then
        echo "✅"
        
        # Try to get supervisor's own profile
        sup_profile=$(echo "$clock_response" | grep -o '"id":"[^"]*"[^}]*"supervisor@new.com"' | head -1)
        if [ -n "$sup_profile" ]; then
            echo "✅ Supervisor found in workforce profiles"
            
            # Extract supervisor's staff profile ID
            sup_profile_id=$(echo "$sup_profile" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
            echo "Supervisor Profile ID: $sup_profile_id"
            
            # Test supervisor can see clock events
            echo -n "Testing supervisor clock events view... "
            events_response=$(curl -s -H "Authorization: Bearer $sup_token" "$BASE_URL/workforce/clock-events")
            if echo "$events_response" | grep -q '"success":true'; then
                events_count=$(echo "$events_response" | grep -o '"id"' | wc -l)
                echo "✅ ($events_count events)"
            else
                echo "❌ Cannot view clock events"
            fi
            
            echo ""
            echo "Note: To test actual clock in/out (if supervisor has workforce profile):"
            echo "curl -X POST -H \"Authorization: Bearer \$sup_token\" \\"
            echo "  -H \"Content-Type: application/json\" \\"
            echo "  -d '{\"staff_profile_id\": \"$sup_profile_id\", \"event_type\": \"clock_in\"}' \\"
            echo "  \"$BASE_URL/workforce/clock-events\""
        else
            echo "⚠️  Supervisor not found in profiles list"
            echo "Response preview: $(echo "$clock_response" | head -c 200)"
        fi
    else
        echo "❌ Cannot access workforce profiles"
        echo "Response: $(echo "$clock_response" | head -c 200)"
    fi
else
    echo "❌ Supervisor login failed"
    echo "Full response: $sup_response"
    
    # Try alternative password if needed
    echo ""
    echo "Trying alternative password 'fixed123'..."
    sup_response=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"supervisor@new.com","password":"fixed123"}')
    
    sup_token=$(echo "$sup_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$sup_token" ]; then
        echo "✅ Supervisor login successful with 'fixed123'"
    else
        echo "❌ Still failed. Supervisor account may not exist."
        echo "Check database: SELECT * FROM staff WHERE email = 'supervisor@new.com';"
    fi
fi

echo ""
echo "3. Database Health Check..."
echo "--------------------------"

psql -U postgres -p 5434 -d bizzytrack_pro << 'DBCHECK'
\echo '=== DATABASE HEALTH CHECK ==='
\echo ''

\echo '1. Employee Counts:'
SELECT 
    'Users' as type, COUNT(*) as count FROM users WHERE role IN ('owner','manager','supervisor','staff')
UNION ALL
SELECT 'Workforce Profiles', COUNT(*) FROM staff_profiles
UNION ALL
SELECT 'Unified Employees', COUNT(*) FROM unified_employees;

\echo ''
\echo '2. Active Employees by Role:'
SELECT 
    role,
    COUNT(*) as total,
    COUNT(CASE WHEN overall_status = 'Active' THEN 1 END) as active,
    COUNT(CASE WHEN can_clock_in = true THEN 1 END) as can_clock_in
FROM unified_employees 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
GROUP BY role
ORDER BY 
    CASE role 
        WHEN 'owner' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'supervisor' THEN 3
        WHEN 'staff' THEN 4
        ELSE 5
    END;

\echo ''
\echo '3. Department Assignments:'
SELECT 
    COALESCE(department_name, 'No Department') as department,
    COUNT(*) as employee_count,
    STRING_AGG(full_name, ', ') as employees
FROM unified_employees 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
GROUP BY COALESCE(department_name, 'No Department')
ORDER BY employee_count DESC;

\echo ''
\echo '4. Supervisor Account Check:'
SELECT 
    id,
    email,
    full_name,
    role,
    created_at,
    (SELECT COUNT(*) FROM staff_profiles sp WHERE sp.user_id = u.id) as has_workforce_profile
FROM users u 
WHERE email = 'supervisor@new.com';

\echo ''
\echo '5. System Issues:'
SELECT * FROM validate_employee_integrity('243a15b5-255a-4852-83bf-5cb46aa62b5e');
DBCHECK

echo ""
echo "4. Frontend Testing Instructions:"
echo "-------------------------------"
echo "1. Logout and login as supervisor@new.com (password: supervisor123)"
echo "2. Navigate to: http://localhost:3000/dashboard/management/workforce/timesheets/clock"
echo "3. Check for these issues:"
echo "   - ✅ Supervisor appears in dropdown"
echo "   - ✅ Can select themselves"
echo "   - ✅ Clock in/out buttons work"
echo "   - ❌ No 'NaN hours ago' messages"
echo "   - ❌ No console errors"
echo ""
echo "5. To fix 'NaN hours ago' bug:"
echo "------------------------------"
echo "The bug is likely in frontend date calculations."
echo "Check these files:"
echo "1. frontend/src/components/TimeAgo.tsx (or similar)"
echo "2. Any component displaying clock events"
echo "3. Look for: new Date(null), Date.parse(undefined), or division by zero"
echo ""
echo "🎯 TESTING COMPLETE!"
