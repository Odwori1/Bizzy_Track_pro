'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DropdownNavigation } from './DropdownNavigation';
import { useAuthStore } from '@/store/authStore';
import { normalizePermissionCheck } from '@/lib/permissionHierarchy';
import { usePermissions } from '@/hooks/usePermissions';
import { checkPermission } from '@/lib/permissionMapping';

interface NavItem {
  name: string;
  href: string;
  icon: string;
  permission: string;
  isDropdown?: boolean;
  dropdownItems?: Array<{
    name: string;
    href: string;
    icon: string;
    permission: string;
  }>;
}

interface NavigationSectionProps {
  items: NavItem[];
  color?: string;
}

export const NavigationSection: React.FC<NavigationSectionProps> = ({ items, color = 'gray' }) => {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const { getAllPermissionNames } = usePermissions();

  // Get actual user permissions from backend
  const userPermissionNames = getAllPermissionNames();

  console.log('🔍 NavigationSection - User info:', {
    userId: user?.id,
    userRole: user?.role,
    isOwner: user?.role === 'owner',
    permissionCount: userPermissionNames.length
  });

  // Filter items based on user permissions
  const filteredItems = items.filter(item => {
    // CRITICAL FIX: OWNER BYPASS - If user is owner, show everything
    if (user && user.role === 'owner') {
      console.log(`👑 Owner bypass for item: ${item.name}`);
      return true;
    }
    
    // If no permission required, show to all
    if (!item.permission) return true;

    // If no user logged in, don't show protected items
    if (!user) return false;

    // Check if user has the required permission using hierarchy
    const hasAccess = checkPermission(userPermissionNames, item.permission);

    console.log(`🔍 Checking permission: ${item.permission} - Result: ${hasAccess}`);
    return hasAccess;
  });

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1">
      {filteredItems.map((item) => {
        // Handle dropdown items
        if (item.isDropdown && item.dropdownItems) {
          return (
            <li key={item.name}>
              <DropdownNavigation
                title={item.name}
                icon={item.icon}
                mainHref={item.href}
                items={item.dropdownItems}
                color={color}
              />
            </li>
          );
        }

        // Handle regular items
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

        return (
          <li key={item.name}>
            <Link
              href={item.href}
              className={`
                flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200
                ${isActive
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:shadow-sm'
                }
              `}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              <span className="flex-1">{item.name}</span>
              {isActive && (
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
