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

    // Staff Management (Week 9)
    'staff:create', 'staff:read', 'staff:update', 'staff:delete',
    'staff_invitation:create', 'staff_invitation:read', 'staff_invitation:update', 'staff_invitation:delete',
    
    // Department Management
    'department:create', 'department:read', 'department:update', 'department:delete',
    
    // Role Management
    'role:read',

    // Analytics
    'analytics:view', 'report:view',

    // Business Operations
    'maintenance:create', 'maintenance:read', 'maintenance:update', 'maintenance:delete',
    'asset:create', 'asset:read', 'asset:update', 'asset:delete',
    'equipment:create', 'equipment:read', 'equipment:update', 'equipment:delete',

    // ============ WEEK 10: WORKFORCE MANAGEMENT PERMISSIONS ============
    'workforce:dashboard:view',
    
    // Staff Profiles (Enhanced)
    'staff_profile:create', 'staff_profile:read', 'staff_profile:update', 'staff_profile:delete',
    
    // Shift Management
    'shift:create', 'shift:read', 'shift:update', 'shift:delete', 'shift:assign',
    'shift_template:create', 'shift_template:read', 'shift_template:update', 'shift_template:delete',
    
    // Timesheet Management
    'timesheet:create', 'timesheet:read', 'timesheet:update', 'timesheet:delete',
    'timesheet:submit', 'timesheet:approve', 'timesheet:reject',
    
    // Time Clock
    'clock:in', 'clock:out', 'clock:read',
    
    // Performance Management
    'performance:create', 'performance:read', 'performance:update', 'performance:delete',
    
    // Availability Management
    'availability:create', 'availability:read', 'availability:update', 'availability:delete',
    
    // Payroll Management
    'payroll:read', 'payroll:export', 'payroll:process',

    // Additional permissions that might exist
    'business:settings:read',
    'permission:read',
    'audit:read',
    'notification:read',

    // Departments (from original)
    'departments:read',
    'department_billing:read',
    'department_roles:read',

    // Analytics & Reports (from original)
    'department_analytics:view',

    // Products (from original)
    'products:read',
    'package:read',

    // Suppliers (from original)
    'suppliers:read',

    // Purchase Orders (from original)
    'purchase_orders:read',

    // Equipment (from original)
    'equipment:hire:read',

    // Assets (from original)
    'asset:maintenance:read',

    // Pricing (from original)
    'pricing_rule:read', 'seasonal_pricing:read', 'price_history:read',

    // Timesheets (from original - keep both formats for compatibility)
    'timesheets:read', 'shifts:read'
  ],
  supervisor: [
    // ACTUAL SUPERVISOR PERMISSIONS FROM DATABASE (27 permissions)
    // Updated with workforce permissions
    
    // Original supervisor permissions
    'category:create', 'category:read', 'category:update',
    'customer:create', 'customer:read', 'customer:update',
    'customer_communication:create', 'customer_communication:read', 'customer_communication:update',
    'inventory:create', 'inventory:read', 'inventory:update',
    'job:create', 'job:read', 'job:update',
    'pos:create', 'pos:read', 'pos:update',
    'service:create', 'service:read', 'service:update',
    'service_category:create', 'service_category:read', 'service_category:update',
    'staff:create', 'staff:read', 'staff:update',

    // ============ WEEK 10: WORKFORCE MANAGEMENT PERMISSIONS ============
    'workforce:dashboard:view',
    
    // Staff Profiles (read-only)
    'staff_profile:read',
    
    // Shift Management
    'shift:read', 'shift:create', 'shift:update',
    'shift_template:read',
    
    // Timesheet Management
    'timesheet:read', 'timesheet:create', 'timesheet:update',
    'timesheet:submit',
    
    // Time Clock
    'clock:in', 'clock:out', 'clock:read',
    
    // Performance Management (read-only)
    'performance:read',
    
    // Availability Management
    'availability:create', 'availability:read', 'availability:update',
    
    // Payroll Management (read-only)
    'payroll:read',

    // Additional supervisor permissions from new snippet
    'dashboard:view',
    'job:assign',
    'job_assignments:create', 'job_assignments:read', 'job_assignments:update',
    'invoice:read', 'invoice:payment:record',
    'expense:read',
    'department:read'
  ],
  staff: [
    // ACTUAL STAFF PERMISSIONS FROM DATABASE (8 permissions)
    // Updated with workforce permissions
    
    // Original staff permissions
    'category:read',
    'customer:read',
    'customer_communication:read',
    'inventory:read',
    'job:read',
    'pos:read',
    'service:read',
    'service_category:read',

    // ============ WEEK 10: WORKFORCE MANAGEMENT PERMISSIONS ============
    'workforce:dashboard:view',
    
    // Staff Profiles (own profile only)
    'staff_profile:read', // Only own profile
    
    // Shift Management (view own shifts)
    'shift:read', // Only own shifts
    
    // Timesheet Management (own timesheets)
    'timesheet:read', 'timesheet:create', 'timesheet:update', // Only own
    'timesheet:submit', // Only own
    
    // Time Clock (own clock events)
    'clock:in', 'clock:out', 'clock:read', // Only own
    
    // Performance Management (own performance)
    'performance:read', // Only own
    
    // Availability Management (own availability)
    'availability:create', 'availability:read', 'availability:update', // Only own

    // Additional staff permissions from new snippet
    'dashboard:view',
    'job:update', // Only for assigned jobs
    'customer_communication:read'
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

  // Check for "all" permission
  if (rolePermissions.includes('all')) {
    console.log(`🎯 Role has 'all' permission`);
    return true;
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

/**
 * Get all permissions for a role (from new snippet)
 */
export function getPermissionsForRole(role: UserRole): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if role has higher or equal hierarchy level (from new snippet)
 * Alias for hasMinimumRole for compatibility
 */
export function hasRoleHierarchy(role: UserRole, minimumRole: UserRole): boolean {
  return hasMinimumRole(role, minimumRole);
}
