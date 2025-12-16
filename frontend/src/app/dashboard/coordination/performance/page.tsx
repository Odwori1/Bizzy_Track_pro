'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PerformanceMetrics } from '@/components/department/PerformanceMetrics';
import { useDepartment } from '@/hooks/useDepartment';

export default function PerformancePage() {
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { performanceMetrics, fetchPerformanceMetrics } = useDepartment();

  // Load performance data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchPerformanceMetrics();
      } catch (err: any) {
        setError(err.message || 'Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchPerformanceMetrics, dateRange]);

  // Calculate summary statistics
  const calculateSummary = () => {
    if (performanceMetrics.length === 0) return null;

    let totalEfficiency = 0;
    let totalRevenue = 0;
    let totalProfit = 0;
    let totalAssignments = 0;
    let completedAssignments = 0;

    performanceMetrics.forEach(dept => {
      totalEfficiency += dept.efficiency || 0;
      totalRevenue += dept.total_revenue || 0;
      totalProfit += dept.profit || 0;
      totalAssignments += dept.total_assignments || 0;
      completedAssignments += dept.completed_assignments || 0;
    });

    return {
      avgEfficiency: totalEfficiency / performanceMetrics.length,
      totalRevenue,
      totalProfit,
      completionRate: totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0,
      totalDepartments: performanceMetrics.length,
    };
  };

  const summary = calculateSummary();

  // Handle department selection
  const handleDepartmentSelect = (departmentId: string) => {
    setSelectedDepartmentId(departmentId);
    // In a real app, you might fetch detailed metrics for this department
    console.log('Selected department:', departmentId);
  };

  // Get selected department
  const selectedDepartment = selectedDepartmentId
    ? performanceMetrics.find(dept => dept.department_id === selectedDepartmentId)
    : null;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Performance</h1>
          <p className="text-gray-600 mt-1">
            Track and analyze department efficiency, revenue, and completion rates
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Time Period:</label>
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
          
          <Link href="/dashboard/coordination/performance/analytics">
            <Button variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Analytics
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchPerformanceMetrics()}
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Avg Efficiency</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {summary.avgEfficiency.toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                Across {summary.totalDepartments} departments
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Total Revenue</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    ${summary.totalRevenue.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                Generated from department work
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Total Profit</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    ${summary.totalProfit.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                After deducting department costs
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">Completion Rate</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {summary.completionRate.toFixed(1)}%
                  </div>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                Assignments completed on time
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Selected Department Details */}
      {selectedDepartment && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedDepartment.department_name}
                </h3>
                <p className="text-gray-600">
                  Detailed performance metrics
                </p>
              </div>
              <Link href={`/dashboard/coordination/performance/department/${selectedDepartment.department_id}`}>
                <Button variant="outline" size="sm">
                  View Full Details
                </Button>
              </Link>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Efficiency</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {selectedDepartment.efficiency?.toFixed(1) || '0'}%
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Assignments</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {selectedDepartment.completed_assignments || 0}/{selectedDepartment.total_assignments || 0}
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Revenue</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  ${selectedDepartment.total_revenue?.toLocaleString() || '0'}
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Avg Time</div>
                <div className="text-xl font-bold text-gray-900 mt-1">
                  {selectedDepartment.avg_completion_hours 
                    ? selectedDepartment.avg_completion_hours < 24 
                      ? `${selectedDepartment.avg_completion_hours.toFixed(1)}h`
                      : `${(selectedDepartment.avg_completion_hours / 24).toFixed(1)}d`
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Performance Metrics Table */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Department Performance</h2>
            <div className="text-sm text-gray-600">
              {performanceMetrics.length} department{performanceMetrics.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading performance data...</div>
            </div>
          ) : performanceMetrics.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No performance data</h3>
              <p className="mt-1 text-gray-500">
                Performance metrics will appear when departments complete assignments
              </p>
            </div>
          ) : (
            <PerformanceMetrics
              metrics={performanceMetrics}
              selectedDepartmentId={selectedDepartmentId || undefined}
              onDepartmentSelect={handleDepartmentSelect}
            />
          )}
        </div>
      </Card>

      {/* Insights & Recommendations */}
      {performanceMetrics.length > 0 && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Insights</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top Performers */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Top Performing Departments</h3>
                <div className="space-y-3">
                  {[...performanceMetrics]
                    .sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0))
                    .slice(0, 3)
                    .map((dept, index) => (
                      <div key={dept.department_id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 font-medium">{index + 1}</span>
                          </div>
                          <div>
                            <div className="font-medium">{dept.department_name}</div>
                            <div className="text-sm text-gray-600">
                              {dept.efficiency?.toFixed(1)}% efficiency
                            </div>
                          </div>
                        </div>
                        <div className="text-sm font-medium text-green-600">
                          ${dept.profit?.toLocaleString() || '0'}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Areas for Improvement */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Areas for Improvement</h3>
                <div className="space-y-3">
                  {[...performanceMetrics]
                    .filter(dept => dept.efficiency && dept.efficiency < 70)
                    .sort((a, b) => (a.efficiency || 0) - (b.efficiency || 0))
                    .slice(0, 3)
                    .map(dept => (
                      <div key={dept.department_id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.346 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-medium">{dept.department_name}</div>
                            <div className="text-sm text-gray-600">
                              Efficiency: {dept.efficiency?.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          Review
                        </Button>
                      </div>
                    ))}
                  
                  {performanceMetrics.filter(dept => dept.efficiency && dept.efficiency < 70).length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      All departments are performing well!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
