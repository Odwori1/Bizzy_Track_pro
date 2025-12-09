// SIMPLE Role-based permission system - Phase 1
export type UserRole = 'owner' | 'manager' | 'supervisor' | 'staff';

// Simple hierarchy
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  manager: 3,
  supervisor: 2,
  staff: 1
};

// VERY BASIC permissions for testing
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    'all' // Owner can do everything
  ],
  manager: [
    'dashboard:view',
    'staff:view',
    'job:manage',
    'customer:manage',
    'inventory:view',
    'finance:view'
  ],
  supervisor: [
    'dashboard:view',
    'job:manage',
    'customer:view',
    'inventory:view'
  ],
  staff: [
    'dashboard:view',
    'job:view'
  ]
};

// Simple check functions
export function canAccess(userRole: UserRole, requiredPermission: string): boolean {
  if (userRole === 'owner') return true;
  return ROLE_PERMISSIONS[userRole]?.includes(requiredPermission) || false;
}

export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}
