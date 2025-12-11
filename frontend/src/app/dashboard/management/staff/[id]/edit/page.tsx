'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Staff } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { StaffForm } from '@/components/staff/StaffForm';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';

export default function EditStaffPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = params.id as string;
  
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    if (!authLoading && user && !hasPermission(user.role as any, 'staff:update')) {
      router.push(`/dashboard/management/staff/${staffId}`);
      return;
    }

    fetchStaff();
  }, [staffId, isAuthenticated, authLoading, user, router]);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const staffData = await staffApi.getStaffById(staffId);
      setStaff(staffData);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch staff:', err);
      setError(err.message || 'Failed to load staff details');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = () => {
    router.push(`/dashboard/management/staff/${staffId}`);
  };

  const handleCancel = () => {
    router.push(`/dashboard/management/staff/${staffId}`);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/staff')}
            className="mt-2"
          >
            Back to Staff List
          </Button>
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-gray-500">
          Staff member not found
        </div>
      </div>
    );
  }

  if (!user || !hasPermission(user.role as any, 'staff:update')) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/dashboard/management/staff/${staffId}`)}
            >
              ← Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Edit Staff Member</h1>
          </div>
          <p className="text-gray-600">
            Update {staff.full_name}'s information
          </p>
        </div>
        
        <Button
          variant="outline"
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>

      {/* Staff Form Component */}
      <StaffForm staff={staff} onSuccess={handleSuccess} onCancel={handleCancel} />
    </div>
  );
}
