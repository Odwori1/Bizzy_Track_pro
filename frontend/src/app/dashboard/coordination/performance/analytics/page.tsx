'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDepartment } from '@/hooks/useDepartment';
import { useCurrency } from '@/lib/currency';

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [chartType, setChartType] = useState<'efficiency' | 'revenue' | 'completion' | 'profit'>('efficiency');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { performanceMetrics, fetchPerformanceMetrics } = useDepartment();
  const { format } = useCurrency();

  // Safe formatting function for metric values
  const formatMetricValue = (value: any): string => {
    if (value === null || value === undefined) return '0';
    
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) return '0';
    
    // Handle different metric types
    if (Math.abs(numValue) < 1000) {
      return numValue.toFixed(1);
    }
    
    return Math.round(numValue).toString();
  };

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchPerformanceMetrics();
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchPerformanceMetrics, dateRange]);

  // Calculate statistics
  const calculateStats = () => {
    if (performanceMetrics.length === 0) return null;

    const stats = {
      highestEfficiency: { name: '', value: 0 },
      highestRevenue: { name: '', value: 0 },
      highestProfit: { name: '', value: 0 },
      fastestCompletion: { name: '', value: Infinity },
      totalDepartments: performanceMetrics.length,
      totalRevenue: 0,
      totalProfit: 0,
      avgEfficiency: 0,
    };

    let totalEfficiency = 0;
    let totalRevenue = 0;
    let totalProfit = 0;

    performanceMetrics.forEach(dept => {
      totalEfficiency += dept.efficiency || 0;
      totalRevenue += dept.total_revenue || 0;
      totalProfit += dept.profit || 0;

      if ((dept.efficiency || 0) > stats.highestEfficiency.value) {
        stats.highestEfficiency = { name: dept.department_name, value: dept.efficiency || 0 };
      }

      if ((dept.total_revenue || 0) > stats.highestRevenue.value) {
        stats.highestRevenue = { name: dept.department_name, value: dept.total_revenue || 0 };
      }

      if ((dept.profit || 0) > stats.highestProfit.value) {
        stats.highestProfit = { name: dept.department_name, value: dept.profit || 0 };
      }

      if ((dept.avg_completion_hours || Infinity) < stats.fastestCompletion.value) {
        stats.fastestCompletion = { name: dept.department_name, value: dept.avg_completion_hours || 0 };
      }
    });

    stats.avgEfficiency = totalEfficiency / performanceMetrics.length;
    stats.totalRevenue = totalRevenue;
    stats.totalProfit = totalProfit;

    return stats;
  };

  const stats = calculateStats();

  // Generate chart data
  const getChartData = () => {
    const sortedMetrics = [...performanceMetrics].sort((a, b) => {
      switch (chartType) {
        case 'efficiency': return (b.efficiency || 0) - (a.efficiency || 0);
        case 'revenue': return (b.total_revenue || 0) - (a.total_revenue || 0);
        case 'profit': return (b.profit || 0) - (a.profit || 0);
        case 'completion': return (a.avg_completion_hours || 0) - (b.avg_completion_hours || 0);
        default: return 0;
      }
    }).slice(0, 8); // Top 8 departments

    return sortedMetrics.map(dept => ({
      name: dept.department_name,
      value: chartType === 'efficiency' ? dept.efficiency || 0 :
             chartType === 'revenue' ? dept.total_revenue || 0 :
             chartType === 'profit' ? dept.profit || 0 :
             dept.avg_completion_hours || 0,
      type: chartType,
    }));
  };

  const chartData = getChartData();

  const getChartColor = (value: number) => {
    if (chartType === 'efficiency') {
      if (value >= 90) return 'bg-green-500';
      if (value >= 75) return 'bg-yellow-500';
      return 'bg-red-500';
    }
    if (chartType === 'profit') {
      return value >= 0 ? 'bg-green-500' : 'bg-red-500';
    }
    return 'bg-blue-500';
  };

  const getChartLabel = () => {
    switch (chartType) {
      case 'efficiency': return 'Efficiency (%)';
      case 'revenue': return 'Revenue ($)';
      case 'profit': return 'Profit ($)';
      case 'completion': return 'Avg Completion Time (hours)';
      default: return '';
    }
  };

  const formatChartValue = (value: number) => {
    switch (chartType) {
      case 'efficiency': return `${value.toFixed(1)}%`;
      case 'revenue': return format(value);
      case 'profit': return format(value);
      case 'completion': return value < 24 ? `${value.toFixed(1)}h` : `${(value / 24).toFixed(1)}d`;
      default: return formatMetricValue(value);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading analytics...</div>
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
            <h1 className="text-2xl font-bold text-gray-900">Advanced Analytics</h1>
          </div>
          <p className="text-gray-600 mt-1">
            Deep insights and visualizations for department performance
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

          <Button variant="outline">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Report
          </Button>
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

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Avg Efficiency</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {formatMetricValue(stats.avgEfficiency)}%
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Highest: {stats.highestEfficiency.name} ({formatMetricValue(stats.highestEfficiency.value)}%)
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Total Revenue</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {format(stats.totalRevenue)}
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Highest: {stats.highestRevenue.name} ({format(stats.highestRevenue.value)})
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Total Profit</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {format(stats.totalProfit)}
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Highest: {stats.highestProfit.name} ({format(stats.highestProfit.value)})
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="text-xs text-gray-500 uppercase tracking-wider">Fastest Completion</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {formatMetricValue(stats.fastestCompletion.value)}
              </div>
              <div className="text-sm text-gray-600 mt-2">
                {stats.fastestCompletion.name}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Chart Controls */}
      <Card>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-gray-900">Performance Comparison</h3>

            <div className="flex items-center space-x-2">
              {(['efficiency', 'revenue', 'profit', 'completion'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${
                    chartType === type
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Chart Visualization */}
      <Card>
        <div className="p-6">
          <h4 className="font-medium text-gray-900 mb-4">{getChartLabel()}</h4>

          {performanceMetrics.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="mt-2">No data available for chart</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Bar Chart */}
              <div className="space-y-4">
                {chartData.map((item, index) => {
                  const maxValue = Math.max(...chartData.map(d => d.value));
                  const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-900">
                          {item.name}
                        </div>
                        <div className="text-sm font-semibold text-gray-900">
                          {formatChartValue(item.value)}
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full ${getChartColor(item.value)}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Department Performance Grid */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Department Performance Matrix</h3>

          {performanceMetrics.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No performance data available</p>
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
                      Revenue
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completion Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {performanceMetrics.map(dept => {
                    // Calculate performance score (0-100)
                    const efficiencyScore = dept.efficiency || 0;
                    const completionScore = dept.completion_rate || 0;
                    const profitScore = dept.profit && dept.total_revenue
                      ? Math.min(100, (dept.profit / dept.total_revenue) * 100 * 2)
                      : 0;
                    const timeScore = dept.avg_completion_hours
                      ? Math.max(0, 100 - (dept.avg_completion_hours / 48) * 100)
                      : 0;

                    const totalScore = Math.round(
                      (efficiencyScore + completionScore + profitScore + timeScore) / 4
                    );

                    return (
                      <tr key={dept.department_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link
                            href={`/dashboard/coordination/performance/department/${dept.department_id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {dept.department_name}
                          </Link>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`text-sm font-semibold ${
                              (dept.efficiency || 0) >= 90 ? 'text-green-600' :
                              (dept.efficiency || 0) >= 75 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {formatMetricValue(dept.efficiency)}%
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {format(dept.total_revenue || 0)}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-medium ${
                            (dept.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {format(dept.profit || 0)}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {dept.avg_completion_hours
                            ? dept.avg_completion_hours < 24
                              ? `${formatMetricValue(dept.avg_completion_hours)}h`
                              : `${formatMetricValue(dept.avg_completion_hours / 24)}d`
                            : 'N/A'}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`text-sm font-semibold mr-2 ${
                              (dept.completion_rate || 0) >= 90 ? 'text-green-600' :
                              (dept.completion_rate || 0) >= 75 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {formatMetricValue(dept.completion_rate)}%
                            </div>
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${dept.completion_rate || 0}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            totalScore >= 90 ? 'bg-green-100 text-green-800' :
                            totalScore >= 75 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {totalScore}/100
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
