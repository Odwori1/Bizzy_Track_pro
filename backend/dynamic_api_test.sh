#!/bin/bash

echo "🔌 DYNAMIC API TESTER WITH AUTO-TOKEN"
echo "====================================="

# Source token from file or generate new
if [ -f "current_token.txt" ]; then
    source current_token.txt
    echo "Using cached token..."
else
    echo "No cached token. Running login..."
    ./test_login.sh
    if [ -f "current_token.txt" ]; then
        source current_token.txt
    else
        echo "❌ Could not get token. Exiting."
        exit 1
    fi
fi

BASE_URL="http://localhost:8002/api"

echo ""
echo "Testing with token: ${TOKEN:0:30}..."
echo ""

# Function to test endpoint
test_endpoint() {
    local name=$1
    local endpoint=$2
    local method=${3:-GET}
    
    echo -n "Testing $name... "
    
    response=$(curl -s -w "%{http_code}" -X $method \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        "$BASE_URL$endpoint")
    
    http_code=${response: -3}
    body=${response:0: -3}
    
    if [ "$http_code" = "200" ]; then
        echo "✅ ($http_code)"
        # Count records if array response
        if echo "$body" | grep -q '"data"\s*:'; then
            count=$(echo "$body" | grep -o '"id"' | wc -l)
            echo "   Records: $count"
        fi
    else
        echo "❌ ($http_code)"
        echo "   Response: $(echo "$body" | head -c 200)"
    fi
}

echo "1. SYSTEM HEALTH"
test_endpoint "Health Check" "/health"

echo ""
echo "2. STAFF SYSTEM"
test_endpoint "Staff List" "/staff"
# Get first staff ID for testing
if curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -q '"id"'; then
    FIRST_ID=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    test_endpoint "Staff Details" "/staff/$FIRST_ID"
else
    echo "⚠️  No staff found to test details endpoint"
fi

echo ""
echo "3. WORKFORCE SYSTEM"
test_endpoint "Staff Profiles" "/workforce/staff-profiles"
test_endpoint "Clock Events" "/workforce/clock-events"
test_endpoint "Timesheets" "/workforce/timesheets"

echo ""
echo "4. DEPARTMENTS"
test_endpoint "Departments" "/departments"

echo ""
echo "5. DATA GAP ANALYSIS"
echo "-------------------"
staff_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -o '"id"' | wc -l)
workforce_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/workforce/staff-profiles" | grep -o '"id"' | wc -l)

echo "Staff Records: $staff_count"
echo "Workforce Profiles: $workforce_count"

if [ $staff_count -gt $workforce_count ]; then
    gap=$((staff_count - workforce_count))
    echo ""
    echo "⚠️  CRITICAL GAP: $gap missing workforce profiles"
    echo "Affected staff emails:"
    # Get staff without profiles (simplified check)
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -o '"email":"[^"]*"' | cut -d'"' -f4 | head -5
fi
