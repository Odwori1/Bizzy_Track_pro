#!/bin/bash

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

echo "Testing user role..."
curl -s -X GET "http://localhost:8002/api/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.role'
