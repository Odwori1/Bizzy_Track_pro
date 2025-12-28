#!/bin/bash

echo "🧪 TEST MIGRATION DRY RUN"
echo "========================"

# Get fresh token
./test_login.sh
source current_token.txt

BASE_URL="http://localhost:8002/api"

echo ""
echo "1. Current State Before Migration:"
echo "--------------------------------"

# Get counts
staff_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | grep -o '"id"' | wc -l)
workforce_count=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/workforce/staff-profiles" | grep -o '"id"' | wc -l)

echo "Staff Users: $staff_count"
echo "Workforce Profiles: $workforce_count"
echo "Missing Profiles: $((staff_count - workforce_count))"

echo ""
echo "2. Supervisor Check:"
echo "-------------------"
echo "Supervisors in system:"
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/staff" | \
    grep -E '(email.*supervisor|supervisor.*email)' -i | \
    grep -o '"email":"[^"]*"' | cut -d'"' -f4

echo ""
echo "3. Database Check (Read Only):"
echo "-----------------------------"
# Check which users would get profiles
psql -U postgres -d bizzytrack_pro -c "
SELECT 
    u.email,
    u.full_name,
    u.role,
    CASE 
        WHEN sp.id IS NULL THEN '❌ NEEDS PROFILE'
        ELSE '✅ HAS PROFILE: ' || sp.employee_id
    END as status
FROM users u
LEFT JOIN staff_profiles sp ON u.id = sp.user_id
WHERE u.role IN ('manager', 'supervisor', 'staff')
    AND u.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY 
    CASE WHEN sp.id IS NULL THEN 0 ELSE 1 END,
    u.role,
    u.full_name
LIMIT 15;
"

echo ""
echo "4. Expected Impact:"
echo "------------------"
psql -U postgres -d bizzytrack_pro -c "
SELECT 
    COUNT(*) as users_needing_profiles
FROM users u
LEFT JOIN staff_profiles sp ON u.id = sp.user_id
WHERE sp.id IS NULL
    AND u.role IN ('owner', 'manager', 'supervisor', 'staff')
    AND u.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
"

echo ""
echo "🎯 READY FOR MIGRATION?"
echo "If the numbers look correct, run:"
echo "psql -U postgres -d bizzytrack_pro -f create_missing_profiles.sql"
