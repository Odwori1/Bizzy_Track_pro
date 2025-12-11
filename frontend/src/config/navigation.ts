import { UserRole } from '@/lib/rolePermissions';

export interface NavigationItem {
  name: string;
  href: string;
  icon: string;
  requiredRole?: UserRole;
  requiredPermission?: string;
  children?: NavigationItem[];
}

export const navigationConfig: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: 'Home',
    requiredPermission: 'dashboard:view'
  },
  {
    name: 'Staff Management',
    href: '/dashboard/management/staff',
    icon: 'Users',
    requiredPermission: 'staff:read',
    children: [
      {
        name: 'All Staff',
        href: '/dashboard/management/staff',
        icon: 'List',
        requiredPermission: 'staff:read'
      },
      {
        name: 'Add Staff',
        href: '/dashboard/management/staff/create',
        icon: 'UserPlus',
        requiredPermission: 'staff:create'
      },
      {
        name: 'Invitations',
        href: '/dashboard/management/staff/invitations',
        icon: 'Mail',
        requiredPermission: 'staff:create'
      }
    ]
  },
  // ... other navigation items can be added here
  // These should match your existing sidebar navigation
];

export const getFilteredNavigation = (userRole: UserRole, permissions: string[]): NavigationItem[] => {
  const filterItems = (items: NavigationItem[]): NavigationItem[] => {
    return items.filter(item => {
      // Check if user has required role
      if (item.requiredRole && item.requiredRole !== userRole) {
        return false;
      }
      
      // Check if user has required permission
      if (item.requiredPermission) {
        // Owner has all permissions
        if (userRole === 'owner') {
          // Owner can see everything except specific business settings
          if (item.requiredPermission.includes('business:settings')) {
            return true; // Owner can see business settings
          }
        }
        
        // Check if permission is in the list
        if (!permissions.includes(item.requiredPermission) && 
            !permissions.includes('all') && 
            userRole !== 'owner') {
          return false;
        }
      }
      
      // Filter children recursively
      if (item.children) {
        item.children = filterItems(item.children);
        // If no children remain, hide the parent if it has no direct href
        if (item.children.length === 0 && !item.href) {
          return false;
        }
      }
      
      return true;
    });
  };
  
  return filterItems(navigationConfig);
};
