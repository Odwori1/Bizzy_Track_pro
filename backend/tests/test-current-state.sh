
#!/bin/bash

echo "=== CURRENT SYSTEM STATE TEST ==="

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token obtained: ${TOKEN:0:20}..."

echo ""
echo "=== TEST 1: Verify Existing Workforce Endpoints ==="
echo "1.1 /api/workforce/clock-events (should work):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/workforce/clock-events?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Success: {resp.get(\"success\")}')
print(f'Count: {resp.get(\"count\")}')
print(f'Message: {resp.get(\"message\")}')
print(f'First event keys: {list(resp.get(\"data\", [{}])[0].keys()) if resp.get(\"data\") else \"No data\"}')
"

echo ""
echo "1.2 /api/workforce/staff-profiles (should work):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/workforce/staff-profiles?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Success: {resp.get(\"success\")}')
print(f'Count: {resp.get(\"count\")}')
"

echo ""
echo "=== TEST 2: Verify Unified Endpoints ==="
echo "2.1 /api/employees (should work):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Success: {resp.get(\"success\")}')
print(f'Count: {resp.get(\"count\")}')
print(f'First employee has employee_id: {(resp.get(\"data\", [{}])[0].get(\"employee_id\") if resp.get(\"data\") else \"No data\")}')
"

echo ""
echo "2.2 /api/employees/EMP5019 (should work):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Success: {resp.get(\"success\")}')
print(f'Employee ID: {resp.get(\"data\", {}).get(\"employee_id\")}')
"

echo ""
echo "2.3 /api/employees/EMP5019/clock-in (POST, should work):"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Test from systematic script"}' \
  "http://localhost:8002/api/employees/EMP5019/clock-in" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Success: {resp.get(\"success\")}')
print(f'Message: {resp.get(\"message\")}')
"

echo ""
echo "=== TEST 3: Missing Endpoints (should fail) ==="
echo "3.1 /api/employees/clock-events (currently missing):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/clock-events" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Error: {resp.get(\"error\")}')
"

echo ""
echo "3.2 /api/employees/EMP5019/clock-events (currently missing):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019/clock-events" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Error: {resp.get(\"error\")}')
if resp.get(\"availableEndpoints\"):
    print(f'Total available endpoints: {len(resp[\"availableEndpoints\"])}')
    # Show only employee-related endpoints
    print(\"Employee-related endpoints:\")
    for ep in resp[\"availableEndpoints\"]:
        if \"employee\" in ep.lower():
            print(f'  {ep}')
"

