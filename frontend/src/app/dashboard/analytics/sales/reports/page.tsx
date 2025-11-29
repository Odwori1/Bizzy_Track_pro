'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface SalesReport {
  date: any;
  transaction_count: string;
  total_sales: string;
  average_sale: string;
  unique_customers: string;
}

interface TopItem {
  item_name: string;
  item_type: string;
  total_quantity: string;
  total_revenue: string;
  transaction_count: string;
}

interface Transaction {
  id: string;
  transaction_number: string;
  transaction_date: any;
  final_amount: string;
  payment_method: string;
  customer_name: string;
  item_count: string;
}

export default function SalesReportsPage() {
  const { format } = useCurrency();

  const [performanceData, setPerformanceData] = useState<SalesReport[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analytics' | 'transactions'>('analytics');

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [performanceData, topItemsData, transactionsData] = await Promise.all([
        apiClient.get<SalesReport[]>('/analytics/sales/performance'),
        apiClient.get<TopItem[]>('/analytics/sales/top-items'),
        apiClient.get<Transaction[]>('/pos/transactions')
      ]);

      setPerformanceData(performanceData);
      setTopItems(topItemsData);
      setTransactions(transactionsData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  // Filter transactions by date range
  const filteredTransactions = transactions.filter(transaction => {
    const transactionDate = new Date(transaction.transaction_date.utc);
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999); // Include entire end date
    
    return transactionDate >= startDate && transactionDate <= endDate;
  });

  const exportToCSV = () => {
    let csvContent = '';
    const headers = ['Date', 'Transaction #', 'Customer', 'Payment Method', 'Items', 'Amount'];
    
    if (activeTab === 'analytics') {
      // Export analytics data
      const analyticsHeaders = ['Date', 'Transactions', 'Total Sales', 'Average Sale', 'Unique Customers'];
      const analyticsData = performanceData.map(report => [
        formatDate(report.date),
        report.transaction_count,
        report.total_sales,
        report.average_sale,
        report.unique_customers
      ]);
      
      csvContent = [analyticsHeaders, ...analyticsData]
        .map(row => row.join(','))
        .join('\n');
    } else {
      // Export transaction data
      const transactionData = filteredTransactions.map(transaction => [
        formatDate(transaction.transaction_date),
        transaction.transaction_number,
        transaction.customer_name || 'Walk-in',
        transaction.payment_method,
        transaction.item_count,
        transaction.final_amount
      ]);
      
      csvContent = [headers, ...transactionData]
        .map(row => row.join(','))
        .join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${activeTab}-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading sales reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Reports</h1>
          <p className="text-gray-600">Detailed sales analysis and transaction history</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={exportToCSV}>
            Export CSV
          </Button>
          <Button variant="primary" onClick={fetchReports}>
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Period</h2>
        <div className="flex flex-col sm:flex-row sm:items-end space-y-4 sm:space-y-0 sm:space-x-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex space-x-2">
            <Button
              variant={activeTab === 'analytics' ? 'primary' : 'outline'}
              onClick={() => setActiveTab('analytics')}
            >
              Analytics View
            </Button>
            <Button
              variant={activeTab === 'transactions' ? 'primary' : 'outline'}
              onClick={() => setActiveTab('transactions')}
            >
              Transactions View
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'analytics' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Reports */}
          <div className="lg:col-span-2 space-y-6">
            {/* Sales Performance */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Performance (Aggregated)</h2>
              {performanceData.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No aggregated sales data available.</p>
                  <p className="text-gray-400 text-sm mt-2">Switch to Transactions view to see individual sales.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transactions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Sales
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Average Sale
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Unique Customers
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {performanceData.map((report, index) => (
                        <tr key={index}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatDate(report.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {report.transaction_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(report.total_sales)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {format(report.average_sale)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {report.unique_customers}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Top Items */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Selling Items</h2>
              {topItems.length === 0 ? (
                <p className="text-gray-500 text-sm">No product data available.</p>
              ) : (
                <div className="space-y-3">
                  {topItems.slice(0, 5).map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                        <div className="text-xs text-gray-500">
                          {item.item_type} • Sold: {item.total_quantity}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-gray-900">
                        {format(item.total_revenue)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Sales</span>
                  <span className="text-sm font-medium text-gray-900">
                    {format(performanceData.reduce((sum, report) => sum + parseFloat(report.total_sales), 0))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Transactions</span>
                  <span className="text-sm font-medium text-gray-900">
                    {performanceData.reduce((sum, report) => sum + parseInt(report.transaction_count), 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Average Sale</span>
                  <span className="text-sm font-medium text-gray-900">
                    {format(
                      performanceData.reduce((sum, report) => sum + parseFloat(report.total_sales), 0) /
                      Math.max(performanceData.reduce((sum, report) => sum + parseInt(report.transaction_count), 0), 1)
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Reporting Period</span>
                  <span className="text-sm font-medium text-gray-900">
                    {dateRange.start} to {dateRange.end}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Transactions View */
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Individual Transactions ({filteredTransactions.length})
          </h2>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No transactions found for the selected period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transaction #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatDate(transaction.transaction_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-mono">
                        {transaction.transaction_number}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {transaction.customer_name || 'Walk-in Customer'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                        {transaction.payment_method.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {transaction.item_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {format(transaction.final_amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                      Total:
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                      {format(filteredTransactions.reduce((sum, t) => sum + parseFloat(t.final_amount), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
