'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Staff } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/rolePermissions';
import { Button } from '@/components/ui/Button';
import { StaffCard } from '@/components/staff/StaffCard';
import { StaffPerformance } from '@/components/staff/StaffPerformance';
import { RoleAssignment } from '@/components/staff/RoleAssignment';
import { DepartmentAssignment } from '@/components/staff/DepartmentAssignment';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/rolePermissions';
import { formatDate } from '@/lib/date-format';

export default function StaffDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const staffId = params.id as string;
  
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'role' | 'department'>('overview');

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
        <div className="text-gray-500">Loading staff details...</div>
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

  const handleRoleAssigned = () => {
    fetchStaff(); // Refresh staff data
    setActiveTab('overview');
  };

  const handleDepartmentAssigned = () => {
    fetchStaff(); // Refresh staff data
    setActiveTab('overview');
  };

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
              ← Back
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Staff Details</h1>
          </div>
          <p className="text-gray-600">
            Manage {staff.full_name}'s account and permissions
          </p>
        </div>
        
        <div className="flex space-x-2">
          <Link href={`/dashboard/management/staff/${staff.id}/edit`}>
            <Button variant="outline">
              Edit Profile
            </Button>
          </Link>
          <Link href={`/dashboard/management/staff/${staff.id}/performance`}>
            <Button>
              View Performance
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-4 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('performance')}
            className={`py-4 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'performance'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Performance
          </button>
          {hasPermission(user?.role as any, 'staff:update') && (
            <>
              <button
                onClick={() => setActiveTab('role')}
                className={`py-4 px-1 border-b-2 text-sm font-medium ${
                  activeTab === 'role'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Role
              </button>
              <button
                onClick={() => setActiveTab('department')}
                className={`py-4 px-1 border-b-2 text-sm font-medium ${
                  activeTab === 'department'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Department
              </button>
            </>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Staff Card */}
            <StaffCard staff={staff} showActions={false} />
            
            {/* Additional Details */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Account Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Account Created</p>
                  <p className="font-medium">{formatDate(staff.created_at)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Last Updated</p>
                  <p className="font-medium">{formatDate(staff.updated_at)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Account Status</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${staff.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {staff.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                <div>
                  <p className="text-sm text-gray-600 mb-1">Role</p>
                  <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(staff.role as any)}`}>
                    {getRoleDisplayName(staff.role as any)}
                  </span>
                </div>
                
                {staff.notes && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-600 mb-1">Notes</p>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{staff.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <StaffPerformance staff={staff} showFilters={true} />
        )}

        {activeTab === 'role' && (
          <RoleAssignment 
            staff={staff} 
            onRoleAssigned={handleRoleAssigned}
            onCancel={() => setActiveTab('overview')}
          />
        )}

        {activeTab === 'department' && (
          <DepartmentAssignment 
            staff={staff} 
            onDepartmentAssigned={handleDepartmentAssigned}
            onCancel={() => setActiveTab('overview')}
          />
        )}
      </div>
    </div>
  );
}
