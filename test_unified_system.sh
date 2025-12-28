#!/bin/bash

echo "=== TESTING UNIFIED SYSTEM IMPLEMENTATION ==="
echo ""

# 1. Check if files exist
echo "1. Checking if required files exist:"
if [ -f "frontend/src/store/unifiedEmployeesStore.ts" ]; then
    echo "   ✅ unifiedEmployeesStore.ts exists"
else
    echo "   ❌ unifiedEmployeesStore.ts missing"
fi

if [ -f "frontend/src/types/unifiedEmployees.ts" ]; then
    echo "   ✅ unifiedEmployees.ts exists"
else
    echo "   ❌ unifiedEmployees.ts missing"
fi

if [ -f "frontend/src/lib/api/unifiedEmployees.ts" ]; then
    echo "   ✅ unifiedEmployees.ts (API) exists"
else
    echo "   ❌ unifiedEmployees.ts (API) missing"
fi

echo ""

# 2. Check for the critical bug fix
echo "2. Checking for critical bug fix (response.data.map):"
if grep -q "response.data.map" frontend/src/lib/api/unifiedEmployees.ts; then
    echo "   ❌ BUG STILL EXISTS: response.data.map found"
else
    echo "   ✅ Bug fixed: No response.data.map found"
fi

echo ""

# 3. Check clock page uses store
echo "3. Checking clock page migration:"
if grep -q "useUnifiedEmployeesStore" frontend/src/app/dashboard/management/workforce/timesheets/clock/page.tsx; then
    echo "   ✅ Clock page uses unified store"
else
    echo "   ❌ Clock page not migrated"
fi

if grep -q "useUnifiedEmployees()" frontend/src/app/dashboard/management/workforce/timesheets/clock/page.tsx; then
    echo "   ❌ Clock page still uses old hook"
else
    echo "   ✅ Clock page no longer uses old hook"
fi

echo ""

# 4. Check store structure
echo "4. Checking store structure:"
if grep -q "actions:" frontend/src/store/unifiedEmployeesStore.ts; then
    echo "   ✅ Store has actions object"
else
    echo "   ❌ Store missing actions object"
fi

if grep -q "fetchClockEvents:" frontend/src/store/unifiedEmployeesStore.ts; then
    echo "   ✅ Store has fetchClockEvents action"
else
    echo "   ❌ Store missing fetchClockEvents action"
fi

echo ""

# 5. Check type definitions
echo "5. Checking type definitions:"
if grep -q "interface ClockEvent" frontend/src/types/unifiedEmployees.ts; then
    echo "   ✅ ClockEvent interface exists"
else
    echo "   ❌ ClockEvent interface missing"
fi

if grep -q "interface UnifiedEmployee" frontend/src/types/unifiedEmployees.ts; then
    echo "   ✅ UnifiedEmployee interface exists"
else
    echo "   ❌ UnifiedEmployee interface missing"
fi

echo ""

# 6. Test backend endpoints (quick check)
echo "6. Testing backend endpoints (quick check):"
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"fixed@test.com","password":"fixed123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null)

if [ -n "$TOKEN" ]; then
    echo "   ✅ Got authentication token"
    
    # Test unified employees endpoint
    STATUS1=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8002/api/employees?limit=1")
    if [ "$STATUS1" = "200" ]; then
        echo "   ✅ /api/employees endpoint works (HTTP $STATUS1)"
    else
        echo "   ❌ /api/employees endpoint failed (HTTP $STATUS1)"
    fi
    
    # Test unified clock events endpoint
    STATUS2=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
      "http://localhost:8002/api/employees/clock-events?limit=1")
    if [ "$STATUS2" = "200" ]; then
        echo "   ✅ /api/employees/clock-events endpoint works (HTTP $STATUS2)"
    else
        echo "   ❌ /api/employees/clock-events endpoint failed (HTTP $STATUS2)"
    fi
else
    echo "   ⚠️  Could not get authentication token (backend might not be running)"
fi

echo ""
echo "=== SUMMARY ==="
echo "If all checks show ✅, the unification project Phase 1 is complete!"
echo "Next steps would be to migrate other pages (clock-events, timesheets, performance)."
