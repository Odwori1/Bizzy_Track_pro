'use client';

import { useAnalytics } from '@/hooks/week8/useAnalytics';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

export default function SalesAnalyticsPage() {
  const { performance, topProducts, loading, error, refetch } = useAnalytics();
  const { format } = useCurrency();

  if (loading) return <Loading />;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Analytics</h1>
          <p className="text-gray-600">Track your business performance</p>
        </div>
        <Button variant="outline" onClick={refetch}>
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
                {performance.revenue_trend >= 0 ? '+' : ''}{performance.revenue_trend}%
              </div>
              <p className="text-sm text-gray-600">vs previous period</p>
            </div>
          </Card>
        </div>
      )}

      {/* Top Products */}
      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">Top Selling Products</h2>
          {topProducts && topProducts.length > 0 ? (
            <div className="space-y-4">
              {topProducts.map((product, index) => (
                <div key={product.product_id || index} className="flex justify-between items-center border-b pb-3 last:border-0">
                  <div className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-medium">{product.product_name}</h3>
                      <p className="text-sm text-gray-600">Quantity sold: {product.quantity_sold}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{format(product.total_revenue)}</div>
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
