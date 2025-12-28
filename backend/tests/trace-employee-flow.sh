
#!/bin/bash

echo "=== COMPLETE EMPLOYEE CREATION FLOW TRACE ==="

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token obtained"

echo ""
echo "=== STEP 1: Create employee via /api/staff (Week 9 system) ==="
CREATE_RESPONSE=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"trace-test@bizzy.com","password":"test123","role":"staff","full_name":"Trace Test Employee"}' \
  "http://localhost:8002/api/staff")

echo "Create response: $CREATE_RESPONSE"

# Extract user ID
USER_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
echo "User ID created: $USER_ID"

echo ""
echo "=== STEP 2: Check if staff_profile auto-created ==="
sleep 2  # Wait for trigger

echo "2.1 Check staff_profiles table:"
psql -U postgres -p 5434 -d bizzytrack_pro << SQL
SELECT 
  id as staff_profile_id,
  employee_id,
  user_id,
  job_title,
  created_at
FROM staff_profiles 
WHERE user_id = '$USER_ID'
LIMIT 1;
SQL

echo ""
echo "2.2 Check unified_employees view:"
psql -U postgres -p 5434 -d bizzytrack_pro << SQL
SELECT 
  employee_id,
  user_full_name,
  email,
  has_workforce_profile,
  profile_created
FROM unified_employees 
WHERE user_id = '$USER_ID'
LIMIT 1;
SQL

echo ""
echo "=== STEP 3: Test unified API endpoints ==="
echo "3.1 GET /api/employees (should include new employee):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
employees = resp.get('data', [])
found = [e for e in employees if e.get('email') == 'trace-test@bizzy.com']
print(f'Found new employee in unified view: {len(found) > 0}')
if found:
    e = found[0]
    print(f'  Employee ID: {e.get(\"employee_id\")}')
    print(f'  Has workforce profile: {e.get(\"has_workforce_profile\")}')
"

echo ""
echo "3.2 Test clock-in with employee_id:"
# Get employee_id from unified view
EMP_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
for e in resp.get('data', []):
    if e.get('email') == 'trace-test@bizzy.com':
        print(e.get('employee_id'))
        break
")

if [ -n "$EMP_ID" ]; then
  echo "Employee ID: $EMP_ID"
  echo "Testing clock-in:"
  curl -s -X POST -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"notes":"Trace test clock-in"}' \
    "http://localhost:8002/api/employees/$EMP_ID/clock-in" | \
    python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Success: {resp.get(\"success\")}')
print(f'Message: {resp.get(\"message\")}')
"
else
  echo "Could not find employee_id for trace-test@bizzy.com"
fi

echo ""
echo "=== STEP 4: Test department assignment ==="
echo "4.1 Get available departments:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/departments" | \
  python3 -c "
import sys, json
resp = json.load(sys.stdin)
depts = resp.get('data', [])
print(f'Found {len(depts)} departments')
if depts:
    print(f'First department: {depts[0].get(\"name\")} (ID: {depts[0].get(\"id\")})')
"

echo ""
echo "=== STEP 5: Clean up test data ==="
echo "5.1 Delete test employee:"
if [ -n "$USER_ID" ]; then
  curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
    "http://localhost:8002/api/staff/$USER_ID" | \
    python3 -c "
import sys, json
resp = json.load(sys.stdin)
print(f'Delete success: {resp.get(\"success\")}')
"
fi

