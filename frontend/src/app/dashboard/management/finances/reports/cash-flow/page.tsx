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

  const netCashFlow = (cashFlow?.net_cash_flow || 0);

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

      {cashFlow && (
        <div className="grid grid-cols-1 gap-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Operating Cash</h3>
                <div className={`text-2xl font-bold mt-2 ${
                  (cashFlow.operating_activities?.net_cash_flow || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${(cashFlow.operating_activities?.net_cash_flow || 0).toFixed(2)}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Investing Cash</h3>
                <div className={`text-2xl font-bold mt-2 ${
                  (cashFlow.investing_activities?.net_cash_flow || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${(cashFlow.investing_activities?.net_cash_flow || 0).toFixed(2)}
                </div>
              </div>
            </Card>

            <Card>
              <div className="p-6 text-center">
                <h3 className="text-sm font-medium text-gray-600">Financing Cash</h3>
                <div className={`text-2xl font-bold mt-2 ${
                  (cashFlow.financing_activities?.net_cash_flow || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  ${(cashFlow.financing_activities?.net_cash_flow || 0).toFixed(2)}
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

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Operating Activities */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Operating Activities</h3>
                <div className="space-y-3">
                  {cashFlow.operating_activities?.inflows?.map((inflow, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{inflow.category}</span>
                      <span className="text-sm font-medium text-green-600">
                        ${inflow.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {cashFlow.operating_activities?.outflows?.map((outflow, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{outflow.category}</span>
                      <span className="text-sm font-medium text-red-600">
                        ${outflow.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Net Cash Flow</span>
                      <span className={
                        (cashFlow.operating_activities?.net_cash_flow || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }>
                        ${(cashFlow.operating_activities?.net_cash_flow || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Investing Activities */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Investing Activities</h3>
                <div className="space-y-3">
                  {cashFlow.investing_activities?.inflows?.map((inflow, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{inflow.category}</span>
                      <span className="text-sm font-medium text-green-600">
                        ${inflow.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {cashFlow.investing_activities?.outflows?.map((outflow, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{outflow.category}</span>
                      <span className="text-sm font-medium text-red-600">
                        ${outflow.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Net Cash Flow</span>
                      <span className={
                        (cashFlow.investing_activities?.net_cash_flow || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }>
                        ${(cashFlow.investing_activities?.net_cash_flow || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Financing Activities */}
            <Card>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Financing Activities</h3>
                <div className="space-y-3">
                  {cashFlow.financing_activities?.inflows?.map((inflow, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{inflow.category}</span>
                      <span className="text-sm font-medium text-green-600">
                        ${inflow.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {cashFlow.financing_activities?.outflows?.map((outflow, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{outflow.category}</span>
                      <span className="text-sm font-medium text-red-600">
                        ${outflow.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Net Cash Flow</span>
                      <span className={
                        (cashFlow.financing_activities?.net_cash_flow || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }>
                        ${(cashFlow.financing_activities?.net_cash_flow || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

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
      )}

      {!cashFlow && !loading && (
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
