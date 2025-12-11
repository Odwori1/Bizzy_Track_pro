'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Staff } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { StaffPerformance } from '@/components/staff/StaffPerformance';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';

export default function StaffPerformancePage() {
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

    if (!authLoading && user && !hasPermission(user.role as any, 'staff:read')) {
      router.push('/dashboard');
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
              ← Back to Profile
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Performance Analytics</h1>
          </div>
          <p className="text-gray-600">
            Performance metrics for {staff.full_name}
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/management/staff/${staffId}`)}
          >
            View Profile
          </Button>
          <Button
            onClick={() => router.push(`/dashboard/management/staff/${staffId}/edit`)}
          >
            Edit Profile
          </Button>
        </div>
      </div>

      {/* Performance Component */}
      <StaffPerformance staff={staff} showFilters={true} />
    </div>
  );
}
