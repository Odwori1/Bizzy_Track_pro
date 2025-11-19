'use client';

import { User } from '@/types/auth';

interface UserProfileProps {
  user: User | null;
  business: any | null;
}

export const UserProfile: React.FC<UserProfileProps> = ({ user, business }) => {
  if (!user) return null;

  return (
    <div className="px-4 py-4 border-b border-gray-200">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-blue-600 font-semibold text-sm">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {business?.name || 'Business'}
          </p>
          <p className="text-xs text-gray-400 capitalize">
            {user.role}
          </p>
        </div>
      </div>
    </div>
  );
};
