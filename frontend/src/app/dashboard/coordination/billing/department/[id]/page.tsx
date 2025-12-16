'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDepartment } from '@/hooks/useDepartment';
import { useCurrency } from '@/lib/currency';
import { DepartmentBillingEntry } from '@/types/department';

export default function DepartmentBillingPage() {
  const params = useParams();
  const router = useRouter();
  const departmentId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<any>(null);
  const [billingEntries, setBillingEntries] = useState<DepartmentBillingEntry[]>([]);
  const [dateRange, setDateRange] = useState<'month' | 'quarter' | 'year'>('month');

  const { fetchBillingByDepartment, fetchDepartmentById } = useDepartment();
  const { format } = useCurrency();

  // Load department and billing data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load department details
        const deptData = await fetchDepartmentById(departmentId);
        setDepartment(deptData);
        
        // Load billing entries for this department
        const entries = await fetchBillingByDepartment(departmentId);
        setBillingEntries(entries);
      } catch (err: any) {
        setError(err.message || 'Failed to load department billing');
      } finally {
        setLoading(false);
      }
    };

    if (departmentId) {
      loadData();
    }
  }, [departmentId, fetchBillingByDepartment, fetchDepartmentById, dateRange]);

  // Calculate totals
  const calculateTotals = () => {
    const total = billingEntries.reduce((sum, entry) => sum + entry.total_amount, 0);
    const pending = billingEntries.filter(entry => !entry.invoice_id).reduce((sum, entry) => sum + entry.total_amount, 0);
    const invoiced = billingEntries.filter(entry => entry.invoice_id).reduce((sum, entry) => sum + entry.total_amount, 0);
    const tax = billingEntries.reduce((sum, entry) => sum + entry.tax_amount, 0);
    
    return { total, pending, invoiced, tax, count: billingEntries.length };
  };

  const totals = calculateTotals();

  // Filter entries by date range (simplified)
  const getFilteredEntries = () => {
    const now = new Date();
    let cutoffDate = new Date();
    
    switch (dateRange) {
      case 'month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return billingEntries.filter(entry => 
      new Date(entry.billing_date) >= cutoffDate
    );
  };

  const filteredEntries = getFilteredEntries();

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading department billing...</div>
        </div>
      </div>
    );
  }

  if (error || !department) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">
            {error || 'Department not found'}
          </div>
          <div className="mt-4">
            <Link href="/dashboard/coordination/billing">
              <Button variant="secondary" size="sm">
                Back to Billing
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href="/dashboard/coordination/billing">
              <Button variant="ghost" size="sm">
                ← Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              {department.name} Billing
            </h1>
          </div>
          <p className="text-gray-600 mt-1">
            Department billing entries and charges
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <label className="text-sm text-gray-600">Period:</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">Last Year</option>
            </select>
          </div>
          
          <Button variant="outline">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Charge
          </Button>
        </div>
      </div>

      {/* Department Summary */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: department.color_hex || '#6b7280' }}
              >
                <span className="text-white font-bold">
                  {department.code || department.name.charAt(0)}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{department.name}</h3>
                <div className="text-sm text-gray-600">
                  {department.department_type} • {department.code}
                </div>
              </div>
            </div>
            
            <Link href={`/dashboard/coordination/departments/${departmentId}`}>
              <Button variant="outline" size="sm">
                View Department
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Charges</div>
            <div className="text-2xl font-bold text-gray-900">{format(totals.total)}</div>
            <div className="text-sm text-gray-600 mt-1">{totals.count} entries</div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{format(totals.pending)}</div>
            <div className="text-sm text-gray-600 mt-1">Not invoiced</div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Invoiced</div>
            <div className="text-2xl font-bold text-green-600">{format(totals.invoiced)}</div>
            <div className="text-sm text-gray-600 mt-1">Added to invoices</div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Tax Collected</div>
            <div className="text-2xl font-bold text-blue-600">{format(totals.tax)}</div>
            <div className="text-sm text-gray-600 mt-1">Tax amount</div>
          </div>
        </Card>
      </div>

      {/* Billing Entries */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Billing Entries</h3>
            <div className="text-sm text-gray-600">
              Showing {filteredEntries.length} of {billingEntries.length} entries
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No billing entries</h3>
              <p className="mt-1 text-gray-500">
                No billing entries found for this department in the selected period
              </p>
              <div className="mt-6">
                <Button variant="primary">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add First Charge
                </Button>
              </div>
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
                      Job
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tax
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(entry.billing_date).toLocaleDateString()}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {entry.job_number || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {entry.job_title || ''}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {entry.description}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.quantity || 1}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(entry.unit_price || entry.amount)}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(entry.tax_amount)}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {format(entry.total_amount)}
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          entry.invoice_id 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {entry.invoice_id ? 'Invoiced' : 'Pending'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-2">
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                          {!entry.invoice_id && (
                            <Button variant="outline" size="sm">
                              Add to Invoice
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
        </div>
      </Card>

      {/* Monthly Summary */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Summary</h3>
          
          <div className="space-y-4">
            {(() => {
              // Group entries by month
              const monthlyTotals: Record<string, number> = {};
              
              billingEntries.forEach(entry => {
                const date = new Date(entry.billing_date);
                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                
                if (!monthlyTotals[monthName]) {
                  monthlyTotals[monthName] = 0;
                }
                monthlyTotals[monthName] += entry.total_amount;
              });
              
              const sortedMonths = Object.entries(monthlyTotals)
                .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
                .slice(-6); // Last 6 months
              
              const maxAmount = Math.max(...sortedMonths.map(([_, amount]) => amount));
              
              return (
                <>
                  {sortedMonths.map(([month, amount]) => (
                    <div key={month} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium text-gray-700">{month}</div>
                        <div className="text-sm font-semibold text-gray-900">{format(amount)}</div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 bg-blue-500 rounded-full"
                          style={{ width: `${(amount / maxAmount) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                  
                  {sortedMonths.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      No monthly data available
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </Card>
    </div>
  );
}
