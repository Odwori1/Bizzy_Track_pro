#!/bin/bash

echo "🧪 TESTING UNIFIED SYSTEM"
echo "========================"

# Get fresh token
echo "1. Getting authentication token..."
./test_login.sh
source current_token.txt

BASE_URL="http://localhost:8002/api"

echo ""
echo "2. Testing Unified Endpoints..."
echo "------------------------------"

test_endpoint() {
    echo -n "Testing $1... "
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL$2")
    if [ "$http_code" = "200" ]; then
        echo "✅"
    else
        echo "❌ ($http_code)"
    fi
}

test_endpoint "Staff List" "/staff"
test_endpoint "Workforce Profiles" "/workforce/staff-profiles"
test_endpoint "Departments" "/departments"
test_endpoint "Time Clock" "/workforce/clock-events"

echo ""
echo "3. Checking Data Consistency..."
echo "-----------------------------"

# Get counts via API
staff_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -o '"id"' | wc -l)
workforce_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/workforce/staff-profiles" | grep -o '"id"' | wc -l)

echo "Staff Users (API): $staff_count"
echo "Workforce Profiles (API): $workforce_count"

if [ $staff_count -eq $workforce_count ]; then
    echo "✅ Data is consistent!"
else
    echo "⚠️  Data mismatch: $((staff_count - workforce_count)) profiles missing"
fi

echo ""
echo "4. Testing Supervisor Access..."
echo "------------------------------"

# Create a test supervisor login
cat > test_supervisor_login.sh << 'SUPERVISOR_EOF'
#!/bin/bash
echo "Testing supervisor login via API..."
SUP_TOKEN=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@new.com","password":"supervisor123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$SUP_TOKEN" ]; then
    echo "✅ Supervisor can login"
    echo "Token: ${SUP_TOKEN:0:30}..."
    
    # Test if supervisor appears in time clock
    echo "Checking if supervisor appears in workforce..."
    curl -s -H "Authorization: Bearer $SUP_TOKEN" "http://localhost:8002/api/workforce/staff-profiles" | \
        grep -q "supervisor@new.com" && echo "✅ Supervisor found in workforce" || echo "❌ Supervisor not in workforce"
else
    echo "❌ Supervisor login failed"
fi
SUPERVISOR_EOF

chmod +x test_supervisor_login.sh
./test_supervisor_login.sh

echo ""
echo "5. Database Verification..."
echo "--------------------------"

psql -U postgres -d bizzytrack_pro << 'DBQUERIES'
\echo '=== DATABASE VERIFICATION ==='
\echo ''

\echo '1. Trigger Verification:'
SELECT 
    tgname as trigger_name,
    relname as table_name,
    CASE WHEN tgenabled = 'O' THEN 'Enabled' ELSE 'Disabled' END as status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE tgname LIKE 'trg_%'
ORDER BY table_name, trigger_name;

\echo ''
\echo '2. Unified View Test:'
SELECT 
    COUNT(*) as total_unified,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT staff_profile_id) as unique_profiles,
    COUNT(CASE WHEN employee_id IS NULL THEN 1 END) as missing_employee_ids
FROM unified_employees;

\echo ''
\echo '3. Sample Unified Data:'
SELECT 
    email,
    full_name,
    role,
    employee_id,
    job_title,
    department_name,
    overall_status
FROM unified_employees 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
LIMIT 3;

\echo ''
\echo '4. System Health Check:'
SELECT * FROM validate_employee_integrity('243a15b5-255a-4852-83bf-5cb46aa62b5e');
DBQUERIES

echo ""
echo "6. Frontend Test Instructions:"
echo "-----------------------------"
echo "1. Logout and login as supervisor@new.com"
echo "2. Navigate to: http://localhost:3000/dashboard/management/workforce/timesheets/clock"
echo "3. Verify supervisor appears in dropdown"
echo "4. Test clock in/out functionality"
echo "5. Check console for errors (F12)"
echo ""
echo "🎯 TESTING COMPLETE!"
