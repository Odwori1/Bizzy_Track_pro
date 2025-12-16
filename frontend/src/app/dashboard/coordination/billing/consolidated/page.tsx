'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConsolidatedBillComponent } from '@/components/department/ConsolidatedBill';
import { useDepartment } from '@/hooks/useDepartment';
import { useCurrency } from '@/lib/currency';
import { ConsolidatedBill } from '@/types/department';

export default function ConsolidatedBillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  const { consolidatedBills, fetchConsolidatedBilling } = useDepartment();
  const { format } = useCurrency();

  // Load consolidated bills
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchConsolidatedBilling();
      } catch (err: any) {
        setError(err.message || 'Failed to load consolidated bills');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchConsolidatedBilling]);

  // Filter bills by status
  const filteredBills = consolidatedBills.filter(bill => {
    if (selectedStatus === 'all') return true;
    return bill.status?.toLowerCase() === selectedStatus.toLowerCase();
  });

  // Calculate totals
  const calculateTotals = () => {
    const total = filteredBills.reduce((sum, bill) => sum + bill.final_amount, 0);
    const pending = filteredBills.filter(bill => bill.status?.toLowerCase() === 'pending').length;
    const paid = filteredBills.filter(bill => bill.status?.toLowerCase() === 'paid').length;
    const overdue = filteredBills.filter(bill => bill.status?.toLowerCase() === 'overdue').length;
    
    return { total, pending, paid, overdue };
  };

  const totals = calculateTotals();

  // Handle export
  const handleExportBill = (billId: string) => {
    console.log('Exporting bill:', billId);
    // Implement export functionality
  };

  // Handle view invoice
  const handleViewInvoice = (billId: string) => {
    console.log('Viewing invoice for bill:', billId);
    // Navigate to invoice details
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading consolidated bills...</div>
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
            <h1 className="text-2xl font-bold text-gray-900">Consolidated Billing</h1>
          </div>
          <p className="text-gray-600 mt-1">
            View all consolidated bills across departments
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Link href="/dashboard/coordination/billing?tab=generate">
            <Button variant="primary">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Generate Bill
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchConsolidatedBilling()}
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Amount</div>
            <div className="text-2xl font-bold text-gray-900">{format(totals.total)}</div>
            <div className="text-sm text-gray-600 mt-1">{filteredBills.length} bills</div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{totals.pending}</div>
            <div className="text-sm text-gray-600 mt-1">Awaiting payment</div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Paid</div>
            <div className="text-2xl font-bold text-green-600">{totals.paid}</div>
            <div className="text-sm text-gray-600 mt-1">Successfully paid</div>
          </div>
        </Card>
        
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Overdue</div>
            <div className="text-2xl font-bold text-red-600">{totals.overdue}</div>
            <div className="text-sm text-gray-600 mt-1">Past due date</div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Filter by status:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedStatus('all')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      selectedStatus === 'all' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSelectedStatus('pending')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      selectedStatus === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Pending
                  </button>
                  <button
                    onClick={() => setSelectedStatus('paid')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      selectedStatus === 'paid' ? 'bg-green-100 text-green-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Paid
                  </button>
                  <button
                    onClick={() => setSelectedStatus('overdue')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium ${
                      selectedStatus === 'overdue' ? 'bg-red-100 text-red-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Overdue
                  </button>
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              Showing {filteredBills.length} of {consolidatedBills.length} bills
            </div>
          </div>
        </div>
      </Card>

      {/* Bills List */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Consolidated Bills</h2>
          <div className="text-sm text-gray-600">
            {filteredBills.length} bill{filteredBills.length !== 1 ? 's' : ''}
          </div>
        </div>

        {filteredBills.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No consolidated bills found</h3>
              <p className="mt-1 text-gray-500">
                {selectedStatus !== 'all' 
                  ? `No bills with status "${selectedStatus}"`
                  : 'Generate a consolidated bill from completed department work'}
              </p>
              <div className="mt-6">
                <Link href="/dashboard/coordination/billing?tab=generate">
                  <Button variant="primary">
                    Generate Bill
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredBills.map((bill: ConsolidatedBill) => (
              <ConsolidatedBillComponent
                key={bill.id}
                bill={bill}
                onExport={handleExportBill}
                onViewInvoice={handleViewInvoice}
              />
            ))}
          </div>
        )}
      </div>

      {/* Export Options */}
      {filteredBills.length > 0 && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>
            
            <div className="flex flex-wrap gap-3">
              <Button variant="outline">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export All as PDF
              </Button>
              
              <Button variant="outline">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export All as CSV
              </Button>
              
              <Button variant="outline">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Print All
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
