'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface PermissionGuardProps {
  children: ReactNode;
  requiredPermission: string;
  fallback?: ReactNode;
  showLoading?: boolean;
  redirectOnDeny?: string;
}

export const PermissionGuard = ({
  children,
  requiredPermission,
  fallback = <div className="p-8 text-center text-gray-500">Access Denied</div>,
  showLoading = true,
  redirectOnDeny
}: PermissionGuardProps) => {
  const { hasPermission, loading } = usePermissions();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !hasPermission(requiredPermission) && redirectOnDeny) {
      console.warn(`❌ Permission denied: ${requiredPermission}. Redirecting to ${redirectOnDeny}`);
      router.push(redirectOnDeny);
    }
  }, [loading, hasPermission, requiredPermission, redirectOnDeny, router]);

  if (loading && showLoading) {
    return <div className="p-8 text-center text-gray-500">Checking permissions...</div>;
  }

  if (!hasPermission(requiredPermission)) {
    if (redirectOnDeny) {
      // Will redirect via useEffect above
      return <div className="p-8 text-center text-gray-500">Redirecting...</div>;
    }
    console.warn(`❌ Permission denied: ${requiredPermission}`);
    return <>{fallback}</>;
  }

  console.log(`✅ Permission granted: ${requiredPermission}`);
  return <>{children}</>;
};

// Helper for multiple permissions
interface MultiplePermissionGuardProps {
  children: ReactNode;
  requiredPermissions: string[];
  fallback?: ReactNode;
  showLoading?: boolean;
  requireAll?: boolean;
}

export const MultiplePermissionGuard = ({
  children,
  requiredPermissions,
  fallback = <div className="p-8 text-center text-gray-500">Access Denied</div>,
  showLoading = true,
  requireAll = true
}: MultiplePermissionGuardProps) => {
  const { hasPermission, loading } = usePermissions();

  if (loading && showLoading) {
    return <div className="p-8 text-center text-gray-500">Checking permissions...</div>;
  }

  const hasAccess = requireAll
    ? requiredPermissions.every(perm => hasPermission(perm))
    : requiredPermissions.some(perm => hasPermission(perm));

  if (!hasAccess) {
    console.warn(`❌ Permissions denied: ${requiredPermissions.join(', ')}`);
    return <>{fallback}</>;
  }

  console.log(`✅ Permissions granted: ${requiredPermissions.join(', ')}`);
  return <>{children}</>;
};
