/**
 * Permission Hierarchy and Implication System
 * 
 * Rules:
 * 1. CRUD hierarchy: create > read > update > delete
 * 2. Read implies view
 * 3. Write implies read
 * 4. Manage implies all operations
 */

// Permission implication mappings
const PERMISSION_IMPLICATIONS: Record<string, string[]> = {
  // CRUD patterns
  'create': ['read', 'view'],
  'read': ['view'],
  'update': ['read', 'view'],
  'delete': ['read', 'view'],
  
  // Simple patterns
  'view': [],
  'manage': ['create', 'read', 'update', 'delete', 'view'],
  'write': ['read', 'view'],
  'edit': ['read', 'view'],
};

/**
 * Check if user has a permission or any implied permission
 * @param userPermissions - Array of permission names the user has
 * @param requiredPermission - Permission required (e.g., 'category:view')
 * @returns boolean - True if user has the permission or implied permission
 */
export function hasPermissionWithHierarchy(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  // Exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Parse the required permission
  const [resource, action] = requiredPermission.split(':');
  if (!resource || !action) {
    return false;
  }

  // Check for implied permissions
  const impliedActions = PERMISSION_IMPLICATIONS[action] || [];
  
  for (const impliedAction of impliedActions) {
    const impliedPermission = `${resource}:${impliedAction}`;
    if (userPermissions.includes(impliedPermission)) {
      return true;
    }
  }

  // Check for wildcard permissions
  if (userPermissions.includes(`${resource}:*`)) {
    return true;
  }

  // Check for admin/owner permissions
  if (userPermissions.includes('*') || userPermissions.includes('all')) {
    return true;
  }

  return false;
}

/**
 * Get all implied permissions for a given permission
 * @param permission - Base permission (e.g., 'category:create')
 * @returns Array of implied permissions
 */
export function getImpliedPermissions(permission: string): string[] {
  const [resource, action] = permission.split(':');
  if (!resource || !action) {
    return [];
  }

  const impliedActions = PERMISSION_IMPLICATIONS[action] || [];
  return impliedActions.map(impliedAction => `${resource}:${impliedAction}`);
}

/**
 * Normalize permission checks for sidebar
 * Converts view->read, manage->create/read/update/delete
 */
export function normalizePermissionCheck(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  const [resource, action] = requiredPermission.split(':');
  
  // Special cases
  if (action === 'view') {
    // Check for view, read, create, update, delete, or manage
    const possibleMatches = [
      requiredPermission,                    // category:view
      `${resource}:read`,                   // category:read
      `${resource}:create`,                 // category:create
      `${resource}:update`,                 // category:update
      `${resource}:manage`,                 // category:manage
      `${resource}:write`,                  // category:write
      `${resource}:edit`,                   // category:edit
    ];
    
    return possibleMatches.some(perm => userPermissions.includes(perm));
  }
  
  // Default to exact match for other permissions
  return userPermissions.includes(requiredPermission);
}

// Pre-defined permission groups for common UI sections
export const PERMISSION_GROUPS = {
  // Product Management
  PRODUCT_MANAGEMENT: ['product:read', 'product:view', 'product:create', 'product:manage'],
  CATEGORY_MANAGEMENT: ['category:read', 'category:view', 'category:create', 'category:manage'],
  SUPPLIER_MANAGEMENT: ['supplier:read', 'supplier:view', 'supplier:create', 'supplier:manage'],
  
  // Point of Sale
  POS_ACCESS: ['pos:read', 'pos:view', 'pos:create', 'pos:manage'],
  TRANSACTION_ACCESS: ['transaction:read', 'transaction:view', 'transaction:create'],
  RECEIPT_ACCESS: ['receipt:read', 'receipt:view', 'receipt:create'],
  
  // Customer Management
  CUSTOMER_ACCESS: ['customer:read', 'customer:view', 'customer:create', 'customer:manage'],
};

/**
 * Check if user has any permission from a group
 */
export function hasAnyPermissionFromGroup(
  userPermissions: string[],
  permissionGroup: string[]
): boolean {
  return permissionGroup.some(perm => userPermissions.includes(perm));
}
