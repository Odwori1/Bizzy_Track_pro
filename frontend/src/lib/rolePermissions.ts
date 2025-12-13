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
// UPDATED TO MATCH ACTUAL DATABASE PERMISSIONS
export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: [
    'all' // Owner has all permissions (248 in backend)
  ],
  manager: [
    // Based on database: manager has 247 permissions (all except business settings)
    // This is a representative subset - actual permissions come from backend
    'dashboard:view',
    
    // Customer Management
    'category:create', 'category:read', 'category:update', 'category:delete',
    'customer:create', 'customer:read', 'customer:update', 'customer:delete',
    'customer_communication:create', 'customer_communication:read', 'customer_communication:update', 'customer_communication:delete',
    
    // Service Management
    'service:create', 'service:read', 'service:update', 'service:delete',
    'service_category:create', 'service_category:read', 'service_category:update', 'service_category:delete',
    
    // Job Management
    'job:create', 'job:read', 'job:update', 'job:delete', 'job:assign',
    'job_assignments:create', 'job_assignments:read', 'job_assignments:update', 'job_assignments:reassign',
    
    // Inventory
    'inventory:create', 'inventory:read', 'inventory:update', 'inventory:delete',
    
    // POS System
    'pos:create', 'pos:read', 'pos:update', 'pos:delete', 'pos:refund', 'pos:void',
    
    // Financial
    'invoice:create', 'invoice:read', 'invoice:update', 'invoice:delete', 'invoice:payment:record', 'invoice:send',
    'expense:read',
    'wallet:read',
    
    // Staff Management
    'staff:create', 'staff:read', 'staff:update',
    'staff_profiles:read',
    
    // Departments
    'departments:read',
    'department_billing:read',
    'department_roles:read',
    
    // Analytics & Reports
    'analytics:view',
    'department_analytics:view',
    
    // Products
    'products:read',
    'package:read',
    
    // Suppliers
    'suppliers:read',
    
    // Purchase Orders
    'purchase_orders:read',
    
    // Equipment
    'equipment:read', 'equipment:hire:read',
    
    // Assets
    'asset:read', 'asset:maintenance:read',
    
    // Pricing
    'pricing_rule:read', 'seasonal_pricing:read', 'price_history:read',
    
    // Timesheets
    'timesheets:read', 'shifts:read'
  ],
  supervisor: [
    // ACTUAL SUPERVISOR PERMISSIONS FROM DATABASE (27 permissions)
    'category:create', 'category:read', 'category:update',
    'customer:create', 'customer:read', 'customer:update',
    'customer_communication:create', 'customer_communication:read', 'customer_communication:update',
    'inventory:create', 'inventory:read', 'inventory:update',
    'job:create', 'job:read', 'job:update',
    'pos:create', 'pos:read', 'pos:update',
    'service:create', 'service:read', 'service:update',
    'service_category:create', 'service_category:read', 'service_category:update',
    'staff:create', 'staff:read', 'staff:update'
  ],
  staff: [
    // ACTUAL STAFF PERMISSIONS FROM DATABASE (8 permissions)
    'category:read',
    'customer:read',
    'customer_communication:read',
    'inventory:read',
    'job:read',
    'pos:read',
    'service:read',
    'service_category:read'
  ]
};

// ============================================
// PERMISSION CHECKING UTILITIES - UPDATED WITH DEBUG
// ============================================

/**
 * Check if a user has a specific permission
 * @param userRole - User's role from backend
 * @param permission - Permission string to check
 */
export function hasPermission(userRole: UserRole, permission: string): boolean {
  console.log(`🔍 [PERMISSION CHECK] Role: ${userRole}, Permission: ${permission}`);
  
  if (userRole === 'owner') {
    console.log(`✅ Owner always has permission`);
    return true;
  }

  // Check if permission exists in role's list
  const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
  const hasExactPermission = rolePermissions.includes(permission);
  
  console.log(`📊 Exact permission check: ${hasExactPermission}`);
  console.log(`📋 Role permissions count: ${rolePermissions.length}`);

  // Check for wildcard permissions (e.g., 'customer:*' for any customer permission)
  if (!hasExactPermission && permission.includes(':')) {
    const [category, action] = permission.split(':');
    const wildcardPermission = `${category}:*`;
    const hasWildcard = rolePermissions.includes(wildcardPermission);
    console.log(`🎯 Wildcard check (${wildcardPermission}): ${hasWildcard}`);
    return hasWildcard;
  }

  console.log(`🎯 Final result: ${hasExactPermission}`);
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
