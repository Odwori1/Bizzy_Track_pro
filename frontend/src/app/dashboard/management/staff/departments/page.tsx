'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { DepartmentAssignment } from '@/components/staff/DepartmentAssignment';

export default function StaffDepartmentsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  const [selectedStaff, setSelectedStaff] = useState<any>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard/management/staff')}
            >
              ← Back to Staff
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Staff Departments</h1>
          </div>
          <p className="text-gray-600">
            Manage department assignments for staff members
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Department Management
        </h3>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            To assign departments to staff members:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Navigate to the staff list</li>
            <li>Click on a staff member to view their details</li>
            <li>Go to the "Department" tab in their profile</li>
            <li>Select and assign the appropriate department</li>
          </ol>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex">
            <svg className="h-5 w-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> This page shows department management. To actually assign departments, 
                you need to go to individual staff member profiles.
              </p>
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          <Button
            onClick={() => router.push('/dashboard/management/staff')}
          >
            View Staff List
          </Button>
          <Link href="/dashboard/coordination/departments">
            <Button variant="outline">
              Manage Departments
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
