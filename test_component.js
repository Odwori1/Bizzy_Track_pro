// Quick test to see if store functions work
import { useDepartmentStore } from './departmentStore';

console.log('Testing department store...');

// Try to access store functions
const store = useDepartmentStore.getState();
console.log('Store state keys:', Object.keys(store));
console.log('Store actions keys:', Object.keys(store.actions));

// Check if fetchDepartments exists
console.log('fetchDepartments exists?', typeof store.actions.fetchDepartments);
