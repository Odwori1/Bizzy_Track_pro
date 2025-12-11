'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StaffForm } from '@/components/staff/StaffForm';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function CreateStaffPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !hasPermission(user.role as any, 'staff:create')) {
      router.push('/dashboard/management/staff');
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

  if (!user || !hasPermission(user.role as any, 'staff:create')) {
    return null; // Will redirect in useEffect
  }

  const handleSuccess = () => {
    router.push('/dashboard/management/staff');
  };

  const handleCancel = () => {
    router.push('/dashboard/management/staff');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Staff Member</h1>
          <p className="text-gray-600">
            Create a new staff account or send an invitation
          </p>
        </div>
        
        <Button
          variant="outline"
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <Link
            href="/dashboard/management/staff/create"
            className="border-b-2 border-blue-500 text-blue-600 px-1 py-4 text-sm font-medium"
          >
            Create Staff Account
          </Link>
          <Link
            href="/dashboard/management/staff/invitations?action=create"
            className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 px-1 py-4 text-sm font-medium"
          >
            Send Invitation
          </Link>
        </nav>
      </div>

      {/* Staff Form Component */}
      <StaffForm onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  );
}
