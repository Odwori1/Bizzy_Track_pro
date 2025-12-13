import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { usePermissionStore } from '@/store/permissionStore';

export const usePermissions = () => {
  const { user } = useAuthStore();
  const {
    fetchUserPermissions,
    userPermissions,
    loading,
    error
  } = usePermissionStore();

  useEffect(() => {
    if (user?.id) {
      console.log('🔄 usePermissions: Fetching permissions for user:', user.id);
      fetchUserPermissions(user.id);
    }
  }, [user?.id, fetchUserPermissions]);

  const currentUserPermissions = userPermissions[user?.id] || {
    rbac_permissions: [],
    abac_overrides: [],
    summary: { rbac_count: 0, abac_count: 0 }
  };

  // Helper function to check if user has permission
  const hasPermission = (permissionName: string): boolean => {
    if (!user?.id) return false;

    const permissions = currentUserPermissions;

    console.log('🔍 Checking permission:', {
      permissionName,
      rbacCount: permissions.rbac_permissions.length,
      abacCount: permissions.abac_overrides.length,
      rbacPermissions: permissions.rbac_permissions.map((p: any) => p.name),
      abacOverrides: permissions.abac_overrides.map((o: any) => ({
        name: o.name,
        is_allowed: o.is_allowed
      }))
    });

    // Check RBAC permissions
    const hasRbacPermission = permissions.rbac_permissions.some(
      (p: any) => p.name === permissionName
    );

    // Check ABAC overrides (if any) - FIXED: use .name and check is_allowed
    const hasAbacOverride = permissions.abac_overrides.some(
      (o: any) => o.name === permissionName && o.is_allowed === true
    );

    const result = hasRbacPermission || hasAbacOverride;
    console.log(`✅ Permission check result: ${permissionName} = ${result}`);
    return result;
  };

  // Helper to get all permission names for quick checking
  const getAllPermissionNames = (): string[] => {
    const rbacNames = currentUserPermissions.rbac_permissions.map((p: any) => p.name);
    const abacNames = currentUserPermissions.abac_overrides
      .filter((o: any) => o.is_allowed === true)
      .map((o: any) => o.name);
    const allNames = [...rbacNames, ...abacNames];
    
    console.log('📋 All permission names:', {
      rbacCount: rbacNames.length,
      abacCount: abacNames.length,
      allNames
    });
    
    return allNames;
  };

  return {
    permissions: currentUserPermissions,
    hasPermission,
    getAllPermissionNames,
    loading,
    error,
    userId: user?.id
  };
};
