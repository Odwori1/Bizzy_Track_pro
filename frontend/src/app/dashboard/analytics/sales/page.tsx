// frontend/src/app/dashboard/analytics/sales/page.tsx - FIXED DATA HANDLING
'use client';

import React from 'react';
import { useAnalytics } from '@/hooks/week8/useAnalytics';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { LineChart } from '@/components/charts/LineChart';
import { BarChart } from '@/components/charts/BarChart';
import { PieChart } from '@/components/charts/PieChart';
import { formatDateForChart } from '@/lib/date-utils';

export default function SalesAnalyticsPage() {
  const { performance, performanceData, topProducts, paymentMethods, loading, error, refetch } = useAnalytics();
  const { format } = useCurrency();

  if (loading) return <Loading />;
  if (error) return <div className="text-red-600 p-6">Error: {error}</div>;

  // Prepare chart data with proper date handling
  const revenueChartData = {
    labels: performanceData.map(item => formatDateForChart(item.date)),
    datasets: [
      {
        label: 'Daily Revenue',
        data: performanceData.map(item => parseFloat(item.total_sales || '0')),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      }
    ]
  };

  const topProductsChartData = {
    labels: topProducts.slice(0, 5).map(item => item.product_name || 'Unknown Product'),
    datasets: [
      {
        label: 'Revenue',
        data: topProducts.slice(0, 5).map(item => item.total_revenue || 0),
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 205, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
        ],
      }
    ]
  };

  const paymentMethodsChartData = {
    labels: paymentMethods.map(item => item.payment_method || 'Unknown'),
    datasets: [
      {
        label: 'Payment Distribution',
        data: paymentMethods.map(item => item.total_amount || 0),
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 205, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
        ],
      }
    ]
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Analytics</h1>
          <p className="text-gray-600">Track your business performance with real-time data</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          Refresh Data
        </Button>
      </div>

      {/* Performance Metrics */}
      {performance && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Total Revenue</h3>
              <div className="text-2xl font-bold mt-2 text-green-600">
                {format(performance.total_revenue)}
              </div>
              <p className="text-sm text-gray-600">All time sales</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Total Transactions</h3>
              <div className="text-2xl font-bold mt-2">
                {performance.total_transactions}
              </div>
              <p className="text-sm text-gray-600">Completed orders</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Average Order Value</h3>
              <div className="text-2xl font-bold mt-2">
                {format(performance.average_order_value)}
              </div>
              <p className="text-sm text-gray-600">Per transaction</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Revenue Trend</h3>
              <div className={`text-2xl font-bold mt-2 ${
                performance.revenue_trend >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {performance.revenue_trend >= 0 ? '+' : ''}{performance.revenue_trend.toFixed(1)}%
              </div>
              <p className="text-sm text-gray-600">vs previous period</p>
            </div>
          </Card>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trends Line Chart */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Revenue Trends</h2>
            {performanceData.length > 0 ? (
              <LineChart
                data={revenueChartData}
                title="Daily Revenue Over Time"
                height={300}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                No revenue data available
              </div>
            )}
          </div>
        </Card>

        {/* Payment Methods Pie Chart */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Payment Methods</h2>
            {paymentMethods.length > 0 ? (
              <PieChart
                data={paymentMethodsChartData}
                title="Sales by Payment Method"
                height={300}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                No payment method data available
              </div>
            )}
          </div>
        </Card>

        {/* Top Products Bar Chart */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Top Selling Products</h2>
            {topProducts.length > 0 ? (
              <BarChart
                data={topProductsChartData}
                title="Top 5 Products by Revenue"
                height={300}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                No product sales data available
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Top Products List */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Top Selling Products</h2>
          {topProducts.length > 0 ? (
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product.product_id || index} className="flex justify-between items-center border-b pb-3 last:border-0">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-medium">{product.product_name || 'Unknown Product'}</h3>
                      <p className="text-sm text-gray-600">Quantity sold: {product.quantity_sold || 0}</p>
                      <p className="text-xs text-gray-500">Type: {product.item_type || 'product'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{format(product.total_revenue || 0)}</div>
                    <div className="text-sm text-gray-600">Revenue</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No sales data available yet
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
