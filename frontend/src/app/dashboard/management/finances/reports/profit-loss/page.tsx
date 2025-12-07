'use client';

import { useEffect, useState } from 'react';
import { useFinancialReports } from '@/hooks/week7/useFinancialReports';
import { useFinancialStore } from '@/store/week7/financial-store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';
import { useCurrency } from '@/lib/currency';

type DataSource = 'accounting' | 'legacy';

export default function ProfitLossPage() {
  const { profitLoss: legacyProfitLoss, loading: legacyLoading, fetchProfitLoss: fetchLegacyProfitLoss } = useFinancialReports();
  const { format } = useCurrency();
  
  const financialStore = useFinancialStore();
  
  const [dateRange, setDateRange] = useState({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
  });
  
  const [accountingData, setAccountingData] = useState<any>(null);
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingError, setAccountingError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSource>('accounting');

  // Fetch legacy data
  useEffect(() => {
    fetchLegacyProfitLoss(dateRange);
  }, [fetchLegacyProfitLoss, dateRange]);

  // Fetch accounting data
  const fetchAccountingProfitLoss = async () => {
    setAccountingLoading(true);
    setAccountingError(null);
    try {
      const data = await financialStore.fetchAccountingProfitLoss(dateRange);
      setAccountingData(data);
      console.log('Accounting data loaded:', data);
    } catch (error: any) {
      setAccountingError(error.message || 'Failed to load accounting data');
      console.error('Accounting data error:', error);
    } finally {
      setAccountingLoading(false);
    }
  };

  // Load accounting data on mount and when date range changes
  useEffect(() => {
    fetchAccountingProfitLoss();
  }, [dateRange.start_date, dateRange.end_date]);

  const handleDateChange = (field: string, value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerateReport = () => {
    if (dataSource === 'accounting') {
      fetchAccountingProfitLoss();
    } else {
      fetchLegacyProfitLoss(dateRange);
    }
  };

  // Quick date range presets
  const applyQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setDateRange({
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0]
    });
  };

  // Determine which data to use
  const useAccountingData = dataSource === 'accounting' && accountingData;
  const useLegacyData = dataSource === 'legacy' && legacyProfitLoss;
  
  // Calculate totals based on data source
  let totalRevenue = 0;
  let totalCOGS = 0;
  let totalOperatingExpenses = 0;
  let grossProfit = 0;
  let grossMargin = 0;
  let netProfit = 0;
  let netMargin = 0;
  let period = { start_date: dateRange.start_date, end_date: dateRange.end_date };
  let metadata = null;

  if (useAccountingData) {
    // Use accounting system data (COMPLETE DATA)
    totalRevenue = accountingData.revenue?.total || 0;
    totalCOGS = accountingData.cogs?.total || 0;
    totalOperatingExpenses = accountingData.operating_expenses?.total || 0;
    grossProfit = accountingData.gross_profit || 0;
    grossMargin = accountingData.gross_margin || 0;
    netProfit = accountingData.net_profit || 0;
    netMargin = accountingData.net_margin || 0;
    period = accountingData.period;
    metadata = accountingData._metadata;
  } else if (useLegacyData) {
    // Use legacy data
    totalRevenue = legacyProfitLoss?.revenue?.total_income || 0;
    totalCOGS = 0; // Legacy doesn't separate COGS
    totalOperatingExpenses = legacyProfitLoss?.expenses?.total_expenses || 0;
    netProfit = legacyProfitLoss?.net_profit || 0;
    netMargin = legacyProfitLoss?.profit_margin || 0;
    // Calculate gross profit (revenue - expenses for legacy)
    grossProfit = totalRevenue - totalOperatingExpenses;
    grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) : 0;
    period = legacyProfitLoss?.period || period;
  }

  // Show loading state
  const isLoading = (dataSource === 'accounting' && accountingLoading) || 
                   (dataSource === 'legacy' && legacyLoading);

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h1>
          <p className="text-gray-600">Revenue, expenses, and net profit for the period</p>
          
          {/* Data source indicator */}
          <div className="flex items-center mt-2 space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${dataSource === 'accounting' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
              <span className="text-sm font-medium">
                {dataSource === 'accounting' ? '✅ Accounting System' : 'Accounting System'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${dataSource === 'legacy' ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
              <span className="text-sm font-medium">
                {dataSource === 'legacy' ? '📊 Legacy Reports' : 'Legacy Reports'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-2">
          {/* Data source toggle */}
          <div className="flex border rounded-lg overflow-hidden">
            <button
              onClick={() => setDataSource('accounting')}
              className={`px-3 py-1 text-sm font-medium ${
                dataSource === 'accounting'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Accounting
            </button>
            <button
              onClick={() => setDataSource('legacy')}
              className={`px-3 py-1 text-sm font-medium ${
                dataSource === 'legacy'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Legacy
            </button>
          </div>
          
          <Button variant="outline">
            📄 Export PDF
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Period</h3>

          {/* Quick Range Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(7)}>
              Last 7 Days
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(30)}>
              Last 30 Days
            </Button>
            <Button variant="outline" size="sm" onClick={() => applyQuickRange(90)}>
              Last 90 Days
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const today = new Date();
              const start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
              setDateRange({ start_date: start, end_date: today.toISOString().split('T')[0] });
            }}>
              Year to Date
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
            <div className="text-sm">
              <div className="font-medium text-gray-700 mb-1">Period</div>
              <div className="text-gray-600">
                {period.start_date} to {period.end_date}
              </div>
            </div>
            <Button onClick={handleGenerateReport} variant="primary">
              Refresh Report
            </Button>
          </div>
        </div>
      </Card>

      {/* Error Display */}
      {accountingError && dataSource === 'accounting' && (
        <Card className="border-red-200 bg-red-50">
          <div className="p-4">
            <div className="flex items-center">
              <div className="text-red-600 font-medium">Accounting System Error</div>
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-auto"
                onClick={() => setDataSource('legacy')}
              >
                Switch to Legacy Data
              </Button>
            </div>
            <p className="text-red-600 text-sm mt-1">{accountingError}</p>
          </div>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-600">Total Revenue</h3>
            <div className="text-2xl font-bold text-green-600 mt-2">
              {format(totalRevenue)}
            </div>
            {useAccountingData && (
              <div className="text-xs text-green-500 mt-1">
                ✅ Accounting System
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-600">Cost of Goods Sold</h3>
            <div className="text-2xl font-bold text-orange-600 mt-2">
              {format(totalCOGS)}
            </div>
            {useAccountingData && (
              <div className="text-xs text-orange-500 mt-1">
                ✅ Accounting System
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-600">Gross Profit</h3>
            <div className={`text-2xl font-bold mt-2 ${
              grossProfit >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}>
              {format(grossProfit)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Margin: {(grossMargin * 100).toFixed(1)}%
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6 text-center">
            <h3 className="text-sm font-medium text-gray-600">Net Profit/Loss</h3>
            <div className={`text-2xl font-bold mt-2 ${
              netProfit >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {format(netProfit)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Margin: {(netMargin * 100).toFixed(1)}%
            </div>
            {useAccountingData && (
              <div className="text-xs text-gray-500 mt-1">
                {netProfit >= 0 ? '✅ Profit' : '⚠️ Loss'}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Detailed Breakdown */}
      {useAccountingData ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Breakdown from Accounting */}
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Revenue</h3>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  Accounting
                </span>
              </div>
              <div className="space-y-3">
                {accountingData.revenue?.breakdown?.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-gray-600">{item.account_name}</span>
                      <div className="text-xs text-gray-400">Code: {item.account_code}</div>
                    </div>
                    <span className="text-sm font-medium text-green-600">
                      {format(item.amount)}
                    </span>
                  </div>
                ))}
                {(!accountingData.revenue?.breakdown || accountingData.revenue.breakdown.length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    No revenue data
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Revenue</span>
                    <span className="text-green-600">
                      {format(totalRevenue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* COGS Breakdown from Accounting */}
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Cost of Goods Sold</h3>
                <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                  Accounting
                </span>
              </div>
              <div className="space-y-3">
                {accountingData.cogs?.breakdown?.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-gray-600">{item.account_name}</span>
                      <div className="text-xs text-gray-400">Code: {item.account_code}</div>
                    </div>
                    <span className="text-sm font-medium text-orange-600">
                      {format(item.amount)}
                    </span>
                  </div>
                ))}
                {(!accountingData.cogs?.breakdown || accountingData.cogs.breakdown.length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    No COGS data
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total COGS</span>
                    <span className="text-orange-600">
                      {format(totalCOGS)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Operating Expenses Breakdown from Accounting */}
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Operating Expenses</h3>
                <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                  Accounting
                </span>
              </div>
              <div className="space-y-3">
                {accountingData.operating_expenses?.breakdown?.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <div>
                      <span className="text-sm text-gray-600">{item.account_name}</span>
                      <div className="text-xs text-gray-400">Code: {item.account_code}</div>
                    </div>
                    <span className="text-sm font-medium text-red-600">
                      {format(item.amount)}
                    </span>
                  </div>
                ))}
                {(!accountingData.operating_expenses?.breakdown || accountingData.operating_expenses.breakdown.length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    No operating expenses
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Expenses</span>
                    <span className="text-red-600">
                      {format(totalOperatingExpenses)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        /* Legacy Data Display */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Breakdown (Legacy) */}
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Revenue Breakdown</h3>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Legacy
                </span>
              </div>
              <div className="space-y-3">
                {legacyProfitLoss?.revenue?.breakdown?.map((revenue: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{revenue.wallet_type}</span>
                    <span className="text-sm font-medium text-green-600">
                      {format(Number(revenue.total_income))}
                    </span>
                  </div>
                ))}
                {(!legacyProfitLoss?.revenue?.breakdown || legacyProfitLoss.revenue.breakdown.length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    No revenue data available
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Revenue</span>
                    <span className="text-green-600">
                      {format(totalRevenue)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Expense Breakdown (Legacy) */}
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Expense Breakdown</h3>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Legacy
                </span>
              </div>
              <div className="space-y-3">
                {legacyProfitLoss?.expenses?.breakdown?.map((expense: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{expense.category_name}</span>
                    <span className="text-sm font-medium text-red-600">
                      {format(Number(expense.total_expenses))}
                    </span>
                  </div>
                ))}
                {(!legacyProfitLoss?.expenses?.breakdown || legacyProfitLoss.expenses.breakdown.length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    No expense data available
                  </div>
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between items-center font-semibold">
                    <span className="text-gray-900">Total Expenses</span>
                    <span className="text-red-600">
                      {format(totalOperatingExpenses)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Profit Summary Card */}
      <Card className={netProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
        <div className="p-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
              </h3>
              <p className="text-gray-600">For the selected period</p>
              {useAccountingData && (
                <div className="mt-2 text-sm">
                  <div className="flex flex-wrap gap-4">
                    <span className="text-gray-700">
                      Revenue: <span className="font-medium">{format(totalRevenue)}</span>
                    </span>
                    <span className="text-gray-700">
                      - COGS: <span className="font-medium">{format(totalCOGS)}</span>
                    </span>
                    <span className="text-gray-700">
                      = Gross Profit: <span className={`font-medium ${grossProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {format(grossProfit)}
                      </span>
                    </span>
                    <span className="text-gray-700">
                      - Operating Expenses: <span className="font-medium">{format(totalOperatingExpenses)}</span>
                    </span>
                    <span className="text-gray-700">
                      = Net {netProfit >= 0 ? 'Profit' : 'Loss'}: <span className={`font-medium ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {format(netProfit)}
                      </span>
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className={`text-3xl font-bold ${
              netProfit >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {format(netProfit)}
            </div>
          </div>
        </div>
      </Card>

      {/* System Information */}
      {metadata && (
        <Card>
          <div className="p-4">
            <div className="text-sm text-gray-600">
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center">
                  <span className="font-medium">Data Source:</span>
                  <span className="ml-2 text-green-600">✅ Accounting System</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium">Journal Entries:</span>
                  <span className="ml-2">{metadata.journal_entry_count}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium">Transactions:</span>
                  <span className="ml-2">{metadata.transaction_count}</span>
                </div>
                <div className="flex items-center">
                  <span className="font-medium">Source:</span>
                  <span className="ml-2">{metadata.data_source}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!useAccountingData && !useLegacyData && !isLoading && (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No profit & loss data available</div>
            <div className="mt-4 flex justify-center space-x-2">
              <Button onClick={fetchAccountingProfitLoss} variant="primary">
                Try Accounting System
              </Button>
              <Button onClick={() => fetchLegacyProfitLoss(dateRange)} variant="outline">
                Try Legacy System
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
