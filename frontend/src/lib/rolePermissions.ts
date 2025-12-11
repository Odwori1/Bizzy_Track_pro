// ============================================
// ROLE PERMISSIONS SYSTEM
// Backend-driven: Roles = 'owner' | 'manager' | 'supervisor' | 'staff'
// ============================================

export type UserRole = 'owner' | 'manager' | 'supervisor' | 'staff';

// Hierarchy: Higher number = more permissions
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  manager: 3,
  supervisor: 2,
  staff: 1
};

// Permission categories based on backend structure (248 permissions total)
// This is a FRONTEND representation of backend permissions for UI control
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    'all' // Owner has all permissions (248 in backend)
  ],
  manager: [
    // Dashboard
    'dashboard:view', 'dashboard:analytics',
    
    // Customer Management
    'customer:create', 'customer:read', 'customer:update', 'customer:delete',
    
    // Service Management  
    'service:create', 'service:read', 'service:update', 'service:delete',
    
    // Job Management
    'job:create', 'job:read', 'job:update', 'job:delete', 'job:assign',
    
    // Inventory
    'inventory:create', 'inventory:read', 'inventory:update', 'inventory:delete',
    
    // POS System
    'pos:create', 'pos:read', 'pos:update', 'pos:delete', 'pos:process',
    
    // Financial
    'invoice:create', 'invoice:read', 'invoice:update', 'invoice:delete',
    'payment:create', 'payment:read', 'payment:update',
    
    // Staff Management
    'staff:read', 'staff:update', 'staff:create',
    
    // Departments
    'department:read', 'department:update',
    
    // Analytics & Reports
    'analytics:view', 'reports:view', 'reports:generate'
  ],
  supervisor: [
    // Based on current DB: 27 permissions
    'dashboard:view',
    'customer:read', 'customer:update',
    'service:read',
    'job:read', 'job:update', 'job:assign',
    'inventory:read',
    'pos:read', 'pos:create', 'pos:update',
    'invoice:read',
    'payment:read',
    'staff:read',
    'department:read'
  ],
  staff: [
    // Basic read-only access (8 permissions in backend)
    'dashboard:view',
    'customer:read',
    'service:read', 
    'job:read',
    'inventory:read',
    'pos:read',
    'invoice:read'
  ]
};

// ============================================
// PERMISSION CHECKING UTILITIES
// ============================================

/**
 * Check if a user has a specific permission
 * @param userRole - User's role from backend
 * @param permission - Permission string to check
 */
export function hasPermission(userRole: UserRole, permission: string): boolean {
  if (userRole === 'owner') return true;
  
  // Check if permission exists in role's list
  const hasExactPermission = ROLE_PERMISSIONS[userRole]?.includes(permission);
  
  // Check for wildcard permissions (e.g., 'customer:*' for any customer permission)
  if (!hasExactPermission && permission.includes(':')) {
    const [category, action] = permission.split(':');
    const wildcardPermission = `${category}:*`;
    return ROLE_PERMISSIONS[userRole]?.includes(wildcardPermission) || false;
  }
  
  return hasExactPermission;
}

/**
 * Check if user has at least a certain role level
 * @param userRole - User's current role
 * @param minimumRole - Minimum required role
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Filter navigation items based on user role and permissions
 * @param userRole - User's role
 * @param navigationItems - Array of navigation items
 */
export function getFilteredNavigation(userRole: UserRole, navigationItems: any[]): any[] {
  return navigationItems.filter(item => {
    // If no restrictions, show to all
    if (!item.requiredRole && !item.requiredPermission) return true;
    
    // Check role requirement
    if (item.requiredRole) {
      return hasMinimumRole(userRole, item.requiredRole);
    }
    
    // Check permission requirement
    if (item.requiredPermission) {
      return hasPermission(userRole, item.requiredPermission);
    }
    
    return false;
  });
}

/**
 * Get available roles for the current user to assign to others
 * @param currentUserRole - Current user's role
 */
export function getAssignableRoles(currentUserRole: UserRole): UserRole[] {
  switch (currentUserRole) {
    case 'owner':
      return ['manager', 'supervisor', 'staff'];
    case 'manager':
      return ['supervisor', 'staff'];
    case 'supervisor':
      return ['staff'];
    default:
      return [];
  }
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    owner: 'Owner',
    manager: 'Manager',
    supervisor: 'Supervisor',
    staff: 'Staff'
  };
  return names[role] || role;
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case 'owner': return 'bg-purple-100 text-purple-800';
    case 'manager': return 'bg-blue-100 text-blue-800';
    case 'supervisor': return 'bg-green-100 text-green-800';
    case 'staff': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Check if user can perform action on a resource
 * Example: canUserPerform('customer', 'create', 'manager') → true
 */
export function canUserPerform(
  resource: string, 
  action: string, 
  userRole: UserRole
): boolean {
  const permission = `${resource}:${action}`;
  return hasPermission(userRole, permission);
}
