#!/bin/bash

echo "=== TESTING DELETE ENDPOINT DIRECTLY ==="

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

echo "Token: ${TOKEN:0:20}..."

# Get a department ID to delete (use the test one we created earlier)
echo -e "\n1. Getting test department ID..."
TEST_DEPT_ID=$(curl -s -X GET "http://localhost:8002/api/departments" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | select(.code == "TEST-API") | .id')

if [ -z "$TEST_DEPT_ID" ] || [ "$TEST_DEPT_ID" = "null" ]; then
  echo "No TEST-API department found, creating one..."
  
  # Create test department
  TEST_DEPT_ID=$(curl -s -X POST "http://localhost:8002/api/departments" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Delete Department",
      "code": "TEST-DELETE",
      "department_type": "admin",
      "description": "Testing delete functionality",
      "is_active": true,
      "sort_order": 999,
      "cost_center_code": "CC-DELETE"
    }' | jq -r '.data.id')
  
  echo "Created test department with ID: $TEST_DEPT_ID"
else
  echo "Found TEST-API department with ID: $TEST_DEPT_ID"
fi

# Test DELETE endpoint
echo -e "\n2. Testing DELETE /api/departments/$TEST_DEPT_ID"
curl -v -X DELETE "http://localhost:8002/api/departments/$TEST_DEPT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

echo -e "\n3. Checking if department still exists..."
curl -s -X GET "http://localhost:8002/api/departments/$TEST_DEPT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.success, .message'

echo -e "\n4. Checking all departments for TEST-DELETE code..."
curl -s -X GET "http://localhost:8002/api/departments" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.code == "TEST-DELETE" or .code == "TEST-API")'
