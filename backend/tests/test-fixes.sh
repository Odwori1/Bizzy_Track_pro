
#!/bin/bash

echo "=== TESTING NEW ENDPOINTS ==="

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Testing new endpoints..."

echo ""
echo "1. GET /api/employees/clock-events:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/clock-events?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
if resp.get('success'):
    print(f'✅ SUCCESS - Count: {resp.get(\"count\")}')
    if resp.get('data'):
        print(f'   First event: {resp[\"data\"][0].get(\"event_type\")}')
else:
    print(f'❌ FAILED - {resp.get(\"error\")}')
"

echo ""
echo "2. GET /api/employees/EMP5019/clock-events:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019/clock-events?limit=2" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
if resp.get('success'):
    print(f'✅ SUCCESS - Count: {resp.get(\"count\")}')
else:
    print(f'❌ FAILED - {resp.get(\"error\")}')
"

echo ""
echo "3. Test clock-in first (might fail if already clocked in):"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Test break"}' \
  "http://localhost:8002/api/employees/EMP5019/clock-in" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
if resp.get('success'):
    print(f'✅ Clock-in successful')
elif 'Already clocked in' in resp.get('error', ''):
    print(f'⚠️  Already clocked in (this is okay)')
else:
    print(f'❌ Clock-in failed: {resp.get(\"error\")}')
"

echo ""
echo "4. POST /api/employees/EMP5019/break-start:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Test break start"}' \
  "http://localhost:8002/api/employees/EMP5019/break-start" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
if resp.get('success'):
    print(f'✅ SUCCESS - {resp.get(\"message\")}')
else:
    print(f'❌ FAILED - {resp.get(\"error\")}')
"

echo ""
echo "5. POST /api/employees/EMP5019/break-end:"
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Test break end"}' \
  "http://localhost:8002/api/employees/EMP5019/break-end" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
if resp.get('success'):
    print(f'✅ SUCCESS - {resp.get(\"message\")}')
else:
    print(f'❌ FAILED - {resp.get(\"error\")}')
"
