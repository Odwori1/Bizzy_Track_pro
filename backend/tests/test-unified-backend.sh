
#!/bin/bash

echo "=== UNIFIED BACKEND ENDPOINTS TEST ==="
echo ""

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token obtained: ${TOKEN:0:20}..."

echo ""
echo "=== TEST 1: Existing Unified Endpoints ==="

# 1.1 GET /api/employees
echo "1.1 GET /api/employees:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'  Status: {\"✅ SUCCESS\" if resp.get(\"success\") else \"❌ FAILED\"}')
print(f'  Count: {resp.get(\"count\")}')
if resp.get('data'):
    print(f'  First employee ID: {resp[\"data\"][0].get(\"employee_id\")}')
"

# 1.2 GET /api/employees/{id}
echo ""
echo "1.2 GET /api/employees/EMP5019:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'  Status: {\"✅ SUCCESS\" if resp.get(\"success\") else \"❌ FAILED\"}')
if resp.get('data'):
    print(f'  Employee ID: {resp[\"data\"].get(\"employee_id\")}')
    print(f'  Email: {resp[\"data\"].get(\"email\")}')
"

# 1.3 POST /api/employees/{id}/clock-in
echo ""
echo "1.3 POST /api/employees/EMP5019/clock-in:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Backend test"}' \
  "http://localhost:8002/api/employees/EMP5019/clock-in" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'  Status: {\"✅ SUCCESS\" if resp.get(\"success\") else \"❌ FAILED\"}')
print(f'  Message: {resp.get(\"message\")}')
"

# 1.4 POST /api/employees/{id}/clock-out
echo ""
echo "1.4 POST /api/employees/EMP5019/clock-out:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Backend test"}' \
  "http://localhost:8002/api/employees/EMP5019/clock-out" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'  Status: {\"✅ SUCCESS\" if resp.get(\"success\") else \"❌ FAILED\"}')
print(f'  Message: {resp.get(\"message\")}')
"

echo ""
echo "=== TEST 2: Missing Unified Endpoints (Should Fail) ==="

# 2.1 GET /api/employees/clock-events
echo "2.1 GET /api/employees/clock-events:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/clock-events?limit=2" | \
  python3 -c "
import sys, json
try:
    resp = json.load(sys.stdin)
    if resp.get('error'):
        print(f'  Status: ❌ {resp.get(\"error\")}')
    elif resp.get('success'):
        print(f'  Status: ✅ SUCCESS (Unexpected!)')
        print(f'  Count: {resp.get(\"count\")}')
    else:
        print(f'  Status: ❌ Unexpected response: {resp}')
except:
    print('  Status: ❌ No JSON response')
"

# 2.2 GET /api/employees/{id}/clock-events
echo ""
echo "2.2 GET /api/employees/EMP5019/clock-events:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019/clock-events" | \
  python3 -c "
import sys, json
try:
    resp = json.load(sys.stdin)
    if resp.get('error'):
        print(f'  Status: ❌ {resp.get(\"error\")}')
    elif resp.get('success'):
        print(f'  Status: ✅ SUCCESS (Unexpected!)')
        print(f'  Count: {resp.get(\"count\")}')
    else:
        print(f'  Status: ❌ Unexpected response: {resp}')
except:
    print('  Status: ❌ No JSON response')
"

# 2.3 POST /api/employees/{id}/break-start
echo ""
echo "2.3 POST /api/employees/EMP5019/break-start:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8002/api/employees/EMP5019/break-start" | \
  python3 -c "
import sys, json
try:
    resp = json.load(sys.stdin)
    if resp.get('error'):
        print(f'  Status: ❌ {resp.get(\"error\")}')
    elif resp.get('success'):
        print(f'  Status: ✅ SUCCESS (Unexpected!)')
    else:
        print(f'  Status: ❌ Unexpected response: {resp}')
except:
    print('  Status: ❌ No JSON response')
"

# 2.4 POST /api/employees/{id}/break-end
echo ""
echo "2.4 POST /api/employees/EMP5019/break-end:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8002/api/employees/EMP5019/break-end" | \
  python3 -c "
import sys, json
try:
    resp = json.load(sys.stdin)
    if resp.get('error'):
        print(f'  Status: ❌ {resp.get(\"error\")}')
    elif resp.get('success'):
        print(f'  Status: ✅ SUCCESS (Unexpected!)')
    else:
        print(f'  Status: ❌ Unexpected response: {resp}')
except:
    print('  Status: ❌ No JSON response')
"

echo ""
echo "=== TEST 3: Workforce Endpoints (For Comparison) ==="

# 3.1 GET /api/workforce/clock-events
echo "3.1 GET /api/workforce/clock-events (Should Work):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/workforce/clock-events?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'  Status: {\"✅ SUCCESS\" if resp.get(\"success\") else \"❌ FAILED\"}')
print(f'  Count: {resp.get(\"count\")}')
if resp.get('data'):
    print(f'  First event type: {resp[\"data\"][0].get(\"event_type\")}')
"

echo ""
echo "=== TEST 4: Check Route Definitions ==="
echo "4.1 Current unifiedEmployeeRoutes.js routes:"
grep -n "router\." ~/Bizzy_Track_pro/backend/app/routes/unifiedEmployeeRoutes.js | head -20

