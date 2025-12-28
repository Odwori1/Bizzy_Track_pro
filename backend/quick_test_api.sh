#!/bin/bash

echo "🚀 QUICK API TEST"
echo "================"

# Get token with correct endpoint
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

echo ""
echo "1. Testing Database View..."
echo "--------------------------"
psql -U postgres -p 5434 -d bizzytrack_pro << 'SQL'
-- Test the fixed function
SELECT * FROM get_unified_employee('effbff7c-cc88-4de3-9280-c5a3da4ad1a4', '243a15b5-255a-4852-83bf-5cb46aa62b5e');

-- Check supervisor details
SELECT 
    ue.user_id,
    ue.email,
    ue.full_name,
    ue.role,
    ue.employee_id,
    ue.job_title,
    ue.has_workforce_profile,
    ue.can_clock_in,
    ue.last_clock_event,
    ue.last_clock_time
FROM unified_employees ue
WHERE ue.email = 'supervisor@new.com'
    AND ue.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
SQL

echo ""
echo "2. Testing API Endpoints..."
echo "--------------------------"

test_endpoint() {
    echo -n "Testing $1... "
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "http://localhost:8002$2")
    if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "201" ]; then
        echo "✅ ($RESPONSE)"
    else
        echo "❌ ($RESPONSE)"
    fi
}

test_endpoint "Staff" "/api/staff"
test_endpoint "Workforce Profiles" "/api/workforce/staff-profiles"
test_endpoint "Clock Events" "/api/workforce/clock-events"

echo ""
echo "3. Testing Supervisor via API..."
echo "-------------------------------"

# Test supervisor login with correct endpoint
SUP_TOKEN=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@new.com","password":"supervisor123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$SUP_TOKEN" ]; then
    echo "✅ Supervisor can login"
    
    # Check if supervisor can access workforce
    echo -n "Supervisor workforce access... "
    SUP_RESPONSE=$(curl -s -H "Authorization: Bearer $SUP_TOKEN" "http://localhost:8002/api/workforce/staff-profiles")
    if echo "$SUP_RESPONSE" | grep -q '"success":true'; then
        echo "✅"
        
        # Check if supervisor appears in the list
        if echo "$SUP_RESPONSE" | grep -q 'supervisor@new.com'; then
            echo "✅ Supervisor found in workforce profiles"
            
            # Get supervisor's profile ID
            SUP_PROFILE=$(echo "$SUP_RESPONSE" | grep -o '{"id":"[^"]*"[^}]*"supervisor@new.com"' | head -1)
            if [ -n "$SUP_PROFILE" ]; then
                SUP_ID=$(echo "$SUP_PROFILE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
                echo "Supervisor Profile ID: $SUP_ID"
                
                # Test clock in (dry run - just check permissions)
                echo -n "Testing clock in permission... "
                CLOCK_TEST=$(curl -s -X POST -H "Authorization: Bearer $SUP_TOKEN" \
                  -H "Content-Type: application/json" \
                  -d '{"staff_profile_id":"'$SUP_ID'","event_type":"clock_in"}' \
                  "http://localhost:8002/api/workforce/clock-events")
                
                if echo "$CLOCK_TEST" | grep -q '"success":true'; then
                    echo "✅ Can clock in"
                elif echo "$CLOCK_TEST" | grep -q 'already clocked\|not found'; then
                    echo "⚠️  Expected error: $(echo "$CLOCK_TEST" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)"
                else
                    echo "❌ Error: $(echo "$CLOCK_TEST" | head -c 200)"
                fi
            fi
        else
            echo "❌ Supervisor not in workforce list"
            echo "Response preview: $(echo "$SUP_RESPONSE" | head -c 300)"
        fi
    else
        echo "❌ Cannot access workforce"
        echo "Response: $(echo "$SUP_RESPONSE" | head -c 200)"
    fi
else
    echo "❌ Supervisor login failed with 'supervisor123'"
    echo "Trying alternative password 'fixed123'..."
    
    SUP_TOKEN=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"supervisor@new.com","password":"fixed123"}' | \
      grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$SUP_TOKEN" ]; then
        echo "✅ Supervisor login with password 'fixed123'"
        
        # Quick test with this token
        echo -n "Testing token... "
        TEST_RESPONSE=$(curl -s -H "Authorization: Bearer $SUP_TOKEN" "http://localhost:8002/api/auth/me")
        if echo "$TEST_RESPONSE" | grep -q '"email":"supervisor@new.com"'; then
            echo "✅ Valid supervisor token"
        else
            echo "⚠️  Token works but email mismatch"
        fi
    else
        echo "❌ Both passwords failed - supervisor account may not exist"
        echo ""
        echo "To create supervisor account, run:"
        echo "psql -U postgres -p 5434 -d bizzytrack_pro -c \""
        echo "INSERT INTO staff (business_id, email, full_name, role, department_id) VALUES"
        echo "('243a15b5-255a-4852-83bf-5cb46aa62b5e', 'supervisor@new.com', 'Test Supervisor', 'supervisor', NULL);\""
    fi
fi

echo ""
echo "4. Manual Browser Test Instructions:"
echo "-----------------------------------"
echo "1. Open: http://localhost:3000"
echo "2. Login as supervisor@new.com (password: supervisor123 or fixed123)"
echo "3. Go to: /dashboard/management/workforce/timesheets/clock"
echo "4. Check if supervisor appears in dropdown"
echo "5. Try to clock in/out"
echo "6. Check console for errors"

echo ""
echo "🎯 TEST COMPLETE!"
