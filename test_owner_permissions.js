const testPermissions = [
  'business:settings:manage',
  'department:read',
  'workflow:view',
  'billing:view',
  'analytics:view',
  'audit:view',
  'compliance:view',
  'security:scan',
  'permission:manage',
  'role:manage'
];

console.log('Testing permission names that might be missing:');
testPermissions.forEach(perm => {
  console.log(`- ${perm}`);
});
