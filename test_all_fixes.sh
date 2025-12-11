#!/bin/bash

echo "🧪 COMPREHENSIVE FIX TEST"
echo "========================="
echo ""

echo "1. Checking all fixed files..."
echo "------------------------------"

files_to_check=(
  "frontend/src/lib/api-utils.ts"
  "frontend/src/lib/api.ts"
  "frontend/src/lib/api/staff.ts"
  "frontend/src/components/staff/StaffCard.tsx"
  "frontend/src/components/staff/StaffPerformance.tsx"
  "frontend/src/components/staff/RoleAssignment.tsx"
)

all_good=true
for file in "${files_to_check[@]}"; do
  if [ -f "$file" ]; then
    # Check for common problematic patterns
    if grep -q "undefined" "$file" && grep -q "uuid" "$file"; then
      echo "  ⚠️  $file - Might still have undefined UUID issues"
      all_good=false
    elif grep -q "cleanParams\|cleanUuidParam" "$file"; then
      echo "  ✅ $file - Has parameter cleaning"
    else
      echo "  ✅ $file"
    fi
  else
    echo "  ❌ $file - Missing!"
    all_good=false
  fi
done

echo ""
echo "2. Testing backend API..."
echo "-------------------------"

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "  ❌ Failed to get authentication token"
  all_good=false
else
  echo "  ✅ Got authentication token"
  
  # Test staff endpoint
  echo "  Testing /api/staff endpoint..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8002/api/staff" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json")
  
  if [ "$STATUS" = "200" ]; then
    echo "  ✅ /api/staff returns 200 OK"
  else
    echo "  ❌ /api/staff returns $STATUS"
    all_good=false
  fi
fi

echo ""
echo "3. Checking for remaining undefined UUID patterns..."
echo "----------------------------------------------------"

# Search for patterns that might cause "undefined" UUID errors
echo "  Searching for 'undefined' in staff components:"
grep -r "undefined" frontend/src/components/staff/ --include="*.tsx" | grep -i "id\|uuid" || echo "    None found"

echo ""
echo "4. Testing frontend build..."
echo "---------------------------"

cd ~/Bizzy_Track_pro/frontend
if npm run build 2>&1 | grep -q "error\|Error"; then
  echo "  ❌ Build has errors"
  all_good=false
else
  echo "  ✅ Build successful (or no errors detected)"
fi

echo ""
if [ "$all_good" = true ]; then
  echo "🎉 ALL FIXES APPLIED SUCCESSFULLY!"
  echo ""
  echo "🚀 RESTART AND TEST:"
  echo "1. Restart frontend: cd ~/Bizzy_Track_pro/frontend && npm run dev"
  echo "2. Clear browser cache (F12 → Application → Clear Storage)"
  echo "3. Login as fixed@test.com / fixed123"
  echo "4. Test:"
  echo "   - Staff list page"
  echo "   - Manage roles"
  echo "   - Staff performance"
  echo "   - Department assignments"
else
  echo "⚠️  Some issues detected. Please check above."
fi
