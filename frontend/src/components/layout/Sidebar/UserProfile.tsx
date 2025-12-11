'use client';

import { useAuthStore } from '@/store/authStore';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/rolePermissions';

export const UserProfile: React.FC = () => {
  const { user, business } = useAuthStore();

  if (!user) return null;

  // Get initials from fullName
  const getInitials = (fullName: string) => {
    if (!fullName) return 'U';
    const names = fullName.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return fullName[0].toUpperCase();
  };

  return (
    <div className="px-4 py-4 border-b border-gray-200">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-blue-600 font-semibold text-sm">
            {getInitials(user.fullName || user.email)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {user.fullName || user.email.split('@')[0]}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {business?.name || user.email}
          </p>

          {/* Role display with staff indicator */}
          <div className="mt-2 text-xs">
            <span className={`inline-block px-2 py-1 rounded-full ${getRoleBadgeColor(user.role as any)}`}>
              {getRoleDisplayName(user.role as any)} {user.isStaff ? '(Staff)' : ''}
            </span>
            {user.isStaff && (
              <span className="ml-2 text-xs text-gray-600">
                Staff Account
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
