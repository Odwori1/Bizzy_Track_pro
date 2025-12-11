import React, { useState, useEffect } from 'react';
import { Staff, StaffPerformanceMetrics } from '@/types/staff';
import { staffApi } from '@/lib/api/staff';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { formatDate } from '@/lib/date-format';

interface StaffPerformanceProps {
  staff: Staff;
  showFilters?: boolean;
}

export const StaffPerformance: React.FC<StaffPerformanceProps> = ({ 
  staff,
  showFilters = true 
}) => {
  const { format } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performance, setPerformance] = useState<StaffPerformanceMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year' | 'all'>('month');

  useEffect(() => {
    if (staff?.id) {
      fetchPerformance();
    } else {
      setError('Invalid staff member');
      setLoading(false);
    }
  }, [staff?.id, timeRange]);

  const fetchPerformance = async () => {
    try {
      setLoading(true);
      const filters = { period: timeRange };
      const data = await staffApi.getStaffPerformance(staff.id, filters);
      setPerformance(data);
      setError(null);
    } catch (err: any) {
      console.error('Performance fetch error:', err);
      setError(err.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  };

  const calculateEfficiency = () => {
    if (!performance) return 0;
    const { jobs_completed = 0, jobs_pending = 0 } = performance;
    const totalJobs = jobs_completed + jobs_pending;
    return totalJobs > 0 ? (jobs_completed / totalJobs) * 100 : 0;
  };

  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 90) return 'text-green-600';
    if (efficiency >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading performance data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchPerformance} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!performance) {
    return (
      <div className="text-center py-8 text-gray-500">
        No performance data available for this staff member.
      </div>
    );
  }

  const efficiency = calculateEfficiency();

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Performance Overview</h3>
          <p className="text-sm text-gray-600">
            Showing data for {staff?.full_name || 'Staff Member'} • {formatDate(new Date().toISOString())}
          </p>
        </div>
        
        {showFilters && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Period:</span>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchPerformance}>
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Performance Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Jobs */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-600">Total Jobs</div>
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{performance.total_jobs || 0}</div>
          <div className="text-xs text-gray-500 mt-2">All assigned jobs</div>
        </div>

        {/* Completed Jobs */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-600">Completed</div>
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{performance.jobs_completed || 0}</div>
          <div className="text-xs text-gray-500 mt-2">
            {performance.total_jobs > 0 
              ? `${((performance.jobs_completed / performance.total_jobs) * 100).toFixed(1)}% completion rate`
              : 'No jobs assigned'}
          </div>
        </div>

        {/* Revenue Generated */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-600">Revenue Generated</div>
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{format(performance.revenue_generated || 0)}</div>
          <div className="text-xs text-gray-500 mt-2">Total revenue from completed jobs</div>
        </div>

        {/* Efficiency Score */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-gray-600">Efficiency Score</div>
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
          <div className={`text-2xl font-bold ${getEfficiencyColor(efficiency)}`}>
            {performance.efficiency_score?.toFixed(1) || efficiency.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {efficiency >= 90 ? 'Excellent performance' : 
             efficiency >= 70 ? 'Good performance' : 
             'Needs improvement'}
          </div>
        </div>
      </div>

      {/* Detailed Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Status Breakdown */}
        <div className="bg-white rounded-lg border p-6">
          <h4 className="font-medium text-gray-800 mb-4">Job Status Breakdown</h4>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">In Progress</span>
                <span className="font-medium">{performance.jobs_in_progress || 0}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-yellow-500"
                  style={{ width: `${performance.total_jobs > 0 ? ((performance.jobs_in_progress || 0) / performance.total_jobs) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Pending</span>
                <span className="font-medium">{performance.jobs_pending || 0}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500"
                  style={{ width: `${performance.total_jobs > 0 ? ((performance.jobs_pending || 0) / performance.total_jobs) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Completed</span>
                <span className="font-medium">{performance.jobs_completed || 0}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500"
                  style={{ width: `${performance.total_jobs > 0 ? ((performance.jobs_completed || 0) / performance.total_jobs) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="bg-white rounded-lg border p-6">
          <h4 className="font-medium text-gray-800 mb-4">Additional Metrics</h4>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Hours Worked</span>
              <span className="font-medium">{(performance.total_hours || 0).toFixed(1)} hrs</span>
            </div>
            
            {performance.average_rating && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average Rating</span>
                <div className="flex items-center">
                  <span className="font-medium mr-2">{performance.average_rating.toFixed(1)}</span>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${star <= Math.round(performance.average_rating!) ? 'text-yellow-400' : 'text-gray-300'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {performance.last_activity && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Last Activity</span>
                <span className="font-medium">{formatDate(performance.last_activity)}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Revenue per Job</span>
              <span className="font-medium">
                {performance.jobs_completed > 0 
                  ? format((performance.revenue_generated || 0) / performance.jobs_completed)
                  : format(0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Notes */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              Performance metrics are calculated based on completed jobs, time spent, and revenue generated.
              Efficiency score considers completion rate and customer satisfaction ratings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
