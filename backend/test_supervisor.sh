#!/bin/bash

echo "👨‍💼 SUPERVISOR FUNCTIONALITY TEST"
echo "================================"

# First, get fresh token
echo "1. Getting authentication token..."
if [ -f "current_token.txt" ]; then
    source current_token.txt
else
    ./test_login.sh
    source current_token.txt
fi

BASE_URL="http://localhost:8002/api"

echo ""
echo "2. Finding supervisor users..."
supervisors=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | \
    grep -B2 -A2 'supervisor' | grep -E '(email|full_name|role)' | head -20)

if [ -n "$supervisors" ]; then
    echo "Found supervisors in system:"
    echo "$supervisors"
    
    # Extract supervisor email
    SUP_EMAIL=$(echo "$supervisors" | grep -o '"email":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo ""
    echo "Testing supervisor: $SUP_EMAIL"
    
    # Get supervisor details
    echo ""
    echo "3. Checking supervisor details..."
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | \
        jq -r '.data[] | select(.email == "'$SUP_EMAIL'") | {id, email, full_name, role, department_name, last_login_at}'
    
else
    echo "❌ No supervisors found in staff list"
fi

echo ""
echo "4. Checking if supervisor can access time clock..."
echo "   Manual test required:"
echo "   1. Logout as owner"
echo "   2. Login as supervisor@new.com"
echo "   3. Navigate to: http://localhost:3000/dashboard/management/workforce/timesheets/clock"
echo "   4. Check console for errors"
echo "   5. Try to clock in"
echo ""
echo "5. Alternative: Check supervisor's workforce profile"
sup_id=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | \
    grep -o '"id":"[^"]*".*"email":"[^"]*supervisor[^"]*"' | \
    grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$sup_id" ]; then
    echo "Supervisor ID: $sup_id"
    echo "Checking workforce profile..."
    curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/workforce/staff-profiles" | \
        grep -B5 -A5 "$sup_id" || echo "No workforce profile found for supervisor"
fi
