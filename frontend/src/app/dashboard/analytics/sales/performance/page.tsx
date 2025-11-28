'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface PerformanceData {
  date: any;
  transaction_count: string;
  total_sales: string;
  average_sale: string;
  unique_customers: string;
}

export default function PerformanceMetricsPage() {
  const { format } = useCurrency();

  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPerformanceData();
  }, [timeframe]);

  const fetchPerformanceData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Use the correct endpoint that exists
      const data = await apiClient.get<PerformanceData[]>('/analytics/sales/performance');
      setPerformanceData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch performance data');
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics from performance data
  const metrics = [
    {
      metric: 'Total Revenue',
      current: performanceData.reduce((sum, day) => sum + parseFloat(day.total_sales), 0).toFixed(2),
      previous: '0',
      change: performanceData.length > 1 ? 
        ((parseFloat(performanceData[0].total_sales) - parseFloat(performanceData[1]?.total_sales || 0)) / parseFloat(performanceData[1]?.total_sales || 1) * 100) : 0,
      is_positive: performanceData.length > 1 ? parseFloat(performanceData[0].total_sales) > parseFloat(performanceData[1]?.total_sales || 0) : true
    },
    {
      metric: 'Total Transactions',
      current: performanceData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0).toString(),
      previous: '0',
      change: performanceData.length > 1 ? 
        ((parseInt(performanceData[0].transaction_count) - parseInt(performanceData[1]?.transaction_count || 0)) / parseInt(performanceData[1]?.transaction_count || 1) * 100) : 0,
      is_positive: performanceData.length > 1 ? parseInt(performanceData[0].transaction_count) > parseInt(performanceData[1]?.transaction_count || 0) : true
    },
    {
      metric: 'Average Sale Value',
      current: (performanceData.reduce((sum, day) => sum + parseFloat(day.average_sale), 0) / Math.max(performanceData.length, 1)).toFixed(2),
      previous: '0',
      change: performanceData.length > 1 ? 
        ((parseFloat(performanceData[0].average_sale) - parseFloat(performanceData[1]?.average_sale || 0)) / parseFloat(performanceData[1]?.average_sale || 1) * 100) : 0,
      is_positive: performanceData.length > 1 ? parseFloat(performanceData[0].average_sale) > parseFloat(performanceData[1]?.average_sale || 0) : true
    },
    {
      metric: 'Unique Customers',
      current: performanceData.reduce((sum, day) => sum + parseInt(day.unique_customers), 0).toString(),
      previous: '0',
      change: performanceData.length > 1 ? 
        ((parseInt(performanceData[0].unique_customers) - parseInt(performanceData[1]?.unique_customers || 0)) / parseInt(performanceData[1]?.unique_customers || 1) * 100) : 0,
      is_positive: performanceData.length > 1 ? parseInt(performanceData[0].unique_customers) > parseInt(performanceData[1]?.unique_customers || 0) : true
    }
  ];

  const getChangeColor = (change: number, isPositive: boolean) => {
    if (change === 0) return 'text-gray-500';
    return isPositive ? 'text-green-600' : 'text-red-600';
  };

  const getChangeIcon = (change: number) => {
    if (change === 0) return '→';
    return change > 0 ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading performance metrics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance Metrics</h1>
          <p className="text-gray-600">Key performance indicators and business metrics</p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant={timeframe === '7d' ? 'primary' : 'outline'}
            onClick={() => setTimeframe('7d')}
          >
            7 Days
          </Button>
          <Button
            variant={timeframe === '30d' ? 'primary' : 'outline'}
            onClick={() => setTimeframe('30d')}
          >
            30 Days
          </Button>
          <Button
            variant={timeframe === '90d' ? 'primary' : 'outline'}
            onClick={() => setTimeframe('90d')}
          >
            90 Days
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{metric.metric}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {metric.metric.includes('Revenue') || metric.metric.includes('Value') 
                    ? format(metric.current)
                    : metric.current
                  }
                </p>
              </div>
              <div className={`text-sm font-medium ${getChangeColor(metric.change, metric.is_positive)}`}>
                {getChangeIcon(metric.change)} {Math.abs(metric.change).toFixed(1)}%
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              vs previous period
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Performance */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Performance</h2>
          {performanceData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No performance data available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sales
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transactions
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customers
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {performanceData.map((day, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(day.date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {format(day.total_sales)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {day.transaction_count}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {day.unique_customers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Performance Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Average Daily Sales</span>
                <span className="font-medium text-gray-900">
                  {format(
                    performanceData.reduce((sum, day) => sum + parseFloat(day.total_sales), 0) / 
                    Math.max(performanceData.length, 1)
                  )}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full"
                  style={{ 
                    width: `${Math.min(
                      (performanceData.reduce((sum, day) => sum + parseFloat(day.total_sales), 0) / 
                      Math.max(performanceData.length, 1) / 1000) * 100, 
                      100
                    )}%` 
                  }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Average Transactions per Day</span>
                <span className="font-medium text-gray-900">
                  {(
                    performanceData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0) / 
                    Math.max(performanceData.length, 1)
                  ).toFixed(1)}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full"
                  style={{ 
                    width: `${Math.min(
                      (performanceData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0) / 
                      Math.max(performanceData.length, 1) / 10) * 100, 
                      100
                    )}%` 
                  }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Customer Conversion Rate</span>
                <span className="font-medium text-gray-900">
                  {performanceData.length > 0 
                    ? `${(
                        (performanceData.reduce((sum, day) => sum + parseInt(day.unique_customers), 0) / 
                        performanceData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0)) * 100
                      ).toFixed(1)}%`
                    : '0%'
                  }
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-purple-600 h-2 rounded-full"
                  style={{ 
                    width: performanceData.length > 0 
                      ? `${(performanceData.reduce((sum, day) => sum + parseInt(day.unique_customers), 0) / 
                         performanceData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0)) * 100}%`
                      : '0%'
                  }}
                ></div>
              </div>
            </div>
          </div>

          {/* Quick Insights */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Performance Insights</h3>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• Best performing day: {performanceData.length > 0 
                ? formatDate(performanceData.reduce((max, day) => 
                    parseFloat(day.total_sales) > parseFloat(max.total_sales) ? day : max
                  ).date)
                : 'N/A'
              }</li>
              <li>• Total period revenue: {format(
                performanceData.reduce((sum, day) => sum + parseFloat(day.total_sales), 0)
              )}</li>
              <li>• Average transaction value: {format(
                performanceData.reduce((sum, day) => sum + parseFloat(day.total_sales), 0) / 
                Math.max(performanceData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0), 1)
              )}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
