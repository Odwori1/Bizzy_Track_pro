'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { formatDisplayDate } from '@/lib/date-format';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Timesheet, TimesheetFilters } from '@/types/workforce';

export default function TimesheetsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchTimesheets, createTimesheet, updateTimesheet, loading: workforceLoading } = useWorkforce();

  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TimesheetFilters>({
    status: '',
    start_date: '',
    end_date: ''
  });
  const [showNewForm, setShowNewForm] = useState(false);

  // New timesheet form state
  const [newTimesheet, setNewTimesheet] = useState({
    timesheet_period_id: '',
    staff_profile_id: '',
    regular_hours: 0,
    overtime_hours: 0,
    break_hours: 0,
    regular_rate: 0,
    overtime_rate: 0,
    notes: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadTimesheets();
  }, [authLoading, isAuthenticated, router, filters]);

  const loadTimesheets = async () => {
    setLoading(true);
    setError(null);

    try {
      const activeFilters: TimesheetFilters = {};
      if (filters.status) activeFilters.status = filters.status;
      if (filters.start_date) activeFilters.start_date = filters.start_date;
      if (filters.end_date) activeFilters.end_date = filters.end_date;

      const data = await fetchTimesheets(activeFilters);
      setTimesheets(data || []);
    } catch (err: any) {
      console.error('Error loading timesheets:', err);
      setError(err.message || 'Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTimesheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      // Calculate totals based on rates and hours
      const regular_pay = newTimesheet.regular_hours * newTimesheet.regular_rate;
      const overtime_pay = newTimesheet.overtime_hours * newTimesheet.overtime_rate;
      const total_pay = regular_pay + overtime_pay;

      const timesheetData = {
        ...newTimesheet,
        total_regular_pay: regular_pay,
        total_overtime_pay: overtime_pay,
        total_pay: total_pay,
        status: 'draft' as const
      };

      await createTimesheet(timesheetData);
      
      // Reset form
      setNewTimesheet({
        timesheet_period_id: '',
        staff_profile_id: '',
        regular_hours: 0,
        overtime_hours: 0,
        break_hours: 0,
        regular_rate: 0,
        overtime_rate: 0,
        notes: ''
      });
      setShowNewForm(false);
      loadTimesheets();
    } catch (err: any) {
      console.error('Error creating timesheet:', err);
      setError(err.message || 'Failed to create timesheet');
    } finally {
      setCreating(false);
    }
  };

  const handleFilterChange = (key: keyof TimesheetFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800 border-gray-200',
      submitted: 'bg-blue-100 text-blue-800 border-blue-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
      paid: 'bg-purple-100 text-purple-800 border-purple-200'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const calculateTotals = () => {
    return timesheets.reduce((acc, ts) => {
      acc.totalHours += parseFloat(ts.regular_hours) + parseFloat(ts.overtime_hours);
      acc.totalPay += parseFloat(ts.total_pay);
      return acc;
    }, { totalHours: 0, totalPay: 0 });
  };

  const totals = calculateTotals();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Timesheets</h1>
            <p className="text-gray-600 mt-1">
              Manage and review staff timesheets for payroll processing
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/timesheets/clock')}
            >
              Time Clock
            </Button>
            <Button
              onClick={() => setShowNewForm(true)}
              disabled={showNewForm}
            >
              New Timesheet
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Timesheets</div>
            <div className="text-2xl font-bold mt-1">{timesheets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Pending Approval</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">
              {timesheets.filter(t => t.status === 'submitted').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Hours</div>
            <div className="text-2xl font-bold mt-1">{totals.totalHours.toFixed(2)}h</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Payroll</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(totals.totalPay, business)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="status_filter">Status</Label>
              <select
                id="status_filter"
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={filters.start_date || ''}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                className="w-full mt-1"
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={filters.end_date || ''}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                className="w-full mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setFilters({ status: '', start_date: '', end_date: '' })}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-red-800">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={loadTimesheets}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Timesheet Form */}
      {showNewForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Timesheet</CardTitle>
            <CardDescription>Enter timesheet details for payroll calculation</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTimesheet}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="period_id">Period ID *</Label>
                    <Input
                      id="period_id"
                      value={newTimesheet.timesheet_period_id}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, timesheet_period_id: e.target.value }))}
                      placeholder="Enter period identifier"
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="staff_id">Staff Profile ID *</Label>
                    <Input
                      id="staff_id"
                      value={newTimesheet.staff_profile_id}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, staff_profile_id: e.target.value }))}
                      placeholder="Enter staff profile ID"
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="regular_rate">Regular Rate *</Label>
                    <Input
                      id="regular_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newTimesheet.regular_rate}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, regular_rate: parseFloat(e.target.value) }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="overtime_rate">Overtime Rate</Label>
                    <Input
                      id="overtime_rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newTimesheet.overtime_rate}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, overtime_rate: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Hours Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="regular_hours">Regular Hours *</Label>
                    <Input
                      id="regular_hours"
                      type="number"
                      step="0.25"
                      min="0"
                      max="168"
                      value={newTimesheet.regular_hours}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, regular_hours: parseFloat(e.target.value) }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="overtime_hours">Overtime Hours</Label>
                    <Input
                      id="overtime_hours"
                      type="number"
                      step="0.25"
                      min="0"
                      max="40"
                      value={newTimesheet.overtime_hours}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, overtime_hours: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="break_hours">Break Hours</Label>
                    <Input
                      id="break_hours"
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={newTimesheet.break_hours}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, break_hours: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newTimesheet.notes}
                      onChange={(e) => setNewTimesheet(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Additional notes about this timesheet"
                      rows={2}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Calculation Preview */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700">Calculation Preview</p>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Regular Pay</p>
                    <p className="font-medium">
                      {formatCurrency(newTimesheet.regular_hours * newTimesheet.regular_rate, business)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Overtime Pay</p>
                    <p className="font-medium">
                      {formatCurrency(newTimesheet.overtime_hours * newTimesheet.overtime_rate, business)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Total Hours</p>
                    <p className="font-medium">
                      {(newTimesheet.regular_hours + newTimesheet.overtime_hours).toFixed(2)}h
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Total Pay</p>
                    <p className="font-medium text-green-600">
                      {formatCurrency(
                        (newTimesheet.regular_hours * newTimesheet.regular_rate) + 
                        (newTimesheet.overtime_hours * newTimesheet.overtime_rate), 
                        business
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !newTimesheet.timesheet_period_id || !newTimesheet.staff_profile_id}
                >
                  {creating ? 'Creating...' : 'Create Timesheet'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Timesheets List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Timesheets</CardTitle>
              <CardDescription>
                {timesheets.length} timesheet(s) found
                {filters.status && ` • Filtered by: ${filters.status}`}
              </CardDescription>
            </div>
            {loading && (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {timesheets.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-xl font-medium text-gray-900">No Timesheets</h3>
              <p className="text-gray-600 mt-2">
                {filters.status || filters.start_date || filters.end_date 
                  ? 'No timesheets match your filters'
                  : 'Start by creating your first timesheet'
                }
              </p>
              {(!filters.status && !filters.start_date && !filters.end_date) && (
                <Button
                  className="mt-4"
                  onClick={() => setShowNewForm(true)}
                >
                  Create First Timesheet
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Staff</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Period</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Hours</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Total Pay</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Created</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheets.map((timesheet) => (
                    <tr key={timesheet.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{timesheet.full_name}</p>
                          <p className="text-xs text-gray-600">{timesheet.employee_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{timesheet.period_name}</p>
                        <p className="text-xs text-gray-600">
                          {formatDisplayDate(timesheet.period_start_date)} - {formatDisplayDate(timesheet.period_end_date)}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm">
                            Reg: {parseFloat(timesheet.regular_hours).toFixed(2)}h
                          </p>
                          <p className="text-xs text-gray-600">
                            OT: {parseFloat(timesheet.overtime_hours).toFixed(2)}h
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium">{formatCurrency(timesheet.total_pay, business)}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={getStatusBadge(timesheet.status)}>
                          {getStatusText(timesheet.status)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{formatDisplayDate(timesheet.created_at)}</p>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/dashboard/management/workforce/timesheets/approval?timesheet=${timesheet.id}`)}
                          >
                            {timesheet.status === 'submitted' ? 'Review' : 'View'}
                          </Button>
                          {timesheet.status === 'draft' && (
                            <Button
                              size="sm"
                              onClick={() => {
                                // Handle submit action
                                alert('Submit functionality to be implemented');
                              }}
                            >
                              Submit
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="mt-6 flex gap-4">
        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="text-2xl mr-3">🕐</div>
              <div>
                <h3 className="font-medium">Time Clock</h3>
                <p className="text-sm text-gray-600">Staff clock in/out</p>
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => router.push('/dashboard/management/workforce/timesheets/clock')}
                >
                  Go to Time Clock →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="text-2xl mr-3">✅</div>
              <div>
                <h3 className="font-medium">Approval Queue</h3>
                <p className="text-sm text-gray-600">Review pending timesheets</p>
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => router.push('/dashboard/management/workforce/timesheets/approval')}
                >
                  Review Submissions →
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
