'use client';

import { usePermissions } from '@/hooks/usePermissions';

export const DebugPermissions = () => {
  const { permissions, getAllPermissionNames, userId, loading } = usePermissions();
  
  if (loading) return <div>Loading permissions...</div>;
  
  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="font-bold">🔍 Permission Debug</h3>
      <p>User ID: {userId}</p>
      <p>RBAC Permissions: {permissions.rbac_permissions?.length || 0}</p>
      <p>ABAC Overrides: {permissions.abac_overrides?.length || 0}</p>
      <div className="mt-2">
        <h4 className="font-semibold">All Permission Names:</h4>
        <ul className="text-sm">
          {getAllPermissionNames().map((perm, idx) => (
            <li key={idx}>{perm}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
