#!/bin/bash

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

echo "Token obtained: $TOKEN"
echo ""

# Test 1: Can we update assignment status?
echo "=== Testing Assignment Status Update ==="
curl -X GET "http://localhost:8002/api/job-department-assignments" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[0] | {id, status}'

echo ""
echo "=== Looking for Assignment Update Endpoint ==="
# Check if PUT /api/job-department-assignments/:id exists
curl -X OPTIONS "http://localhost:8002/api/job-department-assignments/1" \
  -H "Authorization: Bearer $TOKEN" -I

echo ""
echo "=== Testing Handoff Creation ==="
# Check handoff creation endpoint
curl -X POST "http://localhost:8002/api/department-workflow/handoff" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}' | jq '.'
