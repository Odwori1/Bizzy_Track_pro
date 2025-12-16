'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDepartment } from '@/hooks/useDepartment';
import { DepartmentPerformanceMetrics } from '@/types/department';
import { useCurrency } from '@/lib/currency';

export default function DepartmentPerformancePage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.id as string;
  
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceData, setPerformanceData] = useState<DepartmentPerformanceMetrics | null>(null);
  const [trendData, setTrendData] = useState<any[]>([]);

  const { fetchDepartmentPerformanceById } = useDepartment();
  const { format } = useCurrency();

  // Load performance data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDepartmentPerformanceById(departmentId);
        setPerformanceData(data);
        
        // Generate mock trend data for demo
        const mockTrend = generateTrendData(dateRange);
        setTrendData(mockTrend);
      } catch (err: any) {
        setError(err.message || 'Failed to load department performance');
      } finally {
        setLoading(false);
      }
    };

    if (departmentId) {
      loadData();
    }
  }, [departmentId, fetchDepartmentPerformanceById, dateRange]);

  // Generate mock trend data
  const generateTrendData = (range: string) => {
    const data = [];
    const days = range === 'week' ? 7 : range === 'month' ? 30 : range === 'quarter' ? 90 : 365;
    
    for (let i = 0; i < days; i += Math.ceil(days / 12)) {
      data.push({
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        efficiency: 70 + Math.random() * 25,
        revenue: Math.random() * 10000,
        assignments: Math.floor(Math.random() * 20),
      });
    }
    
    return data;
  };

  // Calculate trend indicators
  const calculateTrends = () => {
    if (trendData.length < 2) return null;
    
    const first = trendData[0];
    const last = trendData[trendData.length - 1];
    
    return {
      efficiencyTrend: last.efficiency - first.efficiency,
      revenueTrend: last.revenue - first.revenue,
      assignmentsTrend: last.assignments - first.assignments,
    };
  };

  const trends = calculateTrends();

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading performance data...</div>
        </div>
      </div>
    );
  }

  if (error || !performanceData) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">
            {error || 'Performance data not found'}
          </div>
          <div className="mt-4">
            <Link href="/dashboard/coordination/performance">
              <Button variant="secondary" size="sm">
                Back to Performance
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href="/dashboard/coordination/performance">
              <Button variant="ghost" size="sm">
                ← Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {performanceData.department_name} Performance
            </h1>
          </div>
          <p className="text-gray-600 mt-1">
            Detailed performance metrics and analytics
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Period:</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Efficiency</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {performanceData.efficiency?.toFixed(1) || '0'}%
                </div>
              </div>
              {trends && (
                <div className={`text-sm font-medium ${trends.efficiencyTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.efficiencyTrend >= 0 ? '↑' : '↓'} {Math.abs(trends.efficiencyTrend).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    (performanceData.efficiency || 0) >= 90 ? 'bg-green-500' :
                    (performanceData.efficiency || 0) >= 75 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${performanceData.efficiency || 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Revenue</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {format(performanceData.total_revenue || 0)}
                </div>
              </div>
              {trends && (
                <div className={`text-sm font-medium ${trends.revenueTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {trends.revenueTrend >= 0 ? '↑' : '↓'} {format(Math.abs(trends.revenueTrend))}
                </div>
              )}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              From {performanceData.total_assignments || 0} assignments
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Profit</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {format(performanceData.profit || 0)}
                </div>
              </div>
              <div className={`text-sm font-medium ${(performanceData.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {(performanceData.profit || 0) >= 0 ? 'Profitable' : 'Loss'}
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              Margin: {performanceData.total_revenue 
                ? `${((performanceData.profit || 0) / performanceData.total_revenue * 100).toFixed(1)}%`
                : '0%'}
            </div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">Avg Time</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {performanceData.avg_completion_hours 
                    ? performanceData.avg_completion_hours < 24 
                      ? `${performanceData.avg_completion_hours.toFixed(1)}h`
                      : `${(performanceData.avg_completion_hours / 24).toFixed(1)}d`
                    : 'N/A'}
                </div>
              </div>
              <div className="text-sm font-medium text-gray-600">
                Per assignment
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-600">
              {performanceData.completed_assignments || 0} completed
            </div>
          </div>
        </Card>
      </div>

      {/* Assignment Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Breakdown</h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-700">Total Assignments</div>
                  <div className="text-sm font-semibold text-gray-900">
                    {performanceData.total_assignments || 0}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="h-2 bg-blue-500 rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-700">Completed</div>
                  <div className="text-sm font-semibold text-green-600">
                    {performanceData.completed_assignments || 0}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 bg-green-500 rounded-full"
                    style={{ 
                      width: `${((performanceData.completed_assignments || 0) / (performanceData.total_assignments || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-700">In Progress</div>
                  <div className="text-sm font-semibold text-yellow-600">
                    {performanceData.in_progress_assignments || 0}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 bg-yellow-500 rounded-full"
                    style={{ 
                      width: `${((performanceData.in_progress_assignments || 0) / (performanceData.total_assignments || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
              
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-gray-700">Pending</div>
                  <div className="text-sm font-semibold text-blue-600">
                    {performanceData.pending_assignments || 0}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 bg-blue-500 rounded-full"
                    style={{ 
                      width: `${((performanceData.pending_assignments || 0) / (performanceData.total_assignments || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t">
              <div className="text-sm text-gray-600">
                Completion Rate: {performanceData.completion_rate?.toFixed(1) || '0'}%
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
            
            {trendData.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No trend data available</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Efficiency Trend */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-700">Efficiency Trend</div>
                    {trends && (
                      <div className={`text-sm font-medium ${trends.efficiencyTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trends.efficiencyTrend >= 0 ? 'Improving' : 'Declining'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-end h-24 space-x-1">
                    {trendData.map((point, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-blue-100 rounded-t"
                          style={{ height: `${(point.efficiency / 100) * 80}px` }}
                        ></div>
                        <div className="text-xs text-gray-500 mt-1 truncate">
                          {point.date}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Revenue Trend */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-gray-700">Revenue Trend</div>
                    {trends && (
                      <div className={`text-sm font-medium ${trends.revenueTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trends.revenueTrend >= 0 ? 'Increasing' : 'Decreasing'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-end h-24 space-x-1">
                    {trendData.map((point, index) => {
                      const maxRevenue = Math.max(...trendData.map(p => p.revenue));
                      const height = maxRevenue > 0 ? (point.revenue / maxRevenue) * 80 : 0;
                      
                      return (
                        <div key={index} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full bg-green-100 rounded-t"
                            style={{ height: `${height}px` }}
                          ></div>
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            {point.date}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Recommendations</h3>
          
          <div className="space-y-4">
            {/* Efficiency Recommendations */}
            {(performanceData.efficiency || 0) < 80 && (
              <div className="flex items-start p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-medium text-yellow-800">Improve Efficiency</div>
                  <div className="text-yellow-700 text-sm mt-1">
                    Current efficiency is {(performanceData.efficiency || 0).toFixed(1)}%. Consider optimizing workflows,
                    reducing idle time, and improving staff training.
                  </div>
                </div>
              </div>
            )}
            
            {/* Profit Recommendations */}
            {(performanceData.profit || 0) < 0 && (
              <div className="flex items-start p-4 bg-red-50 rounded-lg border border-red-200">
                <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-medium text-red-800">Profitability Concern</div>
                  <div className="text-red-700 text-sm mt-1">
                    Department is operating at a loss. Review costs, pricing, and resource allocation.
                  </div>
                </div>
              </div>
            )}
            
            {/* Completion Time Recommendations */}
            {(performanceData.avg_completion_hours || 0) > 48 && (
              <div className="flex items-start p-4 bg-blue-50 rounded-lg border border-blue-200">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-medium text-blue-800">High Completion Time</div>
                  <div className="text-blue-700 text-sm mt-1">
                    Average completion time is {performanceData.avg_completion_hours?.toFixed(1)} hours.
                    Consider breaking down complex tasks or adding more resources.
                  </div>
                </div>
              </div>
            )}
            
            {/* Positive Performance */}
            {(performanceData.efficiency || 0) >= 85 && (performanceData.profit || 0) > 0 && (
              <div className="flex items-start p-4 bg-green-50 rounded-lg border border-green-200">
                <svg className="w-5 h-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <div className="font-medium text-green-800">Excellent Performance</div>
                  <div className="text-green-700 text-sm mt-1">
                    Department is performing well with high efficiency and profitability.
                    Consider sharing best practices with other departments.
                  </div>
                </div>
              </div>
            )}
            
            {/* No Issues */}
            {(performanceData.efficiency || 0) >= 80 && (performanceData.profit || 0) >= 0 && (
              <div className="text-center py-4 text-gray-500">
                No major performance issues detected. Department is performing within acceptable ranges.
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
