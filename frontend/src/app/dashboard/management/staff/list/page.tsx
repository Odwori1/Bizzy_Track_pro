'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StaffList } from '@/components/staff/StaffList';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';

export default function StaffListPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !hasPermission(user.role as any, 'staff:read')) {
      router.push('/dashboard');
      return;
    }
  }, [isAuthenticated, authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user || !hasPermission(user.role as any, 'staff:read')) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600">
            Manage your staff members, roles, and permissions
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/staff/invitations')}
          >
            View Invitations
          </Button>
          <Button
            onClick={() => router.push('/dashboard/management/staff/create')}
          >
            Add Staff Member
          </Button>
        </div>
      </div>

      {/* Staff List Component */}
      <StaffList showFilters={true} showActions={true} />
    </div>
  );
}
