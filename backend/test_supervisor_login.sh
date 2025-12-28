#!/bin/bash
echo "Testing supervisor login via API..."
SUP_TOKEN=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"supervisor@new.com","password":"supervisor123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$SUP_TOKEN" ]; then
    echo "✅ Supervisor can login"
    echo "Token: ${SUP_TOKEN:0:30}..."
    
    # Test if supervisor appears in time clock
    echo "Checking if supervisor appears in workforce..."
    curl -s -H "Authorization: Bearer $SUP_TOKEN" "http://localhost:8002/api/workforce/staff-profiles" | \
        grep -q "supervisor@new.com" && echo "✅ Supervisor found in workforce" || echo "❌ Supervisor not in workforce"
else
    echo "❌ Supervisor login failed"
fi
