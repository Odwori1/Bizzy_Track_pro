'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
// FIXED: Import from tabs.tsx (lowercase)
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/Badge';
import { formatDisplayDate } from '@/lib/date-format';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { StaffProfile } from '@/types/workforce';

export default function StaffProfileDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchStaffProfiles, updateStaffProfile, loading: workforceLoading } = useWorkforce();

  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('employment');

  const staffId = params.id as string;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadStaffProfile();
  }, [authLoading, isAuthenticated, router, staffId]);

  const loadStaffProfile = async () => {
    setLoading(true);
    setError(null);

    try {
      // First, get all staff profiles
      const profiles = await fetchStaffProfiles();

      // Find the specific profile
      const profile = profiles.find(p => p.id === staffId);

      if (!profile) {
        setError('Staff profile not found');
        return;
      }

      setStaffProfile(profile);
    } catch (err: any) {
      console.error('Error loading staff profile:', err);
      setError(err.message || 'Failed to load staff profile');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProfile = () => {
    router.push(`/dashboard/management/workforce/staff/profiles/${staffId}/edit`);
  };

  const handleViewBasicProfile = () => {
    // Navigate to the basic staff profile from Week 9
    if (staffProfile?.user_id) {
      router.push(`/dashboard/management/staff/${staffProfile.user_id}`);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading staff profile...</div>
      </div>
    );
  }

  if (error || !staffProfile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-red-800">Staff Profile Not Found</h3>
              <p className="text-red-700 mt-1">{error || 'The requested staff profile does not exist.'}</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
              >
                ← Back to Staff Profiles
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper functions
  const safeFormatDate = (dateObj: any) => {
    if (!dateObj) return 'N/A';
    return formatDisplayDate(dateObj.local || dateObj.utc || '');
  };

  const getEmploymentTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      'full_time': 'bg-green-100 text-green-800',
      'part_time': 'bg-blue-100 text-blue-800',
      'contract': 'bg-yellow-100 text-yellow-800',
      'temporary': 'bg-orange-100 text-orange-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (isActive: boolean) => {
    return isActive
      ? 'bg-green-100 text-green-800 border-green-200'
      : 'bg-red-100 text-red-800 border-red-200';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
                className="mb-2"
              >
                ← Back to Profiles
              </Button>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">{staffProfile.user_full_name || 'Unknown Staff'}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge className={getEmploymentTypeBadge(staffProfile.employment_type)}>
                {staffProfile.employment_type?.replace('_', ' ').toUpperCase() || 'N/A'}
              </Badge>
              <Badge className={getStatusBadge(staffProfile.is_active)}>
                {staffProfile.is_active ? 'ACTIVE' : 'INACTIVE'}
              </Badge>
              <span className="text-gray-600">ID: {staffProfile.employee_id || 'N/A'}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleViewBasicProfile}
              disabled={!staffProfile.user_id}
            >
              View Basic Profile
            </Button>
            <Button onClick={handleEditProfile}>
              Edit Workforce Profile
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs defaultValue="employment" value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="skills">Skills & Certifications</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="emergency">Emergency Contacts</TabsTrigger>
        </TabsList>

        {/* Employment Details Tab */}
        <TabsContent value="employment">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Employment Information Card */}
            <Card>
              <CardHeader>
                <CardTitle>Employment Details</CardTitle>
                <CardDescription>Basic employment information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Job Title</p>
                    <p className="font-medium">{staffProfile.job_title || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Department</p>
                    <p className="font-medium">{staffProfile.department_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Hire Date</p>
                    <p className="font-medium">{safeFormatDate(staffProfile.hire_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Termination Date</p>
                    <p className="font-medium">
                      {staffProfile.termination_date ? safeFormatDate(staffProfile.termination_date) : 'Active'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compensation Card */}
            <Card>
              <CardHeader>
                <CardTitle>Compensation</CardTitle>
                <CardDescription>Wage and rate information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Wage Type</p>
                    <p className="font-medium capitalize">{staffProfile.wage_type || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Base Rate</p>
                    <p className="font-medium">
                      {formatCurrency(staffProfile.base_wage_rate, business)}
                      {staffProfile.wage_type === 'hourly' ? '/hr' : '/salary'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Overtime Rate</p>
                    <p className="font-medium">
                      {staffProfile.overtime_rate ? formatCurrency(staffProfile.overtime_rate, business) + '/hr' : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Max Hours/Week</p>
                    <p className="font-medium">{staffProfile.max_hours_per_week || 'N/A'} hours</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contact Information Card */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>Staff contact details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Email Address</p>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📧</span>
                      <p className="font-medium">{staffProfile.user_email || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-2">User ID (for reference)</p>
                    <p className="font-medium text-sm font-mono bg-gray-100 p-2 rounded">
                      {staffProfile.user_id || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Skills & Certifications Tab */}
        <TabsContent value="skills">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Skills Card */}
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
                <CardDescription>Staff skills and competencies</CardDescription>
              </CardHeader>
              <CardContent>
                {staffProfile.skills && staffProfile.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {staffProfile.skills.map((skill, index) => (
                      <Badge key={index} variant="secondary" className="px-3 py-1">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No skills recorded</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleEditProfile}
                    >
                      Add Skills
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Certifications Card */}
            <Card>
              <CardHeader>
                <CardTitle>Certifications</CardTitle>
                <CardDescription>Professional certifications and training</CardDescription>
              </CardHeader>
              <CardContent>
                {staffProfile.certifications && staffProfile.certifications.length > 0 ? (
                  <div className="space-y-3">
                    {staffProfile.certifications.map((cert, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">📜</span>
                          <div>
                            <p className="font-medium">{cert}</p>
                            <p className="text-sm text-gray-600">Certification</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No certifications recorded</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleEditProfile}
                    >
                      Add Certifications
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Performance Overview</CardTitle>
              <CardDescription>Performance metrics and ratings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-xl font-medium text-gray-900">Performance Dashboard</h3>
                <p className="text-gray-600 mt-2">
                  Performance metrics are managed separately in the Performance module.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => router.push('/dashboard/management/workforce/performance')}
                >
                  Go to Performance Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shifts Tab */}
        <TabsContent value="shifts">
          <Card>
            <CardHeader>
              <CardTitle>Shift History</CardTitle>
              <CardDescription>Recent shifts and schedule</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📅</div>
                <h3 className="text-xl font-medium text-gray-900">Shift Management</h3>
                <p className="text-gray-600 mt-2">
                  View and manage shifts for this staff member in the Shift module.
                </p>
                <div className="flex gap-2 justify-center mt-4">
                  <Button
                    onClick={() => router.push('/dashboard/management/workforce/shifts')}
                  >
                    View All Shifts
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
                  >
                    Schedule New Shift
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Emergency Contacts Tab */}
        <TabsContent value="emergency">
          <Card>
            <CardHeader>
              <CardTitle>Emergency Contact Information</CardTitle>
              <CardDescription>Contact details for emergencies</CardDescription>
            </CardHeader>
            <CardContent>
              {staffProfile.emergency_contact_name ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-gray-600">Contact Name</p>
                    <p className="text-lg font-medium">{staffProfile.emergency_contact_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone Number</p>
                    <p className="text-lg font-medium">{staffProfile.emergency_contact_phone || 'N/A'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-600">Relationship</p>
                    <p className="text-lg font-medium">{staffProfile.emergency_contact_relationship || 'N/A'}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📱</div>
                  <h3 className="text-xl font-medium text-gray-900">No Emergency Contact</h3>
                  <p className="text-gray-600 mt-2">
                    Emergency contact information has not been recorded.
                  </p>
                  <Button
                    className="mt-4"
                    onClick={handleEditProfile}
                  >
                    Add Emergency Contact
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer Actions */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <p>Profile created: {safeFormatDate(staffProfile.created_at)}</p>
            <p>Last updated: {safeFormatDate(staffProfile.updated_at)}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
            >
              ← All Profiles
            </Button>
            <Button
              variant="outline"
              onClick={handleEditProfile}
            >
              Edit Profile
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
