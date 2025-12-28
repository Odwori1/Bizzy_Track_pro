'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label'; // lowercase import
import { Badge } from '@/components/ui/Badge';
import { formatDisplayDate } from '@/lib/date-format';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { StaffProfile } from '@/types/workforce';

export default function StaffDirectoryPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchStaffProfiles, loading: workforceLoading } = useWorkforce();
  
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Get unique values for filters
  const departments = Array.from(new Set(
    staffProfiles
      .map(p => p.department_name)
      .filter(Boolean) as string[]
  ));

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadStaffProfiles();
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    applyFilters();
  }, [staffProfiles, searchTerm, departmentFilter, employmentTypeFilter, statusFilter]);

  const loadStaffProfiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const profiles = await fetchStaffProfiles();
      setStaffProfiles(profiles);
      setFilteredProfiles(profiles);
    } catch (err: any) {
      console.error('Error loading staff profiles:', err);
      setError(err.message || 'Failed to load staff profiles');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...staffProfiles];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(profile =>
        profile.user_full_name?.toLowerCase().includes(term) ||
        profile.employee_id?.toLowerCase().includes(term) ||
        profile.user_email?.toLowerCase().includes(term) ||
        profile.job_title?.toLowerCase().includes(term)
      );
    }

    // Department filter
    if (departmentFilter) {
      filtered = filtered.filter(profile => profile.department_name === departmentFilter);
    }

    // Employment type filter
    if (employmentTypeFilter) {
      filtered = filtered.filter(profile => profile.employment_type === employmentTypeFilter);
    }

    // Status filter
    if (statusFilter) {
      const isActive = statusFilter === 'active';
      filtered = filtered.filter(profile => profile.is_active === isActive);
    }

    setFilteredProfiles(filtered);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
    setEmploymentTypeFilter('');
    setStatusFilter('');
  };

  const getEmploymentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'full_time': 'Full Time',
      'part_time': 'Part Time',
      'contract': 'Contract',
      'temporary': 'Temporary'
    };
    return labels[type] || type;
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
      ? 'bg-green-100 text-green-800 border border-green-200' 
      : 'bg-red-100 text-red-800 border border-red-200';
  };

  const handleExportCSV = () => {
    // Simple CSV export implementation
    const headers = ['Employee ID', 'Name', 'Email', 'Job Title', 'Department', 'Employment Type', 'Status', 'Wage Rate'];
    const csvContent = [
      headers.join(','),
      ...filteredProfiles.map(profile => [
        profile.employee_id || '',
        `"${profile.user_full_name || ''}"`,
        profile.user_email || '',
        `"${profile.job_title || ''}"`,
        `"${profile.department_name || ''}"`,
        getEmploymentTypeLabel(profile.employment_type),
        profile.is_active ? 'Active' : 'Inactive',
        formatCurrency(profile.base_wage_rate, business)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-directory-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading staff directory...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff Directory</h1>
            <p className="text-gray-600 mt-1">
              Comprehensive view of all staff with workforce information
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
            >
              Simple Profiles
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={filteredProfiles.length === 0}
            >
              Export CSV
            </Button>
            <Button
              onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
            >
              Add Staff Profile
            </Button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-red-800">Failed to Load Data</h3>
              <p className="text-red-700 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={loadStaffProfiles}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Filters Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter staff by different criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Search Input */}
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                type="text"
                placeholder="Search by name, ID, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Department Filter */}
            <div>
              <Label htmlFor="department">Department</Label>
              <select
                id="department"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Departments</option>
                {departments.map((dept, index) => (
                  <option key={index} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Employment Type Filter */}
            <div>
              <Label htmlFor="employmentType">Employment Type</Label>
              <select
                id="employmentType"
                value={employmentTypeFilter}
                onChange={(e) => setEmploymentTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="temporary">Temporary</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full"
                disabled={!searchTerm && !departmentFilter && !employmentTypeFilter && !statusFilter}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="mb-4 flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-600">
            Showing <span className="font-bold">{filteredProfiles.length}</span> of{' '}
            <span className="font-bold">{staffProfiles.length}</span> staff members
          </p>
        </div>
        {filteredProfiles.length !== staffProfiles.length && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
          >
            Clear filters to see all
          </Button>
        )}
      </div>

      {/* Staff Grid */}
      {filteredProfiles.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="text-4xl mb-4">👥</div>
              <h3 className="text-xl font-medium text-gray-900">No Staff Found</h3>
              <p className="text-gray-600 mt-2">
                {staffProfiles.length === 0
                  ? 'No staff profiles have been created yet.'
                  : 'No staff members match your filters.'}
              </p>
              <div className="mt-4">
                {staffProfiles.length === 0 ? (
                  <Button
                    onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
                  >
                    Create First Staff Profile
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfiles.map((profile) => (
            <Card key={profile.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                {/* Card Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {profile.user_full_name || 'Unknown Staff'}
                    </h3>
                    <p className="text-sm text-gray-600">{profile.employee_id || 'No ID'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={getStatusBadge(profile.is_active)}>
                      {profile.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                    <Badge className={getEmploymentTypeBadge(profile.employment_type)}>
                      {getEmploymentTypeLabel(profile.employment_type)}
                    </Badge>
                  </div>
                </div>

                {/* Profile Details */}
                <div className="space-y-3 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Job Title</p>
                    <p className="font-medium">{profile.job_title || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Department</p>
                    <p className="font-medium">{profile.department_name || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium text-sm truncate">{profile.user_email || 'No email'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Wage Rate</p>
                    <p className="font-medium">
                      {formatCurrency(profile.base_wage_rate, business)}
                      {profile.wage_type === 'hourly' ? '/hr' : '/salary'}
                    </p>
                  </div>
                </div>

                {/* Skills Preview */}
                {profile.skills && profile.skills.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-1">Skills</p>
                    <div className="flex flex-wrap gap-1">
                      {profile.skills.slice(0, 3).map((skill, index) => (
                        <Badge key={index} variant="secondary" className="text-xs px-2 py-0.5">
                          {skill}
                        </Badge>
                      ))}
                      {profile.skills.length > 3 && (
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">
                          +{profile.skills.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-between pt-4 border-t border-gray-200">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (profile.user_id) {
                        router.push(`/dashboard/management/staff/${profile.user_id}`);
                      }
                    }}
                    disabled={!profile.user_id}
                  >
                    Basic Profile
                  </Button>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/dashboard/management/workforce/staff/profiles/${profile.id}`);
                    }}
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stats Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{staffProfiles.length}</p>
            <p className="text-sm text-gray-600">Total Staff</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {staffProfiles.filter(p => p.is_active).length}
            </p>
            <p className="text-sm text-gray-600">Active Staff</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {staffProfiles.filter(p => p.employment_type === 'full_time').length}
            </p>
            <p className="text-sm text-gray-600">Full Time</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-600">
              {departments.length}
            </p>
            <p className="text-sm text-gray-600">Departments</p>
          </div>
        </div>
      </div>
    </div>
  );
}
