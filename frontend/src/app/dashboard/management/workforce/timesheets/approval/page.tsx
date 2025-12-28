'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { formatDisplayDate } from '@/lib/date-format';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Timesheet } from '@/types/workforce';

export default function TimesheetApprovalPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchTimesheets, loading: workforceLoading } = useWorkforce();

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [filteredTimesheets, setFilteredTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('submitted');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadTimesheets();
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    applyFilters();
  }, [timesheets, statusFilter, staffFilter, searchTerm]);

  const loadTimesheets = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchTimesheets();
      setTimesheets(data);
      setFilteredTimesheets(data.filter(ts => ts.status === 'submitted'));
    } catch (err: any) {
      console.error('Error loading timesheets:', err);
      setError(err.message || 'Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...timesheets];

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(ts => ts.status === statusFilter);
    }

    // Staff filter
    if (staffFilter) {
      filtered = filtered.filter(ts => ts.staff_profile_id === staffFilter);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(ts =>
        ts.full_name?.toLowerCase().includes(term) ||
        ts.employee_id?.toLowerCase().includes(term) ||
        ts.period_name?.toLowerCase().includes(term)
      );
    }

    setFilteredTimesheets(filtered);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'draft': 'bg-gray-100 text-gray-800',
      'submitted': 'bg-blue-100 text-blue-800',
      'approved': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'paid': 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handleApproveTimesheet = async (timesheetId: string) => {
    // TODO: Implement API call to approve timesheet
    alert(`Approve timesheet ${timesheetId} - API to be implemented`);
  };

  const handleRejectTimesheet = async (timesheetId: string) => {
    // TODO: Implement API call to reject timesheet
    alert(`Reject timesheet ${timesheetId} - API to be implemented`);
  };

  const handleViewDetails = (timesheetId: string) => {
    router.push(`/dashboard/management/workforce/timesheets/${timesheetId}`);
  };

  const clearFilters = () => {
    setStatusFilter('submitted');
    setStaffFilter('');
    setSearchTerm('');
  };

  // Get unique staff for filter
  const staffOptions = Array.from(
    new Set(timesheets.map(ts => ({ id: ts.staff_profile_id, name: ts.full_name })))
  ).filter(opt => opt.name);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading timesheets...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Timesheet Approval</h1>
            <p className="text-gray-600 mt-1">
              Review and approve staff timesheets
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/timesheets')}
            >
              All Timesheets
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/timesheets/clock')}
            >
              Time Clock
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
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter timesheets for review</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <Label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </Label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="submitted">Submitted (Pending)</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="">All Statuses</option>
              </select>
            </div>

            {/* Staff Filter */}
            <div>
              <Label htmlFor="staff" className="block text-sm font-medium text-gray-700 mb-2">
                Staff Member
              </Label>
              <select
                id="staff"
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Staff</option>
                {staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search Filter */}
            <div>
              <Label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </Label>
              <Input
                id="search"
                type="text"
                placeholder="Search by name, ID, period..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={clearFilters}
                className="w-full"
                disabled={statusFilter === 'submitted' && !staffFilter && !searchTerm}
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
            Showing <span className="font-bold">{filteredTimesheets.length}</span> of{' '}
            <span className="font-bold">{timesheets.length}</span> timesheets
          </p>
          {statusFilter === 'submitted' && filteredTimesheets.length > 0 && (
            <p className="text-sm text-blue-600 font-medium">
              ⚠️ {filteredTimesheets.length} timesheet(s) require approval
            </p>
          )}
        </div>
        <div className="text-sm text-gray-600">
          {filteredTimesheets.length !== timesheets.length && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
            >
              Clear filters to see all
            </Button>
          )}
        </div>
      </div>

      {/* Timesheets List */}
      {filteredTimesheets.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-medium text-gray-900">No Timesheets Found</h3>
              <p className="text-gray-600 mt-2">
                {timesheets.length === 0
                  ? 'No timesheets have been created yet.'
                  : 'No timesheets match your filters.'}
              </p>
              <div className="mt-4">
                {timesheets.length === 0 ? (
                  <Button
                    onClick={() => router.push('/dashboard/management/workforce/timesheets')}
                  >
                    Create Timesheet
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
        <div className="space-y-4">
          {filteredTimesheets.map((timesheet) => (
            <Card key={timesheet.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Timesheet Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          {timesheet.full_name || 'Unknown Staff'}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {timesheet.employee_id} • {timesheet.period_name}
                        </p>
                      </div>
                      <Badge className={getStatusBadge(timesheet.status)}>
                        {getStatusText(timesheet.status)}
                      </Badge>
                    </div>

                    {/* Timesheet Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-sm text-gray-600">Period</p>
                        <p className="font-medium">
                          {formatDisplayDate(timesheet.period_start_date)} - {formatDisplayDate(timesheet.period_end_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Hours</p>
                        <p className="font-medium">
                          {timesheet.regular_hours} regular + {timesheet.overtime_hours} OT
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Pay</p>
                        <p className="font-medium text-lg">
                          {formatCurrency(timesheet.total_pay, business)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Submitted</p>
                        <p className="font-medium">
                          {formatDisplayDate(timesheet.created_at)}
                        </p>
                      </div>
                    </div>

                    {timesheet.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <p className="text-sm text-gray-700">{timesheet.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetails(timesheet.id)}
                    >
                      View Details
                    </Button>
                    {timesheet.status === 'submitted' && (
                      <>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApproveTimesheet(timesheet.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => handleRejectTimesheet(timesheet.id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk Actions & Stats */}
      {filteredTimesheets.length > 0 && statusFilter === 'submitted' && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-medium text-gray-900">Bulk Actions</h3>
              <p className="text-sm text-gray-600 mt-1">
                Process multiple timesheets at once
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => alert('Bulk approve selected - API to be implemented')}
                disabled={true} // TODO: Enable when selection implemented
              >
                Approve Selected
              </Button>
              <Button
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => alert('Bulk reject selected - API to be implemented')}
                disabled={true} // TODO: Enable when selection implemented
              >
                Reject Selected
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{timesheets.length}</p>
            <p className="text-sm text-gray-600">Total Timesheets</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">
              {timesheets.filter(ts => ts.status === 'submitted').length}
            </p>
            <p className="text-sm text-gray-600">Pending Approval</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {timesheets.filter(ts => ts.status === 'approved').length}
            </p>
            <p className="text-sm text-gray-600">Approved</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">
              {formatCurrency(
                timesheets
                  .filter(ts => ts.status === 'approved')
                  .reduce((sum, ts) => sum + parseFloat(ts.total_pay), 0),
                business
              )}
            </p>
            <p className="text-sm text-gray-600">Total Approved Amount</p>
          </div>
        </div>
      </div>
    </div>
  );
}
