#!/bin/bash
cd ~/Bizzy_Track_pro

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNGFmMTY5OS0wMTQ5LTQ3ZTItYmM1NS02NjIxNGMwNTcyYmEiLCJidXNpbmVzc0lkIjoiMjQzYTE1YjUtMjU1YS00ODUyLTgzYmYtNWNiNDZhYTYyYjVlIiwiZW1haWwiOiJmaXhlZEB0ZXN0LmNvbSIsInJvbGUiOiJvd25lciIsInRpbWV6b25lIjoiQWZyaWNhL05haXJvYmkiLCJpYXQiOjE3NjYzOTQ2MzcsImV4cCI6MTc2Njk5OTQzN30.8x01wTwuYJWDV7-eS5C_oUWGpD00hU-_YNCAADcnsJ0"

echo "=== Testing Workforce Backend API ==="
echo ""

# Test each endpoint
endpoints=(
  "/workforce/staff-profiles"
  "/workforce/shifts?start_date=2025-01-01&end_date=2025-12-31"
  "/workforce/timesheets"
  "/workforce/performance"
  "/workforce/availability"
  "/workforce/payroll-exports"
  "/workforce/dashboard"
)

for endpoint in "${endpoints[@]}"; do
  echo "Testing: $endpoint"
  response=$(curl -s -X GET "http://localhost:8002/api${endpoint}" \
    -H "Authorization: Bearer $TOKEN")
  
  if echo "$response" | grep -q '"success":true'; then
    count=$(echo "$response" | grep -o '"count":[0-9]*' | cut -d: -f2)
    message=$(echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    echo "  ✅ Success: $message (Count: ${count:-N/A})"
  else
    error=$(echo "$response" | grep -o '"error":"[^"]*"' | cut -d'"' -f4 || echo "Unknown error")
    echo "  ❌ Failed: $error"
  fi
  echo ""
done
