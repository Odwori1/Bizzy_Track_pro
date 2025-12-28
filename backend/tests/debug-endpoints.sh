#!/bin/bash

echo "=== API ENDPOINT DEBUGGING ==="

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token obtained"

# Test 1: Check apiClient.get() response format expectation
echo ""
echo "=== TEST 1: Direct fetch to see raw response ==="
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/workforce/clock-events?limit=1" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
print('Response keys:', list(data.keys()))
print('Data type:', type(data.get('data')))
print('Is data array?', isinstance(data.get('data'), list))
print('First item structure:', json.dumps(data.get('data', [])[0] if data.get('data') else {}, indent=2) if data.get('data') else 'No data')
"

# Test 2: Check what the actual error would be
echo ""
echo "=== TEST 2: Simulate the frontend error ==="
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/workforce/clock-events?limit=1" | \
  python3 -c "
import sys, json
response = json.load(sys.stdin)
print('If we do response.map() [WRONG]: Would crash because response is object')
print('If we do response.data.map() [CORRECT]: Would work because data is array')
print('Array length:', len(response.get('data', [])))
"

# Test 3: Check all available endpoints
echo ""
echo "=== TEST 3: Available Employee Endpoints ==="
echo "Testing /api/employees/clock-events:"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/clock-events"

echo ""
echo ""
echo "Testing /api/employees/{id}/clock-events (with EMP5019):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/EMP5019/clock-events"

echo ""
echo ""
echo "Testing /api/employees/{id}/clock-events (with UUID):"
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8002/api/employees/effbff7c-cc88-4de3-9280-c5a3da4ad1a4/clock-events"
