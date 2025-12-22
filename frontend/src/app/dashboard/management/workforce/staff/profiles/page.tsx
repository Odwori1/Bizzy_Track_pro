'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { StaffProfile } from '@/types/workforce';
import { formatDisplayDate } from '@/lib/date-format'; // ✅ Use centralized date utility
import { formatCurrency } from '@/lib/currency'; // ✅ Use centralized currency utility

export default function StaffProfilesPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore(); // ✅ Get business
  const { fetchStaffProfiles, loading, error } = useWorkforce();
  
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadStaffProfiles();
  }, [authLoading, isAuthenticated, router]);

  const loadStaffProfiles = async () => {
    try {
      const profiles = await fetchStaffProfiles();
      setStaffProfiles(profiles || []);
    } catch (err) {
      console.error('Failed to load staff profiles:', err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading Staff Profiles...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Profiles</h1>
          <p className="text-gray-600">
            Enhanced staff profiles with employment details
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/staff')}
          >
            ← Basic Staff
          </Button>
          <Button
            onClick={() => router.push('/dashboard/management/workforce')}
          >
            ← Workforce Dashboard
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-600">❌</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Staff</p>
                <p className="text-2xl font-bold mt-2">{staffProfiles.length}</p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-blue-100 text-blue-600">
                👥
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Staff</p>
                <p className="text-2xl font-bold mt-2">
                  {staffProfiles.filter(p => p.is_active).length}
                </p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-green-100 text-green-600">
                ✅
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Average Wage</p>
                <p className="text-2xl font-bold mt-2">
                  {staffProfiles.length > 0 
                    ? formatCurrency( // ✅ Use formatCurrency
                        staffProfiles.reduce((sum, p) => sum + parseFloat(p.base_wage_rate || '0'), 0) / staffProfiles.length,
                        business
                      )
                    : formatCurrency(0, business) // ✅ Use formatCurrency
                  }
                </p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-purple-100 text-purple-600">
                💰
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Profiles List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Staff Profiles</CardTitle>
              <CardDescription>
                Enhanced employment profiles with skills, certifications, and employment details
              </CardDescription>
            </div>
            <Button
              onClick={loadStaffProfiles}
              variant="outline"
              size="sm"
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {staffProfiles.length > 0 ? (
            <div className="space-y-4">
              {staffProfiles.map((profile) => (
                <div key={profile.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{profile.user_full_name}</h3>
                      <p className="text-gray-600">{profile.job_title} • {profile.employee_id}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                          {profile.department_name}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          profile.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {profile.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                          {formatCurrency(profile.base_wage_rate, business)}/hr {/* ✅ Use formatCurrency */}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/dashboard/management/workforce/staff/profiles/${profile.id}`)}
                    >
                      View Details
                    </Button>
                  </div>
                  
                  {profile.skills && profile.skills.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm text-gray-600 mb-1">Skills:</p>
                      <div className="flex flex-wrap gap-1">
                        {profile.skills.map((skill, index) => (
                          <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 text-sm text-gray-600">
                    <p>Hired: {formatDisplayDate(profile.hire_date)}</p> {/* ✅ Use formatDisplayDate */}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No staff profiles found</p>
              <p className="text-sm mt-1">Staff profiles will appear here once created</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>About Enhanced Staff Profiles</CardTitle>
          <CardDescription>
            How Workforce Management enhances basic staff information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Basic Staff Info (Week 9)</h4>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                <li>Name, email, phone</li>
                <li>Role and department</li>
                <li>Account status</li>
                <li>Basic permissions</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Enhanced Workforce Info (Week 10)</h4>
              <ul className="text-sm text-gray-600 space-y-1 list-disc pl-5">
                <li>Employee ID & job title</li>
                <li>Wage rates & employment type</li>
                <li>Skills & certifications</li>
                <li>Emergency contacts</li>
                <li>Shift history & performance</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
