'use client';

import { useEffect, useState } from 'react';
import { useFinancialReports } from '@/hooks/week7/useFinancialReports';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';

export default function CashFlowPage() {
  const { cashFlow, loading, fetchCashFlow } = useFinancialReports();
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchCashFlow(dateRange);
  }, [fetchCashFlow, dateRange]);

  const handleDateChange = (field: string, value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateReport = () => {
    fetchCashFlow(dateRange);
  };

  // Calculate totals from cash flow data
  const totalIncome = cashFlow?.reduce((sum, item) => sum + Number(item.total_income), 0) || 0;
  const totalExpenses = cashFlow?.reduce((sum, item) => sum + Number(item.total_expenses), 0) || 0;
  const netCashFlow = cashFlow?.reduce((sum, item) => sum + Number(item.net_cash_flow), 0) || 0;

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow Statement</h1>
          <p className="text-gray-600">Cash inflows and outflows for the period</p>
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

      {cashFlow && cashFlow.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Total Income</h3>
                <div className="text-2xl font-bold text-green-600 mt-2">
                  ${totalIncome.toFixed(2)}
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
                <h3 className="text-sm font-medium text-gray-600">Net Cash Flow</h3>
                <div className={`text-2xl font-bold mt-2 ${
                  netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${netCashFlow.toFixed(2)}
                </div>
              </div>
            </Card>
          </div>

          {/* Monthly Breakdown */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Cash Flow</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Period
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Income
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expenses
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Net Cash Flow
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {cashFlow.map((item, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(item.period).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long' 
                          })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                          ${Number(item.total_income).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                          ${Number(item.total_expenses).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <span className={Number(item.net_cash_flow) >= 0 ? 'text-green-600' : 'text-red-600'}>
                            ${Number(item.net_cash_flow).toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {/* Net Cash Flow Summary */}
          <Card className={netCashFlow >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
            <div className="p-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Net Cash Flow</h3>
                  <p className="text-gray-600">For the selected period</p>
                </div>
                <div className={`text-3xl font-bold ${
                  netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${netCashFlow.toFixed(2)}
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                {netCashFlow >= 0
                  ? 'Positive cash flow indicates more cash coming in than going out'
                  : 'Negative cash flow indicates more cash going out than coming in'
                }
              </div>
            </div>
          </Card>
        </div>
      ) : cashFlow && cashFlow.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No cash flow data available for the selected period</div>
            <Button onClick={handleGenerateReport} variant="primary" className="mt-2">
              Try Different Dates
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No cash flow data available</div>
            <Button onClick={handleGenerateReport} variant="primary" className="mt-2">
              Generate Report
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
