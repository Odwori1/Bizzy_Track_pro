#!/bin/bash

echo "🔌 COMPREHENSIVE API TESTING SCRIPT"
echo "===================================="
echo ""

# Configuration
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNGFmMTY5OS0wMTQ5LTQ3ZTItYmM1NS02NjIxNGMwNTcyYmEiLCJidXNpbmVzc0lkIjoiMjQzYTE1YjUtMjU1YS00ODUyLTgzYmYtNWNiNDZhYTYyYjVlIiwiZW1haWwiOiJmaXhlZEB0ZXN0LmNvbSIsInJvbGUiOiJvd25lciIsInRpbWV6b25lIjoiQWZyaWNhL05haXJvYmkiLCJpYXQiOjE3NjY1Njk4OTgsImV4cCI6MTc2NzE3NDY5OH0.ACDl--8dAx9a5R292tJGXwUHSBlYAQaDX6T9-P7z-0E"
BASE_URL="http://localhost:8002/api"
OUTPUT_FILE="api_test_results_$(date +%Y%m%d_%H%M%S).json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test an endpoint and save results
test_endpoint() {
    local name=$1
    local endpoint=$2
    local method=${3:-GET}
    local data=${4:-""}
    
    echo -n "Testing $name ($method $endpoint)... "
    
    if [ "$method" = "POST" ] || [ "$method" = "PUT" ]; then
        response=$(curl -s -X $method -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -X $method -H "Authorization: Bearer $TOKEN" \
            "$BASE_URL$endpoint")
    fi
    
    # Check if response contains error
    if echo "$response" | grep -q -E "error|Error|ERROR|fail|Fail|FAIL"; then
        echo -e "${RED}ERROR${NC}"
        echo "  Response: $response" | head -100
        return 1
    elif [ -z "$response" ]; then
        echo -e "${YELLOW}EMPTY${NC}"
        return 2
    else
        echo -e "${GREEN}OK${NC}"
        # Save to results file
        echo "{\"endpoint\": \"$endpoint\", \"method\": \"$method\", \"response\": $response}" >> "$OUTPUT_FILE"
        return 0
    fi
}

# Clear previous results
> "$OUTPUT_FILE"

echo "Starting API tests at $(date)"
echo "Results will be saved to: $OUTPUT_FILE"
echo ""

echo "1. STAFF SYSTEM (Week 9)"
echo "-----------------------"
test_endpoint "Staff List" "/staff"
test_endpoint "Staff by ID" "/staff/b4af1699-0149-47e2-bc55-66214c0572ba"
test_endpoint "Create Staff" "/staff" "POST" '{"email":"test@investigation.com","full_name":"Test User","role":"staff"}'

echo ""
echo "2. WORKFORCE SYSTEM (Week 10)"
echo "----------------------------"
test_endpoint "Staff Profiles" "/workforce/staff-profiles"
test_endpoint "Clock Events" "/workforce/clock-events"
test_endpoint "Timesheets" "/workforce/timesheets"
test_endpoint "Shifts" "/workforce/shifts"

echo ""
echo "3. DEPARTMENTS SYSTEM"
echo "--------------------"
test_endpoint "Departments List" "/departments"
test_endpoint "Create Department" "/departments" "POST" '{"name":"Investigation Dept","code":"INVEST"}'

echo ""
echo "4. AUTHENTICATION"
echo "----------------"
test_endpoint "Current User" "/auth/me"
test_endpoint "Business Info" "/business"

echo ""
echo "5. DATA CONSISTENCY CHECKS"
echo "--------------------------"
echo "Checking data gaps between systems..."

# Get counts
staff_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -o '"id"' | wc -l)
workforce_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/workforce/staff-profiles" | grep -o '"id"' | wc -l)
dept_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/departments" | grep -o '"id"' | wc -l)

echo "Staff Records: $staff_count"
echo "Workforce Profiles: $workforce_count"
echo "Departments: $dept_count"

if [ $staff_count -gt $workforce_count ]; then
    gap=$((staff_count - workforce_count))
    echo -e "${RED}CRITICAL: $gap staff users are missing workforce profiles${NC}"
    echo "These users cannot use time tracking features."
fi

echo ""
echo "6. TEST SUPERVISOR FUNCTIONALITY"
echo "-------------------------------"
echo "To test supervisor access, we need to:"
echo "1. Find a supervisor user"
echo "2. Get their auth token"
echo "3. Test time clock endpoints"
echo ""
echo "First, let's find supervisors:"

# Extract supervisor info from staff API
supervisors=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | \
    grep -E '(email.*supervisor|supervisor.*email|role.*supervisor)' -i -A2 -B2)

if [ -n "$supervisors" ]; then
    echo "Found supervisor references:"
    echo "$supervisors" | head -20
else
    echo "No supervisor records found in API response"
fi

echo ""
echo "📊 TEST SUMMARY"
echo "=============="
echo "Total tests completed: $(grep -c "endpoint" "$OUTPUT_FILE" 2>/dev/null || echo 0)"
echo "Data gap: $((staff_count - workforce_count)) missing workforce profiles"
echo ""
echo "Next steps:"
echo "1. Review $OUTPUT_FILE for detailed API responses"
echo "2. Run database investigation queries"
echo "3. Test supervisor login manually"
echo "4. Check frontend console for errors"
