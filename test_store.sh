#!/bin/bash

echo "Testing if store functions work..."

# Create a simple test component
cat > test_component.js << 'TEST'
// Quick test to see if store functions work
import { useDepartmentStore } from './departmentStore';

console.log('Testing department store...');

// Try to access store functions
const store = useDepartmentStore.getState();
console.log('Store state keys:', Object.keys(store));
console.log('Store actions keys:', Object.keys(store.actions));

// Check if fetchDepartments exists
console.log('fetchDepartments exists?', typeof store.actions.fetchDepartments);
TEST

echo "Test created. The real issue might be:"
echo "1. The store isn't being properly initialized"
echo "2. The hook isn't properly exporting functions"
echo "3. There's a TypeScript compilation error preventing runtime access"
