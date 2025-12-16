import React from 'react';
import { DepartmentPerformanceMetrics } from '@/types/department';
import { useCurrency } from '@/lib/currency';

interface PerformanceMetricsProps {
  metrics: DepartmentPerformanceMetrics[];
  selectedDepartmentId?: string;
  onDepartmentSelect?: (departmentId: string) => void;
}

export const PerformanceMetrics: React.FC<PerformanceMetricsProps> = ({
  metrics,
  selectedDepartmentId,
  onDepartmentSelect,
}) => {
  const { format } = useCurrency();

  // Calculate overall averages
  const calculateOverallAverages = () => {
    if (metrics.length === 0) return null;

    const totals = {
      efficiency: 0,
      completion_rate: 0,
      total_revenue: 0,
      total_cost: 0,
      profit: 0,
      avg_completion_hours: 0,
      total_assignments: 0,
      completed_assignments: 0,
    };

    metrics.forEach(dept => {
      totals.efficiency += dept.efficiency || 0;
      totals.completion_rate += dept.completion_rate || 0;
      totals.total_revenue += dept.total_revenue || 0;
      totals.total_cost += dept.total_cost || 0;
      totals.profit += dept.profit || 0;
      totals.avg_completion_hours += dept.avg_completion_hours || 0;
      totals.total_assignments += dept.total_assignments || 0;
      totals.completed_assignments += dept.completed_assignments || 0;
    });

    return {
      avg_efficiency: totals.efficiency / metrics.length,
      avg_completion_rate: totals.completion_rate / metrics.length,
      total_revenue: totals.total_revenue,
      total_cost: totals.total_cost,
      total_profit: totals.profit,
      avg_completion_hours: totals.avg_completion_hours / metrics.length,
      overall_completion_rate: totals.completed_assignments / totals.total_assignments * 100,
    };
  };

  const overall = calculateOverallAverages();

  // Get efficiency color
  const getEfficiencyColor = (efficiency: number) => {
    if (efficiency >= 90) return 'text-green-600';
    if (efficiency >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get completion rate color
  const getCompletionColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Format hours
  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  return (
    <div className="space-y-6">
      {/* Overall Performance Summary */}
      {overall && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-600 uppercase tracking-wider mb-1">Avg Efficiency</div>
              <div className={`text-2xl font-bold ${getEfficiencyColor(overall.avg_efficiency)}`}>
                {overall.avg_efficiency.toFixed(1)}%
              </div>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-xs text-green-600 uppercase tracking-wider mb-1">Completion Rate</div>
              <div className={`text-2xl font-bold ${getCompletionColor(overall.avg_completion_rate)}`}>
                {overall.avg_completion_rate.toFixed(1)}%
              </div>
            </div>
            
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="text-xs text-purple-600 uppercase tracking-wider mb-1">Total Revenue</div>
              <div className="text-2xl font-bold text-gray-900">
                {format(overall.total_revenue)}
              </div>
            </div>
            
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-xs text-orange-600 uppercase tracking-wider mb-1">Avg Time</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatHours(overall.avg_completion_hours)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Performance Grid */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Department Performance</h3>
          <div className="text-sm text-gray-600">
            {metrics.length} departments
          </div>
        </div>

        {metrics.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="mt-2">No performance data available</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Efficiency
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Completion
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assignments
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Avg Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {metrics.map((dept) => (
                  <tr
                    key={dept.department_id}
                    className={`hover:bg-gray-50 cursor-pointer ${selectedDepartmentId === dept.department_id ? 'bg-blue-50' : ''}`}
                    onClick={() => onDepartmentSelect && onDepartmentSelect(dept.department_id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <span className="font-semibold text-gray-600">
                              {dept.department_name?.charAt(0) || 'D'}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {dept.department_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {dept.staff_count || 0} staff
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-semibold ${getEfficiencyColor(dept.efficiency)}`}>
                        {dept.efficiency?.toFixed(1) || '0'}%
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={`text-sm font-semibold mr-2 ${getCompletionColor(dept.completion_rate)}`}>
                          {dept.completion_rate?.toFixed(1) || '0'}%
                        </div>
                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${dept.completion_rate || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {dept.completed_assignments || 0}/{dept.total_assignments || 0}
                      </div>
                      <div className="text-xs text-gray-500">
                        {dept.in_progress_assignments || 0} in progress
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatHours(dept.avg_completion_hours || 0)}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {format(dept.total_revenue || 0)}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm font-medium ${(dept.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {format(dept.profit || 0)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Performance Insights */}
      {metrics.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top Performing Department */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Top Performer</div>
                <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
                </svg>
              </div>
              {(() => {
                const topDept = [...metrics].sort((a, b) => (b.efficiency || 0) - (a.efficiency || 0))[0];
                return (
                  <>
                    <div className="text-xl font-bold text-gray-900">{topDept.department_name}</div>
                    <div className={`text-lg font-semibold ${getEfficiencyColor(topDept.efficiency || 0)}`}>
                      {topDept.efficiency?.toFixed(1) || '0'}% efficiency
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Most Efficient */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Most Efficient</div>
                <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                </svg>
              </div>
              {(() => {
                const fastestDept = [...metrics].sort((a, b) => (a.avg_completion_hours || 0) - (b.avg_completion_hours || 0))[0];
                return (
                  <>
                    <div className="text-xl font-bold text-gray-900">{fastestDept.department_name}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatHours(fastestDept.avg_completion_hours || 0)} avg time
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Highest Revenue */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-gray-700">Highest Revenue</div>
                <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2h6a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a2 2 0 112-2 2 2 0 01-2 2zm8-1a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L14 12.586V9z" clipRule="evenodd" />
                </svg>
              </div>
              {(() => {
                const revenueDept = [...metrics].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))[0];
                return (
                  <>
                    <div className="text-xl font-bold text-gray-900">{revenueDept.department_name}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {format(revenueDept.total_revenue || 0)} revenue
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
