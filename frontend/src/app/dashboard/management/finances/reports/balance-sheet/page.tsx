'use client';

import { useEffect, useState } from 'react';
import { useFinancialReports } from '@/hooks/week7/useFinancialReports';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';

export default function BalanceSheetPage() {
  const { balanceSheet, loading, fetchBalanceSheet } = useFinancialReports();
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchBalanceSheet(dateRange);
  }, [fetchBalanceSheet, dateRange]);

  const handleDateChange = (field: string, value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateReport = () => {
    fetchBalanceSheet(dateRange);
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
          <p className="text-gray-600">Assets, liabilities, and equity as of specific date</p>
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

      {balanceSheet && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Assets */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Assets</h3>
              <div className="space-y-3">
                {/* Current Assets */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Cash & Equivalents</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.assets.current_assets.cash_and_equivalents.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Accounts Receivable</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.assets.current_assets.accounts_receivable.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Inventory</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.assets.current_assets.inventory.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Total Current Assets</span>
                      <span className="text-green-600">
                        ${balanceSheet.assets.current_assets.total_current_assets.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Fixed Assets */}
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Property & Equipment</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.assets.fixed_assets.property_equipment.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Total Fixed Assets</span>
                      <span className="text-green-600">
                        ${balanceSheet.assets.fixed_assets.total_fixed_assets.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t-2 pt-2 mt-2">
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span className="text-gray-900">Total Assets</span>
                    <span className="text-green-600">
                      ${balanceSheet.assets.total_assets.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Liabilities */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Liabilities</h3>
              <div className="space-y-3">
                {/* Current Liabilities */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Accounts Payable</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.liabilities.current_liabilities.accounts_payable.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Short-term Debt</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.liabilities.current_liabilities.short_term_debt.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Total Current Liabilities</span>
                      <span className="text-red-600">
                        ${balanceSheet.liabilities.current_liabilities.total_current_liabilities.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Long-term Liabilities */}
                <div className="space-y-2 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Long-term Debt</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${balanceSheet.liabilities.long_term_liabilities.long_term_debt.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center font-semibold">
                      <span className="text-gray-900">Total Long-term Liabilities</span>
                      <span className="text-red-600">
                        ${balanceSheet.liabilities.long_term_liabilities.total_long_term_liabilities.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t-2 pt-2 mt-2">
                  <div className="flex justify-between items-center font-bold text-lg">
                    <span className="text-gray-900">Total Liabilities</span>
                    <span className="text-red-600">
                      ${balanceSheet.liabilities.total_liabilities.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Equity & Summary */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Equity</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Retained Earnings</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${balanceSheet.equity.retained_earnings.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Common Stock</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${balanceSheet.equity.common_stock.toFixed(2)}
                  </span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Equity</span>
                    <span className="text-blue-600">
                      ${balanceSheet.equity.total_equity.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Balance Check */}
                <div className="border-t pt-4 mt-4">
                  <div className={`flex justify-between items-center font-bold text-lg ${
                    balanceSheet.verification.balanced
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}>
                    <span>Assets = Liabilities + Equity</span>
                    <span>
                      ${balanceSheet.verification.total_assets.toFixed(2)} =
                      ${balanceSheet.verification.total_liabilities_and_equity.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {balanceSheet.verification.balanced
                      ? '✓ Balance sheet is balanced'
                      : '⚠ Balance sheet does not balance'}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {!balanceSheet && !loading && (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No balance sheet data available</div>
            <Button onClick={handleGenerateReport} variant="primary" className="mt-2">
              Generate Balance Sheet
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
