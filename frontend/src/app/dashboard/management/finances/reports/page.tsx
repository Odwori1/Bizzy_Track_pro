'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useFinancialReports } from '@/hooks/week7/useFinancialReports';
import { printReport } from '@/lib/export-utils';
import DateRangeSelector from '@/components/finances/week7/DateRangeSelector';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

export default function FinancialReportsPage() {
  const {
    monthlySummary,
    expenseAnalysis,
    revenueReport,
    loading,
    exportLoading,
    currentDateRange,
    fetchMonthlySummary,
    fetchExpenseAnalysis,
    fetchRevenueReport,
    exportPDF,
    exportExcel,
    setDateRange
  } = useFinancialReports();
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [activeQuickReport, setActiveQuickReport] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<{ type: string; success: boolean; message: string } | null>(null);

  // Handle date range changes
  const handleDateRangeChange = (startDate: string, endDate: string) => {
    setDateRange(startDate, endDate);
  };

  // Quick report handlers with current date range
  const handleMonthlySummary = async () => {
    setActiveQuickReport('monthly');
    await fetchMonthlySummary();
  };

  const handleExpenseAnalysis = async () => {
    setActiveQuickReport('expense');
    await fetchExpenseAnalysis(currentDateRange);
  };

  const handleRevenueReport = async () => {
    setActiveQuickReport('revenue');
    await fetchRevenueReport(currentDateRange);
  };

  // Export handlers with current date range - FIXED PROPERTY NAMES
  const handleExportPDF = async (reportType: string) => {
    setExportStatus({ type: 'pdf', success: false, message: 'Exporting PDF...' });

    let filters = {};
    // Only include date filters for reports that need them
    if (reportType !== 'monthly-summary') {
      // Convert camelCase to snake_case for backend
      filters = {
        start_date: currentDateRange.startDate,
        end_date: currentDateRange.endDate
      };
    }

    console.log(`Exporting ${reportType} as PDF with filters:`, filters);

    const result = await exportPDF(reportType, filters);

    if (result.success) {
      setExportStatus({ type: 'pdf', success: true, message: 'PDF exported successfully!' });
    } else {
      setExportStatus({ type: 'pdf', success: false, message: `PDF export failed: ${result.error}` });
    }

    setTimeout(() => setExportStatus(null), 5000);
  };

  const handleExportExcel = async (reportType: string) => {
    setExportStatus({ type: 'excel', success: false, message: 'Exporting Excel...' });

    let filters = {};
    // Only include date filters for reports that need them
    if (reportType !== 'monthly-summary') {
      // Convert camelCase to snake_case for backend
      filters = {
        start_date: currentDateRange.startDate,
        end_date: currentDateRange.endDate
      };
    }

    console.log(`Exporting ${reportType} as Excel with filters:`, filters);

    const result = await exportExcel(reportType, filters);

    if (result.success) {
      setExportStatus({ type: 'excel', success: true, message: 'Excel exported successfully!' });
    } else {
      setExportStatus({ type: 'excel', success: false, message: `Excel export failed: ${result.error}` });
    }

    setTimeout(() => setExportStatus(null), 5000);
  };

  const handlePrint = () => {
    printReport();
  };

  // ✅ REMOVED hardcoded formatCurrency function

  // Format percentage
  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  // Get trend color
  const getTrendColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-600">View and analyze your business finances</p>
        </div>
      </div>

      {/* Export Status Message */}
      {exportStatus && (
        <div className={`p-4 rounded-lg ${
          exportStatus.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm ${
              exportStatus.success ? 'text-green-800' : 'text-red-800'
            }`}>
              {exportStatus.message}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExportStatus(null)}
              className="ml-2"
            >
              ×
            </Button>
          </div>
          {!exportStatus.success && (
            <p className="text-xs text-red-600 mt-1">
              Check browser console for detailed error information.
            </p>
          )}
        </div>
      )}

      {/* Date Range Selector */}
      <DateRangeSelector
        onDateRangeChange={handleDateRangeChange}
        defaultStartDate={currentDateRange.startDate}
        defaultEndDate={currentDateRange.endDate}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link href="/dashboard/management/finances/reports/profit-loss">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-green-600">📊</div>
              <h3 className="font-semibold text-gray-900">Profit & Loss</h3>
              <p className="text-gray-600 text-sm">Income, expenses, and net profit</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/reports/balance-sheet">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-blue-600">⚖️</div>
              <h3 className="font-semibold text-gray-900">Balance Sheet</h3>
              <p className="text-gray-600 text-sm">Assets, liabilities, and equity</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/reports/cash-flow">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-purple-600">💸</div>
              <h3 className="font-semibold text-gray-900">Cash Flow</h3>
              <p className="text-gray-600 text-sm">Cash inflows and outflows</p>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Reports Card */}
        <Card>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900">Quick Reports</h3>
              <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {new Date(currentDateRange.startDate).toLocaleDateString()} - {new Date(currentDateRange.endDate).toLocaleDateString()}
              </div>
            </div>
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleMonthlySummary}
                disabled={loading && activeQuickReport === 'monthly'}
              >
                {loading && activeQuickReport === 'monthly' ? '🔄 Loading...' : '📅 Monthly Summary'}
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleExpenseAnalysis}
                disabled={loading && activeQuickReport === 'expense'}
              >
                {loading && activeQuickReport === 'expense' ? '🔄 Loading...' : '🎯 Expense Analysis'}
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleRevenueReport}
                disabled={loading && activeQuickReport === 'revenue'}
              >
                {loading && activeQuickReport === 'revenue' ? '🔄 Loading...' : '💰 Revenue Report'}
              </Button>
            </div>

            {/* Quick Report Results */}
            <div className="mt-6 space-y-4">
              {/* Monthly Summary Results */}
              {monthlySummary && activeQuickReport === 'monthly' && (
                <div className="border rounded-lg p-4 bg-blue-50">
                  <h4 className="font-semibold text-gray-900 mb-3">Monthly Performance</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Current Month Income</p>
                      <p className="font-semibold text-green-600">
                        {format(monthlySummary.current_month.income)} {/* ✅ CORRECT: Using format function */}
                      </p>
                      <p className={`text-xs ${getTrendColor(monthlySummary.trends.income)}`}>
                        {formatPercentage(monthlySummary.trends.income)} vs last month
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Current Month Expenses</p>
                      <p className="font-semibold text-red-600">
                        {format(monthlySummary.current_month.expenses)} {/* ✅ CORRECT: Using format function */}
                      </p>
                      <p className={`text-xs ${getTrendColor(monthlySummary.trends.expenses)}`}>
                        {formatPercentage(monthlySummary.trends.expenses)} vs last month
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-600">Net Profit</p>
                      <p className={`font-semibold ${monthlySummary.current_month.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {format(monthlySummary.current_month.net_profit)} {/* ✅ CORRECT: Using format function */}
                      </p>
                      <p className={`text-xs ${getTrendColor(monthlySummary.trends.profit)}`}>
                        {formatPercentage(monthlySummary.trends.profit)} vs last month
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Expense Analysis Results */}
              {expenseAnalysis && activeQuickReport === 'expense' && (
                <div className="border rounded-lg p-4 bg-orange-50">
                  <h4 className="font-semibold text-gray-900 mb-3">Expense Breakdown</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Expenses:</span>
                      <span className="font-semibold text-red-600">
                        {format(expenseAnalysis.summary.total_expenses)} {/* ✅ CORRECT: Using format function */}
                      </span>
                    </div>
                    {expenseAnalysis.categories.slice(0, 3).map((category, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-gray-600">{category.category}:</span>
                        <div className="text-right">
                          <span className="font-semibold">{format(category.amount)}</span> {/* ✅ CORRECT: Using format function */}
                          <span className="text-xs text-gray-500 ml-2">({category.percentage.toFixed(1)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Revenue Report Results */}
              {revenueReport && activeQuickReport === 'revenue' && (
                <div className="border rounded-lg p-4 bg-green-50">
                  <h4 className="font-semibold text-gray-900 mb-3">Revenue Sources</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Revenue:</span>
                      <span className="font-semibold text-green-600">
                        {format(revenueReport.summary.total_revenue)} {/* ✅ CORRECT: Using format function */}
                      </span>
                    </div>
                    {revenueReport.sources.slice(0, 3).map((source, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <span className="text-gray-600 capitalize">{source.source}:</span>
                        <div className="text-right">
                          <span className="font-semibold">{format(source.amount)}</span> {/* ✅ CORRECT: Using format function */}
                          <span className="text-xs text-gray-500 ml-2">({source.percentage.toFixed(1)}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Export Options Card */}
        <Card>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-900">Export Options</h3>
              <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                Uses selected date range
              </div>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportPDF('profit-loss')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📄'} P&L PDF
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportExcel('profit-loss')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📊'} P&L Excel
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportPDF('balance-sheet')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📄'} Balance PDF
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportExcel('balance-sheet')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📊'} Balance Excel
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportPDF('cash-flow')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📄'} Cash Flow PDF
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportExcel('cash-flow')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📊'} Cash Flow Excel
                </Button>

                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportPDF('monthly-summary')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📄'} Monthly PDF
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => handleExportExcel('monthly-summary')}
                  disabled={exportLoading}
                >
                  {exportLoading ? '🔄' : '📊'} Monthly Excel
                </Button>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handlePrint}
              >
                📋 Print Current View
              </Button>
            </div>

            {/* Export Instructions */}
            <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-semibold text-gray-900 mb-2">Export Features Available! 🎉</h4>
              <p className="text-sm text-gray-700">
                Export financial reports for the selected date range:
              </p>
              <ul className="text-sm text-gray-700 mt-2 space-y-1">
                <li>• <strong>PDF Reports:</strong> Professional formatted documents</li>
                <li>• <strong>Excel Files:</strong> Spreadsheets for further analysis</li>
                <li>• <strong>Print:</strong> Browser print functionality</li>
              </ul>
              <p className="text-xs text-gray-600 mt-2">
                All exports use the currently selected date range above.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
