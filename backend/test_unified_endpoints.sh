#!/bin/bash

echo "🧪 TESTING UNIFIED EMPLOYEE ENDPOINTS"
echo "===================================="

# Get token with correct endpoint and credentials
echo "Getting token..."
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}')

TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "❌ Login failed"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

echo "✅ Token obtained"

BASE_URL="http://localhost:8002/api"

test_endpoint() {
    echo -n "Testing $1... "
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL$2")
    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "201" ]; then
        echo "✅ ($RESPONSE)"
        return 0
    else
        echo "❌ ($RESPONSE)"
        return 1
    fi
}

echo ""
echo "1. Testing Basic Endpoints..."
echo "---------------------------"
test_endpoint "GET /api/employees" "/employees"
test_endpoint "GET /api/staff" "/staff"
test_endpoint "GET /api/workforce/staff-profiles" "/workforce/staff-profiles"

echo ""
echo "2. Testing Supervisor Specific..."
echo "-------------------------------"

# Get supervisor data
echo "Checking for supervisor in unified employees..."
EMP_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/employees")
SUP_EMAIL="supervisor@new.com"

if echo "$EMP_RESPONSE" | grep -q "$SUP_EMAIL"; then
    echo "✅ Supervisor found in unified employees"
    
    # Extract supervisor ID (try multiple patterns)
    SUP_ID=$(echo "$EMP_RESPONSE" | grep -o "\"id\":\"[^\"]*\"[^}]*\"$SUP_EMAIL\"" | head -1 | grep -o "\"id\":\"[^\"]*\"" | head -1 | cut -d'"' -f4)
    
    if [ -z "$SUP_ID" ]; then
        # Try alternative pattern
        SUP_ID=$(echo "$EMP_RESPONSE" | grep -B5 "$SUP_EMAIL" | grep -o "\"id\":\"[^\"]*\"" | head -1 | cut -d'"' -f4)
    fi
    
    if [ -n "$SUP_ID" ]; then
        echo "✅ Supervisor ID: $SUP_ID"
        
        # Test getting supervisor details
        test_endpoint "GET /api/employees/$SUP_ID" "/employees/$SUP_ID"
        
        # Test workforce data
        test_endpoint "GET /api/employees/$SUP_ID/workforce" "/employees/$SUP_ID/workforce"
        
        # Test clock in (dry run - should fail if already clocked in)
        echo -n "Testing clock in (dry run)... "
        CLOCK_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          -d '{}' \
          "$BASE_URL/employees/$SUP_ID/clock-in")
        
        if echo "$CLOCK_RESPONSE" | grep -q '"success":true'; then
            echo "✅ Clock in successful"
        elif echo "$CLOCK_RESPONSE" | grep -q 'already clocked\|not found\|missing\|error'; then
            ERROR_MSG=$(echo "$CLOCK_RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
            if [ -n "$ERROR_MSG" ]; then
                echo "⚠️  Expected: $ERROR_MSG"
            else
                echo "⚠️  Expected error returned"
            fi
        else
            echo "❌: $(echo "$CLOCK_RESPONSE" | head -c 200)"
        fi
    else
        echo "⚠️  Could not extract supervisor ID from response"
        echo "Response preview: $(echo "$EMP_RESPONSE" | head -c 300)"
    fi
else
    echo "❌ Supervisor not found in unified employees"
    echo "Checking staff API instead..."
    
    # Check staff API
    STAFF_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff")
    if echo "$STAFF_RESPONSE" | grep -q "$SUP_EMAIL"; then
        echo "✅ Supervisor found in staff API"
        echo "But missing from unified employees - check triggers and views"
    else
        echo "❌ Supervisor not found in any API - account may not exist"
        echo ""
        echo "To create supervisor, run:"
        echo "psql -U postgres -p 5434 -d bizzytrack_pro -c \\"
        echo "\"INSERT INTO users (business_id, email, full_name, role) VALUES "
        echo "('243a15b5-255a-4852-83bf-5cb46aa62b5e', '$SUP_EMAIL', 'Test Supervisor', 'supervisor');\""
    fi
fi

echo ""
echo "3. Testing Data Consistency..."
echo "----------------------------"

echo "Comparing counts:"
STAFF_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff")
WORKFORCE_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/workforce/staff-profiles")
EMPLOYEES_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/employees")

STAFF_COUNT=$(echo "$STAFF_RESPONSE" | grep -o '"id"' | wc -l)
WORKFORCE_COUNT=$(echo "$WORKFORCE_RESPONSE" | grep -o '"id"' | wc -l)
EMPLOYEES_COUNT=$(echo "$EMPLOYEES_RESPONSE" | grep -o '"id"' | wc -l)

echo "Staff API: $STAFF_COUNT users"
echo "Workforce API: $WORKFORCE_COUNT profiles"
echo "Unified Employees API: $EMPLOYEES_COUNT unified records"

if [ "$STAFF_COUNT" -gt 0 ] && [ "$WORKFORCE_COUNT" -gt 0 ]; then
    if [ "$STAFF_COUNT" = "$WORKFORCE_COUNT" ] && [ "$STAFF_COUNT" = "$EMPLOYEES_COUNT" ]; then
        echo "✅ All counts match perfectly!"
    else
        echo "⚠️  Counts don't match"
        echo "   Staff($STAFF_COUNT) vs Workforce($WORKFORCE_COUNT) vs Unified($EMPLOYEES_COUNT)"
        
        if [ "$STAFF_COUNT" -gt "$WORKFORCE_COUNT" ]; then
            DIFF=$((STAFF_COUNT - WORKFORCE_COUNT))
            echo "   ❌ $DIFF staff users missing workforce profiles"
        fi
        
        if [ "$STAFF_COUNT" -gt "$EMPLOYEES_COUNT" ]; then
            DIFF=$((STAFF_COUNT - EMPLOYEES_COUNT))
            echo "   ❌ $DIFF staff users missing from unified view"
        fi
    fi
else
    echo "⚠️  Some APIs returning empty or error"
    echo "Staff response start: $(echo "$STAFF_RESPONSE" | head -c 100)"
    echo "Workforce response start: $(echo "$WORKFORCE_RESPONSE" | head -c 100)"
    echo "Employees response start: $(echo "$EMPLOYEES_RESPONSE" | head -c 100)"
fi

echo ""
echo "4. Testing Error Cases..."
echo "-----------------------"

# Test non-existent employee
echo -n "Testing non-existent employee... "
ERROR_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/employees/00000000-0000-0000-0000-000000000000")
if echo "$ERROR_RESPONSE" | grep -q '"success":false\|"error":\|404\|not found'; then
    echo "✅ Correctly returns error"
else
    echo "❌ Should return error but got: $(echo "$ERROR_RESPONSE" | head -c 100)"
fi

echo ""
echo "5. Database Check for Supervisor..."
echo "---------------------------------"
psql -U postgres -p 5434 -d bizzytrack_pro << 'DB_CHECK'
\echo '=== SUPERVISOR DATABASE CHECK ==='
\echo ''

\echo '1. Supervisor in users table:'
SELECT id, email, full_name, role, created_at 
FROM users 
WHERE email = 'supervisor@new.com' 
    AND business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';

\echo ''
\echo '2. Supervisor in unified_employees view:'
SELECT 
    user_id,
    email,
    full_name,
    role,
    employee_id,
    job_title,
    has_workforce_profile,
    can_clock_in
FROM unified_employees 
WHERE email = 'supervisor@new.com' 
    AND business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';

\echo ''
\echo '3. Missing workforce profiles:'
SELECT 
    u.id as user_id,
    u.email,
    u.full_name,
    u.role,
    u.created_at
FROM users u
LEFT JOIN staff_profiles sp ON u.id = sp.user_id
WHERE sp.id IS NULL 
    AND u.role IN ('owner','manager','supervisor','staff')
    AND u.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY u.created_at;
DB_CHECK

echo ""
echo "6. Manual Browser Test Instructions:"
echo "-----------------------------------"
echo "If supervisor exists but can't clock in:"
echo "1. Login as supervisor@new.com (password: supervisor123 or fixed123)"
echo "2. Go to: http://localhost:3000/dashboard/management/workforce/timesheets/clock"
echo "3. Verify supervisor appears in dropdown"
echo "4. Try to clock in/out"
echo "5. Check console for NaN errors"
echo ""
echo "If supervisor doesn't exist:"
echo "1. Create supervisor account via SQL (see above)"
echo "2. Restart backend to trigger profile creation"
echo "3. Try login again"
echo ""
echo "🎯 TEST COMPLETE!"
