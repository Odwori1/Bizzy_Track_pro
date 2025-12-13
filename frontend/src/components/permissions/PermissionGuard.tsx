'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';

interface PermissionGuardProps {
  children: ReactNode;
  requiredPermission: string;
  fallback?: ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
  children,
  requiredPermission,
  fallback = null
}) => {
  const { hasPermission, loading } = usePermissions();

  if (loading) {
    return <div className="p-4 text-gray-500">Checking permissions...</div>;
  }

  if (!hasPermission(requiredPermission)) {
    console.warn(`🚫 Permission denied: ${requiredPermission}`);
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
