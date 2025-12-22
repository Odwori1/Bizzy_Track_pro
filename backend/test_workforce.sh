#!/bin/bash
cd ~/Bizzy_Track_pro/backend

echo "🚀 RESTARTING BACKEND..."
pkill -f "node.*backend" 2>/dev/null
npm run dev &
BACKEND_PID=$!
sleep 5

echo "🔐 GETTING AUTH TOKEN..."
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to get token"
    exit 1
fi

echo "✅ Token obtained"
echo ""

echo "🔍 COMPREHENSIVE WORKFORCE BACKEND TEST"
echo "========================================"
echo ""

# Helper function to test endpoints
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    
    echo "$name..."
    if [ -z "$data" ]; then
        response=$(curl -s -X $method "$url" -H "Authorization: Bearer $TOKEN")
    else
        response=$(curl -s -X $method "$url" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data")
    fi
    
    success=$(echo "$response" | jq -r '.success')
    message=$(echo "$response" | jq -r '.message // .errors[0] // "No message"')
    
    if [ "$success" = "true" ]; then
        echo "   ✅ SUCCESS: $message"
    else
        echo "   ❌ FAILED: $message"
    fi
    
    echo "$response" | jq '.count // empty' | while read count; do
        if [ -n "$count" ]; then
            echo "   📊 Count: $count"
        fi
    done
    echo ""
}

# Test 1: Shift endpoint (main issue)
test_endpoint "1. GET /api/workforce/shifts" "GET" "http://localhost:8002/api/workforce/shifts?start_date=2025-01-01&end_date=2025-12-31"

# Test 2: Payroll exports
test_endpoint "2. GET /api/workforce/payroll-exports" "GET" "http://localhost:8002/api/workforce/payroll-exports"

# Test 3: Create timesheet (need to get period ID first)
echo "3. Creating timesheet..."
PERIOD_ID=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t -c "SELECT id FROM timesheet_periods WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e' LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

if [ -n "$PERIOD_ID" ] && [ "$PERIOD_ID" != "" ]; then
    test_endpoint "   POST /api/workforce/timesheets" "POST" "http://localhost:8002/api/workforce/timesheets" "{
        \"timesheet_period_id\": \"$PERIOD_ID\",
        \"staff_profile_id\": \"d6fbc540-f959-4141-b6f6-07cd5310762c\",
        \"regular_hours\": 8,
        \"overtime_hours\": 2,
        \"regular_rate\": 25.50,
        \"overtime_rate\": 38.25
    }"
else
    echo "   ⚠️  No timesheet period found. Creating one..."
    # Create a timesheet period
    psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "INSERT INTO timesheet_periods (id, business_id, period_name, start_date, end_date, pay_date) VALUES (gen_random_uuid(), '243a15b5-255a-4852-83bf-5cb46aa62b5e', 'Test Period', '2025-12-01', '2025-12-31', '2026-01-05') RETURNING id;"
    PERIOD_ID=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t -c "SELECT id FROM timesheet_periods WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e' LIMIT 1;" | tr -d '[:space:]')
    
    if [ -n "$PERIOD_ID" ]; then
        test_endpoint "   POST /api/workforce/timesheets" "POST" "http://localhost:8002/api/workforce/timesheets" "{
            \"timesheet_period_id\": \"$PERIOD_ID\",
            \"staff_profile_id\": \"d6fbc540-f959-4141-b6f6-07cd5310762c\",
            \"regular_hours\": 8,
            \"overtime_hours\": 2,
            \"regular_rate\": 25.50,
            \"overtime_rate\": 38.25
        }"
    fi
fi

# Test 4: Create availability
test_endpoint "4. POST /api/workforce/availability" "POST" "http://localhost:8002/api/workforce/availability" '{
    "staff_profile_id": "d6fbc540-f959-4141-b6f6-07cd5310762c",
    "day_of_week": 1,
    "start_time": "09:00",
    "end_time": "17:00",
    "is_available": true
}'

# Test 5: Other GET endpoints
test_endpoint "5. GET /api/workforce/staff-profiles" "GET" "http://localhost:8002/api/workforce/staff-profiles"
test_endpoint "6. GET /api/workforce/performance" "GET" "http://localhost:8002/api/workforce/performance"
test_endpoint "7. GET /api/workforce/timesheets" "GET" "http://localhost:8002/api/workforce/timesheets"
test_endpoint "8. GET /api/workforce/availability" "GET" "http://localhost:8002/api/workforce/availability"

echo "🎯 TEST SUMMARY"
echo "==============="
echo "All Week 10 Workforce endpoints should now be working!"
echo ""
echo "If any tests failed, check the backend logs for details:"
echo "tail -f ~/Bizzy_Track_pro/backend/logs/app.log"

# Kill the backend process
kill $BACKEND_PID 2>/dev/null
