'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/Badge';
import { formatDisplayDate } from '@/lib/date-format';
import { formatCurrency } from '@/lib/currency';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { PayrollExport, PayrollExportFormData, Timesheet } from '@/types/workforce';

export default function PayrollPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchPayrollExports, createPayrollExport, fetchTimesheets, loading: workforceLoading } = useWorkforce();

  const [payrollExports, setPayrollExports] = useState<PayrollExport[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New export form state
  const [showNewExportForm, setShowNewExportForm] = useState(false);
  const [newExport, setNewExport] = useState<PayrollExportFormData>({
    payroll_period_id: '',
    export_type: 'csv'
  });
  const [creating, setCreating] = useState(false);

  // Payroll calculation state
  const [payrollPeriod, setPayrollPeriod] = useState({
    start_date: '',
    end_date: ''
  });
  const [calculating, setCalculating] = useState(false);
  const [payrollCalculation, setPayrollCalculation] = useState<any>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
  }, [authLoading, isAuthenticated, router]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [exports, timesheetData] = await Promise.all([
        fetchPayrollExports(),
        fetchTimesheets({ status: 'approved' })
      ]);

      setPayrollExports(exports || []);
      setTimesheets(timesheetData || []);
    } catch (err: any) {
      console.error('Error loading payroll data:', err);
      setError(err.message || 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await createPayrollExport(newExport);
      
      // Reset form
      setNewExport({
        payroll_period_id: '',
        export_type: 'csv'
      });
      setShowNewExportForm(false);
      loadData();
    } catch (err: any) {
      console.error('Error creating payroll export:', err);
      setError(err.message || 'Failed to create payroll export');
    } finally {
      setCreating(false);
    }
  };

  const handleCalculatePayroll = async () => {
    if (!payrollPeriod.start_date || !payrollPeriod.end_date) {
      setError('Please select start and end dates');
      return;
    }

    setCalculating(true);
    setError(null);

    try {
      // Filter timesheets within the selected period
      const periodTimesheets = timesheets.filter(timesheet => {
        const periodStart = new Date(timesheet.period_start_date.local || timesheet.period_start_date.utc);
        const periodEnd = new Date(timesheet.period_end_date.local || timesheet.period_end_date.utc);
        const selectedStart = new Date(payrollPeriod.start_date);
        const selectedEnd = new Date(payrollPeriod.end_date);
        
        return periodStart >= selectedStart && periodEnd <= selectedEnd;
      });

      // Calculate totals
      const calculation = periodTimesheets.reduce((acc, ts) => {
        acc.totalHours += parseFloat(ts.regular_hours) + parseFloat(ts.overtime_hours);
        acc.totalPay += parseFloat(ts.total_pay);
        acc.timesheetCount++;
        return acc;
      }, { totalHours: 0, totalPay: 0, timesheetCount: 0 });

      setPayrollCalculation({
        ...calculation,
        startDate: payrollPeriod.start_date,
        endDate: payrollPeriod.end_date,
        timesheets: periodTimesheets
      });
    } catch (err: any) {
      console.error('Error calculating payroll:', err);
      setError(err.message || 'Failed to calculate payroll');
    } finally {
      setCalculating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800'
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getExportTypeIcon = (type: string) => {
    const icons = {
      quickbooks: '🧾',
      xero: '📊',
      csv: '📄',
      pdf: '📑'
    };
    return icons[type as keyof typeof icons] || '📁';
  };

  const getExportTypeName = (type: string) => {
    const names = {
      quickbooks: 'QuickBooks',
      xero: 'Xero',
      csv: 'CSV',
      pdf: 'PDF'
    };
    return names[type as keyof typeof names] || type;
  };

  // Calculate overall statistics
  const calculateStats = () => {
    const totalExports = payrollExports.length;
    const successfulExports = payrollExports.filter(e => e.status === 'completed').length;
    const totalPayrollAmount = timesheets.reduce((sum, ts) => sum + parseFloat(ts.total_pay), 0);

    return {
      totalExports,
      successfulExports,
      totalPayrollAmount
    };
  };

  const stats = calculateStats();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payroll Management</h1>
            <p className="text-gray-600 mt-1">
              Process payroll and export to accounting systems
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/timesheets')}
            >
              View Timesheets
            </Button>
            <Button
              onClick={() => setShowNewExportForm(true)}
              disabled={showNewExportForm}
            >
              New Export
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Exports</div>
            <div className="text-2xl font-bold mt-1">{stats.totalExports}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Successful</div>
            <div className="text-2xl font-bold mt-1 text-green-600">
              {stats.successfulExports}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Pending Approval</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">
              {timesheets.filter(t => t.status === 'submitted').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Payroll</div>
            <div className="text-2xl font-bold mt-1">{formatCurrency(stats.totalPayrollAmount, business)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Calculator */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Payroll Calculator</CardTitle>
          <CardDescription>Calculate payroll for a specific period</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="calc_start_date">Start Date</Label>
              <Input
                id="calc_start_date"
                type="date"
                value={payrollPeriod.start_date}
                onChange={(e) => setPayrollPeriod(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="calc_end_date">End Date</Label>
              <Input
                id="calc_end_date"
                type="date"
                value={payrollPeriod.end_date}
                onChange={(e) => setPayrollPeriod(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleCalculatePayroll}
                disabled={calculating || !payrollPeriod.start_date || !payrollPeriod.end_date}
                className="w-full"
              >
                {calculating ? 'Calculating...' : 'Calculate Payroll'}
              </Button>
            </div>
          </div>

          {payrollCalculation && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-green-800">Payroll Calculation Results</h4>
                  <p className="text-sm text-green-600">
                    Period: {payrollCalculation.startDate} to {payrollCalculation.endDate}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewExportForm(true)}
                >
                  Export Results
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-green-700">Timesheets</p>
                  <p className="font-bold">{payrollCalculation.timesheetCount}</p>
                </div>
                <div>
                  <p className="text-sm text-green-700">Total Hours</p>
                  <p className="font-bold">{payrollCalculation.totalHours.toFixed(2)}h</p>
                </div>
                <div>
                  <p className="text-sm text-green-700">Total Payroll</p>
                  <p className="font-bold">{formatCurrency(payrollCalculation.totalPay, business)}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-red-800">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={loadData}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Export Form */}
      {showNewExportForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create Payroll Export</CardTitle>
            <CardDescription>Export payroll data to external systems</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateExport}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export Details */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="payroll_period_id">Payroll Period ID *</Label>
                    <Input
                      id="payroll_period_id"
                      value={newExport.payroll_period_id}
                      onChange={(e) => setNewExport(prev => ({ ...prev, payroll_period_id: e.target.value }))}
                      placeholder="e.g., PAYROLL-2025-01"
                      required
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Unique identifier for this payroll period
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="export_type">Export Format *</Label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {(['quickbooks', 'xero', 'csv', 'pdf'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewExport(prev => ({ ...prev, export_type: type }))}
                          className={`p-4 text-center border rounded-lg transition-colors ${
                            newExport.export_type === type
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="text-2xl mb-2">{getExportTypeIcon(type)}</div>
                          <div className="font-medium">{getExportTypeName(type)}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Export Preview */}
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700">Export Preview</p>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Format:</span>
                        <span className="font-medium">{getExportTypeName(newExport.export_type)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Period:</span>
                        <span className="font-medium">{newExport.payroll_period_id || 'Not specified'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Timesheets:</span>
                        <span className="font-medium">{timesheets.length} approved</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total Amount:</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(stats.totalPayrollAmount, business)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="text-amber-600 mr-2">⚠️</div>
                      <div>
                        <p className="text-sm font-medium text-amber-800">Important Notes</p>
                        <ul className="text-xs text-amber-700 mt-1 list-disc pl-4">
                          <li>Ensure all timesheets are approved before exporting</li>
                          <li>Double-check period dates and amounts</li>
                          <li>Review export format compatibility</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewExportForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !newExport.payroll_period_id}
                >
                  {creating ? 'Creating...' : 'Create Export'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Recent Exports */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payroll Export History</CardTitle>
              <CardDescription>
                {payrollExports.length} export(s) found
              </CardDescription>
            </div>
            {loading && (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {payrollExports.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-medium text-gray-900">No Payroll Exports</h3>
              <p className="text-gray-600 mt-2">
                Create your first payroll export to get started
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowNewExportForm(true)}
              >
                Create First Export
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Export ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Period</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Format</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Created</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">File</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollExports.map((exportItem) => (
                    <tr key={exportItem.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="font-medium">{exportItem.id.slice(0, 8)}...</p>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm">{exportItem.period_name}</p>
                          <p className="text-xs text-gray-600">
                            {formatDisplayDate(exportItem.period_start_date)} - {formatDisplayDate(exportItem.period_end_date)}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <span className="text-xl mr-2">{getExportTypeIcon(exportItem.export_type)}</span>
                          <span>{getExportTypeName(exportItem.export_type)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={getStatusBadge(exportItem.status)}>
                          {exportItem.status.charAt(0).toUpperCase() + exportItem.status.slice(1)}
                        </Badge>
                        {exportItem.error_message && (
                          <p className="text-xs text-red-600 mt-1">{exportItem.error_message}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">{formatDisplayDate(exportItem.created_at)}</p>
                      </td>
                      <td className="py-3 px-4">
                        {exportItem.file_url ? (
                          <a
                            href={exportItem.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-sm"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-gray-500 text-sm">No file</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Handle retry for failed exports
                              if (exportItem.status === 'failed') {
                                alert('Retry functionality coming soon');
                              }
                            }}
                          >
                            {exportItem.status === 'failed' ? 'Retry' : 'View'}
                          </Button>
                          {exportItem.status === 'completed' && exportItem.file_url && (
                            <Button
                              size="sm"
                              onClick={() => window.open(exportItem.file_url!, '_blank')}
                            >
                              Download
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Integration Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="text-2xl mr-3">🧾</div>
              <div>
                <h3 className="font-medium">QuickBooks Integration</h3>
                <p className="text-sm text-gray-600">Export directly to QuickBooks</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setNewExport(prev => ({ ...prev, export_type: 'quickbooks' }));
                setShowNewExportForm(true);
              }}
            >
              Export to QuickBooks
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="text-2xl mr-3">📊</div>
              <div>
                <h3 className="font-medium">Xero Integration</h3>
                <p className="text-sm text-gray-600">Export directly to Xero</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setNewExport(prev => ({ ...prev, export_type: 'xero' }));
                setShowNewExportForm(true);
              }}
            >
              Export to Xero
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center mb-4">
              <div className="text-2xl mr-3">📄</div>
              <div>
                <h3 className="font-medium">CSV Reports</h3>
                <p className="text-sm text-gray-600">Download payroll data as CSV</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setNewExport(prev => ({ ...prev, export_type: 'csv' }));
                setShowNewExportForm(true);
              }}
            >
              Download CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
