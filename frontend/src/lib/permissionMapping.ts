// Map sidebar permission strings to actual database permissions
export const PERMISSION_MAPPING: Record<string, string[]> = {
  // Product Management
  'product:view': ['products:read', 'product:read'],
  'category:view': ['service_category:read', 'category:read'],
  'supplier:view': ['suppliers:read'],
  'purchase_order:view': ['purchase_orders:read'],
  
  // POS
  'pos:view': ['pos:read'],
  'transaction:view': ['invoice:read'],
  'receipt:view': ['invoice:read'],
  
  // Business
  'job:view': ['job:read'],
  'invoice:view': ['invoice:read'],
  'customer:view': ['customer:read'],
  'service:view': ['service:read'],
  'package:view': ['package:read'],
  
  // Inventory
  'inventory:view': ['inventory:read'],
  'asset:view': ['asset:read'],
  'equipment:view': ['equipment:read'],
  'maintenance:view': ['asset:maintenance:read'],
  'depreciation:view': ['asset:depreciate'],
  
  // Financial
  'finance:view': ['financial:reports:view', 'expense:read', 'wallet:read'],
  'wallet:view': ['wallet:read'],
  'expense:view': ['expense:read'],
  'report:view': ['financial:reports:view'],
  
  // Pricing
  'pricing:view': ['pricing_rule:read'],
  'pricing:manage': ['pricing_rule:create'],
  
  // Security
  'audit:view': ['security_audit:view'],
  'compliance:view': ['compliance:view'],
  
  // Analytics
  'analytics:view': ['analytics:view', 'department_analytics:view'],
};

// New simplified check function
export function checkPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  // Exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }
  
  // Check mapped permissions
  const mappedPermissions = PERMISSION_MAPPING[requiredPermission] || [requiredPermission];
  return mappedPermissions.some(perm => userPermissions.includes(perm));
}
