#!/bin/bash

echo "=== TESTING STORE EXPORT ==="

# Check if the store exports correctly
if grep -q "export const useUnifiedEmployeesStore" frontend/src/store/unifiedEmployeesStore.ts; then
    echo "✅ Store exports correctly"
else
    echo "❌ Store export missing"
fi

# Check if types are exported
if grep -q "export interface" frontend/src/types/unifiedEmployees.ts | head -5; then
    echo "✅ Types are exported"
else
    echo "❌ Types not exported"
fi

echo ""
echo "=== STORE STRUCTURE SUMMARY ==="
echo "The unified store provides:"
echo "1. employees[] - Array of UnifiedEmployee"
echo "2. clockEvents[] - Array of ClockEvent"
echo "3. loading - Loading state"
echo "4. error - Error state"
echo "5. actions - All store actions (fetchEmployees, clockIn, etc.)"
echo ""
echo "Actions available:"
grep -E "^\s+[a-zA-Z]+:" frontend/src/store/unifiedEmployeesStore.ts | grep -v "//" | head -15
