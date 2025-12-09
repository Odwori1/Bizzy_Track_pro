'use client';

import { useAuthStore } from '@/store/authStore';

interface UserProfileProps {
  user: any | null;
  business: any | null;
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, business }) => {
  const { user: authUser } = useAuthStore();
  
  // Use the user from props or from auth store
  const displayUser = user || authUser;
  if (!displayUser) return null;

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
            {getInitials(displayUser.fullName)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {displayUser.fullName}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {business?.name || displayUser.email}
          </p>
          
          {/* Role display with staff indicator */}
          {displayUser && (
            <div className="mt-2 text-xs">
              <span className="inline-block px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                {displayUser.role} {displayUser.isStaff ? '(Staff)' : '(Owner)'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
