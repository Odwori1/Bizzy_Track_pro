'use client';

import { useEffect, useState } from 'react';
import { useFinancialReports } from '@/hooks/week7/useFinancialReports';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';

export default function ProfitLossPage() {
  const { profitLoss, loading, fetchProfitLoss } = useFinancialReports();
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1 current year
    end_date: new Date().toISOString().split('T')[0], // Today
  });

  useEffect(() => {
    fetchProfitLoss(dateRange);
  }, [fetchProfitLoss, dateRange]);

  const handleDateChange = (field: string, value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateReport = () => {
    fetchProfitLoss(dateRange);
  };

  // Use actual backend data structure
  const totalRevenue = profitLoss?.revenue?.total_income || 0;
  const totalExpenses = profitLoss?.expenses?.total_expenses || 0;
  const netProfit = profitLoss?.net_profit || 0;
  const profitMargin = profitLoss?.profit_margin || 0;

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h1>
          <p className="text-gray-600">Revenue, expenses, and net profit for the period</p>
        </div>
        <Button variant="outline">
          📄 Export PDF
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Period</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <FormInput
              label="Start Date"
              type="date"
              value={dateRange.start_date}
              onChange={(value) => handleDateChange('start_date', value)}
            />
            <FormInput
              label="End Date"
              type="date"
              value={dateRange.end_date}
              onChange={(value) => handleDateChange('end_date', value)}
            />
            <Button onClick={handleGenerateReport} variant="primary">
              Generate Report
            </Button>
          </div>
        </div>
      </Card>

      {profitLoss && (
        <div className="grid grid-cols-1 gap-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Total Revenue</h3>
                <div className="text-2xl font-bold text-green-600 mt-2">
                  ${totalRevenue.toFixed(2)}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Total Expenses</h3>
                <div className="text-2xl font-bold text-red-600 mt-2">
                  ${totalExpenses.toFixed(2)}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Net Profit</h3>
                <div className={`text-2xl font-bold mt-2 ${
                  netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${netProfit.toFixed(2)}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Profit Margin</h3>
                <div className={`text-2xl font-bold mt-2 ${
                  netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {profitMargin.toFixed(1)}%
                </div>
              </div>
            </Card>
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Breakdown */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Breakdown</h3>
                <div className="space-y-3">
                  {profitLoss.revenue?.breakdown?.map((revenue, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{revenue.wallet_type}</span>
                      <span className="text-sm font-medium text-green-600">
                        ${Number(revenue.total_income).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {(!profitLoss.revenue?.breakdown || profitLoss.revenue.breakdown.length === 0) && (
                    <div className="text-center text-gray-500 py-4">
                      No revenue data available
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Total Revenue</span>
                      <span className="text-green-600">
                        ${totalRevenue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Expense Breakdown */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Expense Breakdown</h3>
                <div className="space-y-3">
                  {profitLoss.expenses?.breakdown?.map((expense, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{expense.category_name}</span>
                      <span className="text-sm font-medium text-red-600">
                        ${Number(expense.total_expenses).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {(!profitLoss.expenses?.breakdown || profitLoss.expenses.breakdown.length === 0) && (
                    <div className="text-center text-gray-500 py-4">
                      No expense data available
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Total Expenses</span>
                      <span className="text-red-600">
                        ${totalExpenses.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Net Profit Summary */}
          <Card className={netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
            <div className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Net Profit/Loss</h3>
                  <p className="text-gray-600">For the selected period</p>
                </div>
                <div className={`text-3xl font-bold ${
                  netProfit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${netProfit.toFixed(2)}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!profitLoss && !loading && (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No profit & loss data available</div>
            <Button onClick={handleGenerateReport} variant="primary" className="mt-2">
              Generate Report
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
