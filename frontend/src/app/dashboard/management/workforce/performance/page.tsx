'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { formatDisplayDate } from '@/lib/date-format';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { PerformanceMetric, PerformanceFilters } from '@/types/workforce';

// Helper function to safely convert to number
const safeNumber = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// Helper function to safely format numbers
const safeToFixed = (value: any, decimals: number = 2): string => {
  const num = safeNumber(value);
  return num.toFixed(decimals);
};

// Simple chart component for performance visualization
const PerformanceChart = ({ data, title }: { data: { label: string; value: number }[], title: string }) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-gray-700">{title}</h4>
      <div className="space-y-1">
        {data.map((item, index) => (
          <div key={index} className="flex items-center">
            <div className="w-24 text-xs text-gray-600 truncate">{item.label}</div>
            <div className="flex-1 ml-2">
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${(item.value / maxValue) * 100}%` }}
                />
              </div>
            </div>
            <div className="w-12 text-right text-xs font-medium">{item.value.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function PerformancePage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchPerformanceMetrics, createPerformanceMetric, fetchStaffProfiles, loading: workforceLoading } = useWorkforce();

  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PerformanceFilters>({});
  const [showNewMetricForm, setShowNewMetricForm] = useState(false);

  // New metric form state - adjusted for actual database structure
  const [newMetric, setNewMetric] = useState({
    staff_profile_id: '',
    metric_date: new Date().toISOString().split('T')[0],
    jobs_completed: 0,
    jobs_assigned: 0,
    total_hours_worked: 0,
    overtime_hours: 0,
    customer_rating_avg: null as number | null,
    efficiency_score: null as number | null,
    revenue_generated: 0,
    notes: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
  }, [authLoading, isAuthenticated, router, filters]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [metrics, profiles] = await Promise.all([
        fetchPerformanceMetrics(filters),
        fetchStaffProfiles()
      ]);

      // Ensure numeric fields are numbers
      const processedMetrics = (metrics || []).map(metric => ({
        ...metric,
        jobs_completed: safeNumber(metric.jobs_completed),
        jobs_assigned: safeNumber(metric.jobs_assigned),
        total_hours_worked: safeNumber(metric.total_hours_worked),
        overtime_hours: safeNumber(metric.overtime_hours),
        revenue_generated: safeNumber(metric.revenue_generated),
        efficiency_score: metric.efficiency_score !== null ? safeNumber(metric.efficiency_score) : null,
        customer_rating_avg: metric.customer_rating_avg !== null ? safeNumber(metric.customer_rating_avg) : null
      }));

      setPerformanceMetrics(processedMetrics);
      setStaffProfiles(profiles || []);
    } catch (err: any) {
      console.error('Error loading performance data:', err);
      setError(err.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      // Transform data to match backend schema
      const performanceData = {
        staff_profile_id: newMetric.staff_profile_id,
        metric_date: newMetric.metric_date,
        jobs_completed: newMetric.jobs_completed,
        jobs_assigned: newMetric.jobs_assigned,
        total_hours_worked: newMetric.total_hours_worked,
        overtime_hours: newMetric.overtime_hours,
        customer_rating_avg: newMetric.customer_rating_avg,
        efficiency_score: newMetric.efficiency_score,
        revenue_generated: newMetric.revenue_generated
      };

      await createPerformanceMetric(performanceData);

      // Reset form
      setNewMetric({
        staff_profile_id: '',
        metric_date: new Date().toISOString().split('T')[0],
        jobs_completed: 0,
        jobs_assigned: 0,
        total_hours_worked: 0,
        overtime_hours: 0,
        customer_rating_avg: null,
        efficiency_score: null,
        revenue_generated: 0,
        notes: ''
      });
      setShowNewMetricForm(false);
      loadData();
    } catch (err: any) {
      console.error('Error creating performance metric:', err);
      setError(err.message || 'Failed to create performance metric');
    } finally {
      setCreating(false);
    }
  };

  const handleFilterChange = (key: keyof PerformanceFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Calculate performance statistics
  const calculateStats = () => {
    if (performanceMetrics.length === 0) {
      return {
        averageEfficiency: 0,
        highestEfficiency: 0,
        lowestEfficiency: 0,
        totalRevenue: 0,
        totalMetrics: 0
      };
    }

    const efficiencyScores = performanceMetrics
      .filter(m => m.efficiency_score !== null && m.efficiency_score !== undefined)
      .map(m => m.efficiency_score as number);

    const totalRevenue = performanceMetrics.reduce((sum, m) => sum + safeNumber(m.revenue_generated), 0);

    return {
      averageEfficiency: efficiencyScores.length > 0
        ? efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length
        : 0,
      highestEfficiency: efficiencyScores.length > 0 ? Math.max(...efficiencyScores) : 0,
      lowestEfficiency: efficiencyScores.length > 0 ? Math.min(...efficiencyScores) : 0,
      totalRevenue,
      totalMetrics: performanceMetrics.length
    };
  };

  // Group metrics by staff for charts
  const groupMetricsByStaff = () => {
    const groups: Record<string, { label: string; efficiency: number; revenue: number }> = {};

    performanceMetrics.forEach(metric => {
      const staff = staffProfiles.find(p => p.id === metric.staff_profile_id);
      const staffName = staff?.user_full_name || `Staff ${metric.staff_profile_id.slice(0, 6)}`;

      if (!groups[staffName]) {
        groups[staffName] = {
          label: staffName,
          efficiency: 0,
          revenue: 0
        };
      }

      if (metric.efficiency_score !== null && metric.efficiency_score !== undefined) {
        groups[staffName].efficiency = safeNumber(metric.efficiency_score);
      }

      groups[staffName].revenue += safeNumber(metric.revenue_generated);
    });

    return Object.values(groups);
  };

  const stats = calculateStats();
  const staffMetrics = groupMetricsByStaff();

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
            <h1 className="text-3xl font-bold text-gray-900">Performance Management</h1>
            <p className="text-gray-600 mt-1">
              Track and analyze staff performance metrics
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={loadData}
            >
              Refresh
            </Button>
            <Button
              onClick={() => setShowNewMetricForm(true)}
              disabled={showNewMetricForm}
            >
              Add Metric
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Metrics</div>
            <div className="text-2xl font-bold mt-1">{stats.totalMetrics}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Avg Efficiency</div>
            <div className="text-2xl font-bold mt-1">{stats.averageEfficiency.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Top Efficiency</div>
            <div className="text-2xl font-bold mt-1">{stats.highestEfficiency.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Revenue</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(stats.totalRevenue, business)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Staff Tracked</div>
            <div className="text-2xl font-bold mt-1">{staffMetrics.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="staff_filter">Staff Member</Label>
              <select
                id="staff_filter"
                value={filters.staff_profile_id || ''}
                onChange={(e) => handleFilterChange('staff_profile_id', e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Staff</option>
                {staffProfiles.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.user_full_name} ({staff.employee_id})
                  </option>
                ))}
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
                onClick={loadData}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Metric Form */}
      {showNewMetricForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add Performance Metric</CardTitle>
            <CardDescription>Record a new performance measurement</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateMetric}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="staff_select">Staff Member *</Label>
                    <select
                      id="staff_select"
                      value={newMetric.staff_profile_id}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, staff_profile_id: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select staff member...</option>
                      {staffProfiles.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.user_full_name} ({staff.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="metric_date">Date *</Label>
                    <Input
                      id="metric_date"
                      type="date"
                      value={newMetric.metric_date}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, metric_date: e.target.value }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="jobs_completed">Jobs Completed *</Label>
                    <Input
                      id="jobs_completed"
                      type="number"
                      min="0"
                      value={newMetric.jobs_completed}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, jobs_completed: parseInt(e.target.value) || 0 }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="jobs_assigned">Jobs Assigned *</Label>
                    <Input
                      id="jobs_assigned"
                      type="number"
                      min="0"
                      value={newMetric.jobs_assigned}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, jobs_assigned: parseInt(e.target.value) || 0 }))}
                      required
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Performance Values */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="total_hours_worked">Total Hours Worked *</Label>
                    <Input
                      id="total_hours_worked"
                      type="number"
                      step="0.25"
                      min="0"
                      max="24"
                      value={newMetric.total_hours_worked}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, total_hours_worked: parseFloat(e.target.value) || 0 }))}
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
                      max="12"
                      value={newMetric.overtime_hours}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, overtime_hours: parseFloat(e.target.value) || 0 }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="efficiency_score">Efficiency Score (0-100)</Label>
                    <Input
                      id="efficiency_score"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={newMetric.efficiency_score || ''}
                      onChange={(e) => setNewMetric(prev => ({
                        ...prev,
                        efficiency_score: e.target.value ? parseFloat(e.target.value) : null
                      }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="revenue_generated">Revenue Generated</Label>
                    <Input
                      id="revenue_generated"
                      type="number"
                      step="0.01"
                      min="0"
                      value={newMetric.revenue_generated}
                      onChange={(e) => setNewMetric(prev => ({ ...prev, revenue_generated: parseFloat(e.target.value) || 0 }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Performance Preview */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700">Performance Preview</p>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Completion Rate</p>
                    <p className="font-medium">
                      {newMetric.jobs_assigned > 0
                        ? `${((newMetric.jobs_completed / newMetric.jobs_assigned) * 100).toFixed(1)}%`
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Efficiency</p>
                    <p className="font-medium">
                      {newMetric.efficiency_score ? `${newMetric.efficiency_score.toFixed(1)}%` : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Hours/Day</p>
                    <p className="font-medium">
                      {newMetric.total_hours_worked.toFixed(2)}h
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Revenue</p>
                    <p className="font-medium text-green-600">
                      {formatCurrency(newMetric.revenue_generated, business)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewMetricForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !newMetric.staff_profile_id}
                >
                  {creating ? 'Creating...' : 'Add Metric'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Performance Charts */}
      {staffMetrics.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Efficiency Scores</CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceChart
                  data={staffMetrics
                    .map(sm => ({ label: sm.label, value: sm.efficiency }))
                    .filter(item => item.value > 0)
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5)}
                  title="Top Performers by Efficiency"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Revenue Generated</CardTitle>
              </CardHeader>
              <CardContent>
                <PerformanceChart
                  data={staffMetrics
                    .map(sm => ({ label: sm.label, value: sm.revenue }))
                    .filter(item => item.value > 0)
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 5)}
                  title="Top Performers by Revenue"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Recent Metrics Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Performance Metrics</CardTitle>
              <CardDescription>
                {performanceMetrics.length} metric(s) found
              </CardDescription>
            </div>
            {loading && (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {performanceMetrics.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-medium text-gray-900">No Performance Metrics</h3>
              <p className="text-gray-600 mt-2">
                Start tracking performance by adding your first metric
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowNewMetricForm(true)}
              >
                Add First Metric
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Staff</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Jobs</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Hours</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Efficiency</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceMetrics.slice(0, 20).map((metric) => {
                    const staff = staffProfiles.find(p => p.id === metric.staff_profile_id);
                    const jobsCompleted = safeNumber(metric.jobs_completed);
                    const jobsAssigned = safeNumber(metric.jobs_assigned);
                    const totalHoursWorked = safeNumber(metric.total_hours_worked);
                    const overtimeHours = safeNumber(metric.overtime_hours);
                    const efficiencyScore = metric.efficiency_score !== null ? safeNumber(metric.efficiency_score) : null;
                    const revenue = safeNumber(metric.revenue_generated);
                    
                    const completionRate = jobsAssigned > 0
                      ? (jobsCompleted / jobsAssigned) * 100
                      : 0;

                    return (
                      <tr key={metric.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{staff?.user_full_name || 'Unknown Staff'}</p>
                            <p className="text-xs text-gray-600">{staff?.employee_id || 'N/A'}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-sm">{formatDisplayDate(metric.metric_date)}</p>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{jobsCompleted}/{jobsAssigned}</p>
                            <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(completionRate, 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-600">{completionRate.toFixed(1)}%</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{safeToFixed(totalHoursWorked, 2)}h</p>
                            {overtimeHours > 0 && (
                              <p className="text-xs text-amber-600">+{safeToFixed(overtimeHours, 2)} OT</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div className="w-16">
                              <span className="font-medium">
                                {efficiencyScore !== null ? `${safeToFixed(efficiencyScore, 1)}%` : 'N/A'}
                              </span>
                            </div>
                            {efficiencyScore !== null && (
                              <div className="flex-1 ml-2">
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      efficiencyScore >= 80 ? 'bg-green-500' :
                                      efficiencyScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                    style={{ width: `${Math.min(efficiencyScore, 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-green-600">
                            {formatCurrency(revenue, business)}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Performance Reports</h3>
            <p className="text-sm text-gray-600 mb-4">
              Generate detailed performance reports for staff reviews
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => alert('Report generation coming soon')}
            >
              Generate Report
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Goal Setting</h3>
            <p className="text-sm text-gray-600 mb-4">
              Set and track performance goals for your team
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => alert('Goal setting coming soon')}
            >
              Set Goals
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Team Comparison</h3>
            <p className="text-sm text-gray-600 mb-4">
              Compare performance across teams and departments
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => alert('Team comparison coming soon')}
            >
              Compare Teams
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
