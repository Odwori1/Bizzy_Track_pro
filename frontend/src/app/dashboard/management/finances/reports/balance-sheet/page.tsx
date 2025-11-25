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
                {balanceSheet.assets?.map((asset, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{asset.category}</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${asset.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Assets</span>
                    <span className="text-green-600">
                      ${balanceSheet.total_assets?.toFixed(2) || '0.00'}
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
                {balanceSheet.liabilities?.map((liability, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{liability.category}</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${liability.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Liabilities</span>
                    <span className="text-red-600">
                      ${balanceSheet.total_liabilities?.toFixed(2) || '0.00'}
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
                {balanceSheet.equity?.map((equityItem, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{equityItem.category}</span>
                    <span className="text-sm font-medium text-gray-900">
                      ${equityItem.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Equity</span>
                    <span className="text-blue-600">
                      ${balanceSheet.total_equity?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>

                {/* Balance Check */}
                <div className="border-t pt-4 mt-4">
                  <div className={`flex justify-between items-center font-bold text-lg ${
                    Math.abs((balanceSheet.total_assets || 0) - 
                            ((balanceSheet.total_liabilities || 0) + (balanceSheet.total_equity || 0))) < 0.01
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}>
                    <span>Assets = Liabilities + Equity</span>
                    <span>
                      ${balanceSheet.total_assets?.toFixed(2)} = 
                      ${((balanceSheet.total_liabilities || 0) + (balanceSheet.total_equity || 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {Math.abs((balanceSheet.total_assets || 0) - 
                             ((balanceSheet.total_liabilities || 0) + (balanceSheet.total_equity || 0))) < 0.01
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
