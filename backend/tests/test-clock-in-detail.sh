
#!/bin/bash

echo "=== DETAILED CLOCK-IN TEST ==="

# Get token
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Testing clock-in for EMP5019:"
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Detailed test"}' \
  "http://localhost:8002/api/employees/EMP5019/clock-in" -v

