'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConsolidatedBillComponent } from '@/components/department/ConsolidatedBill';
import { useDepartment } from '@/hooks/useDepartment';
import { useCurrency } from '@/lib/currency';
import { formatDisplayDate } from '@/lib/date-format'; // Import date formatting
import { ConsolidatedBill, DepartmentBillingEntry } from '@/types/department';

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'consolidated' | 'entries' | 'generate'>('consolidated');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const {
    consolidatedBills,
    billingEntries,
    loading,
    error,
    fetchConsolidatedBilling,
    fetchBillingEntries,
    generateConsolidatedBill,
  } = useDepartment();

  const { format } = useCurrency();

  // Load data on mount and tab change
  useEffect(() => {
    if (activeTab === 'consolidated') {
      fetchConsolidatedBilling();
    } else if (activeTab === 'entries') {
      fetchBillingEntries();
    }
  }, [activeTab, fetchConsolidatedBilling, fetchBillingEntries]);

  // Helper to ensure array
  const ensureArray = (data: any): any[] => {
    if (Array.isArray(data)) {
      return data;
    }
    if (data && data.data && Array.isArray(data.data)) {
      return data.data;
    }
    if (data && data.entries && Array.isArray(data.entries)) {
      return data.entries;
    }
    return [];
  };

  // Calculate totals with proper null/undefined handling
  const calculateTotals = (entries: any[] | null | undefined) => {
    const safeEntries = ensureArray(entries);

    return safeEntries.reduce(
      (acc, entry) => ({
        totalAmount: acc.totalAmount + (parseFloat(entry.amount) || parseFloat(entry.total_amount) || 0),
        totalTax: acc.totalTax + (parseFloat(entry.tax_amount) || 0),
        totalPaid: acc.totalPaid + (parseFloat(entry.amount_paid) || 0),
        totalDue: acc.totalDue + (parseFloat(entry.balance_due) || 0)
      }),
      { totalAmount: 0, totalTax: 0, totalPaid: 0, totalDue: 0 }
    );
  };

  // Calculate counts for display - FIXED VERSION
  const calculateCounts = () => {
    if (activeTab === 'consolidated') {
      const safeBills = ensureArray(consolidatedBills);
      const pending = safeBills.filter(bill => bill.status === 'pending').length;
      const paid = safeBills.filter(bill => bill.status === 'paid').length;
      const count = safeBills.length;
      const totals = calculateTotals(safeBills);

      return {
        total: totals.totalAmount,
        pending,
        paid,
        count,
        tax: totals.totalTax,
        paidAmount: totals.totalPaid,
        due: totals.totalDue
      };
    } else {
      // FIXED: Ensure billingEntries is an array before calling .filter()
      const safeEntries = ensureArray(billingEntries);
      const pending = safeEntries.filter(entry => !entry.invoice_id).length;
      const invoiced = safeEntries.filter(entry => entry.invoice_id).length;
      const count = safeEntries.length;
      const totals = calculateTotals(safeEntries);

      return {
        total: totals.totalAmount,
        pending,
        paid: invoiced,
        count,
        tax: totals.totalTax,
        paidAmount: totals.totalPaid,
        due: totals.totalDue
      };
    }
  };

  const counts = calculateCounts();

  // Check if a job already has a consolidated bill
  const getExistingBillForJob = (jobId: string) => {
    const safeBills = ensureArray(consolidatedBills);
    return safeBills.find(bill => bill.job_id === jobId);
  };

  // Handle bill generation with improved error handling
  const handleGenerateBill = async () => {
    if (!selectedJobId) {
      alert('Please select a job first');
      return;
    }

    // Clear any previous errors
    setGenerationError(null);

    // Check if bill already exists for this job
    const existingBill = getExistingBillForJob(selectedJobId);
    if (existingBill) {
      const jobNumber = uniqueJobs.find(j => j.id === selectedJobId)?.number || 'Unknown';
      const userChoice = confirm(
        `A consolidated bill already exists for Job ${jobNumber}.\n\n` +
        `Bill #: ${existingBill.bill_number || existingBill.id}\n` +
        `Status: ${existingBill.status || 'Unknown'}\n\n` +
        'Would you like to view the existing bill instead?\n' +
        '(Click OK to view, Cancel to generate new bill)'
      );
      
      if (userChoice) {
        // User wants to view existing bill - could navigate to bill details
        console.log('Should navigate to existing bill:', existingBill.id);
        // For now, just show a message
        alert('Bill viewing feature will be implemented. Existing bill ID: ' + existingBill.id);
        return;
      }
    }

    try {
      console.log('Attempting to generate bill for job:', selectedJobId);
      await generateConsolidatedBill(selectedJobId);
      
      // Refresh the consolidated bills list
      await fetchConsolidatedBilling();
      
      // Switch to consolidated view
      setActiveTab('consolidated');
      
      // Show success message
      alert('Consolidated bill generated successfully!');
    } catch (error: any) {
      console.error('Failed to generate bill:', error);
      
      // Extract error message
      let errorMessage = error.message || 'Failed to generate bill';
      
      // Check for specific backend error messages
      if (errorMessage.includes('invoice already exists') || 
          errorMessage.includes('An invoice already exists')) {
        
        const jobNumber = uniqueJobs.find(j => j.id === selectedJobId)?.number || 'Unknown';
        errorMessage = `An invoice already exists for Job ${jobNumber}. Please use the existing invoice.`;
        
        // Offer to view existing invoices
        const userChoice = confirm(
          errorMessage + '\n\n' +
          'Would you like to view existing invoices for this job?\n' +
          '(Click OK to view, Cancel to stay here)'
        );
        
        if (userChoice) {
          // Could navigate to invoices page filtered by this job
          console.log('Should navigate to invoices for job:', selectedJobId);
        }
      }
      
      // Set error state for display
      setGenerationError(errorMessage);
      
      // Also show alert for immediate feedback
      alert(`Error: ${errorMessage}`);
    }
  };

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

  // Get unique jobs from consolidated bills
  const getUniqueJobs = () => {
    const safeBills = ensureArray(consolidatedBills);

    const jobIds = new Set(safeBills.map(bill => bill.job_id).filter(Boolean));
    return Array.from(jobIds).map(jobId => {
      const bill = safeBills.find(b => b.job_id === jobId);
      const hasExistingBill = !!bill;
      
      return {
        id: jobId!,
        number: bill?.job_number || 'Unknown',
        title: bill?.job_title || 'No title',
        hasExistingBill,
        existingBillId: bill?.id,
        existingBillStatus: bill?.status
      };
    });
  };

  // Get safe arrays for rendering
  const safeConsolidatedBills = ensureArray(consolidatedBills);
  const safeBillingEntries = ensureArray(billingEntries);

  const uniqueJobs = getUniqueJobs();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Billing</h1>
          <p className="text-gray-600 mt-1">
            Manage consolidated billing and department charges
          </p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => activeTab === 'consolidated' ? fetchConsolidatedBilling() : fetchBillingEntries()}
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Generation Error Display */}
      {generationError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="text-yellow-800 text-sm font-medium">Bill Generation Error</div>
          <div className="text-yellow-700 text-sm mt-1">{generationError}</div>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGenerationError(null)}
              className="mr-2"
            >
              Dismiss
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveTab('consolidated')}
            >
              View Existing Bills
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Card>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('consolidated')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'consolidated' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Consolidated Bills
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {safeConsolidatedBills.length}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('entries')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'entries' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Billing Entries
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {safeBillingEntries.length}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('generate')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'generate' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Generate Bill
              </div>
            </button>
          </nav>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Amount</div>
            <div className="text-2xl font-bold text-gray-900">{format(counts.total)}</div>
            <div className="text-sm text-gray-600 mt-1">{counts.count} {activeTab === 'consolidated' ? 'bills' : 'entries'}</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Total Tax</div>
            <div className="text-2xl font-bold text-orange-600">{format(counts.tax)}</div>
            <div className="text-sm text-gray-600 mt-1">Tax amount</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Amount Paid</div>
            <div className="text-2xl font-bold text-green-600">{format(counts.paidAmount)}</div>
            <div className="text-sm text-gray-600 mt-1">Received payments</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Balance Due</div>
            <div className="text-2xl font-bold text-red-600">{format(counts.due)}</div>
            <div className="text-sm text-gray-600 mt-1">Outstanding balance</div>
          </div>
        </Card>
      </div>

      {/* Count Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pending</div>
            <div className="text-2xl font-bold text-yellow-600">{counts.pending}</div>
            <div className="text-sm text-gray-600 mt-1">Awaiting payment</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Paid/Invoiced</div>
            <div className="text-2xl font-bold text-green-600">{counts.paid}</div>
            <div className="text-sm text-gray-600 mt-1">Successfully processed</div>
          </div>
        </Card>
      </div>

      {/* Consolidated Bills List */}
      {activeTab === 'consolidated' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Consolidated Bills</h2>
            <div className="text-sm text-gray-600">
              {safeConsolidatedBills.length} bill{safeConsolidatedBills.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading && safeConsolidatedBills.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading bills...</div>
            </div>
          ) : safeConsolidatedBills.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No consolidated bills</h3>
                <p className="mt-1 text-gray-500">
                  Generate a consolidated bill from completed department work
                </p>
                <div className="mt-6">
                  <Button
                    variant="primary"
                    onClick={() => setActiveTab('generate')}
                  >
                    Generate Bill
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {safeConsolidatedBills.map((bill: ConsolidatedBill) => (
                <ConsolidatedBillComponent
                  key={`consolidated-bill-${bill.id}`}
                  bill={bill}
                  onExport={handleExportBill}
                  onViewInvoice={handleViewInvoice}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Billing Entries Tab */}
      {activeTab === 'entries' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Billing Entries</h2>
            <div className="text-sm text-gray-600">
              {safeBillingEntries.length} entr{safeBillingEntries.length !== 1 ? 'ies' : 'y'}
            </div>
          </div>

          {loading && safeBillingEntries.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading entries...</div>
            </div>
          ) : safeBillingEntries.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No billing entries</h3>
                <p className="mt-1 text-gray-500">
                  Department charges will appear here when they're created
                </p>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Department
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Job
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {safeBillingEntries.map((entry: DepartmentBillingEntry) => (
                      <tr key={`billing-entry-${entry.id}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {entry.department_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {entry.department_code || ''}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {entry.job_number || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {entry.job_title || ''}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {entry.description}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">
                            {format(entry.total_amount || entry.amount)}
                          </div>
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

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {/* FIXED: Use proper date formatting utility */}
                          {formatDisplayDate(entry.billing_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'generate' && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Generate Consolidated Bill</h2>

            <div className="space-y-6">
              {/* Job Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Job
                </label>
                <select
                  value={selectedJobId || ''}
                  onChange={(e) => {
                    setSelectedJobId(e.target.value || null);
                    setGenerationError(null); // Clear error when changing selection
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a job...</option>
                  {uniqueJobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.number} - {job.title}
                      {job.hasExistingBill ? ' (Has existing bill)' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  Select a job that has completed department work to generate a consolidated bill
                </p>
                
                {/* Warning for jobs with existing bills */}
                {selectedJobId && uniqueJobs.find(j => j.id === selectedJobId)?.hasExistingBill && (
                  <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-yellow-700 font-medium">
                        This job already has a consolidated bill
                      </span>
                    </div>
                    <p className="text-sm text-yellow-600 mt-1">
                      Generating a new bill will create a duplicate. Consider viewing the existing bill instead.
                    </p>
                  </div>
                )}
              </div>

              {/* Preview */}
              {selectedJobId && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-medium text-gray-900 mb-2">Preview</h3>
                  <div className="text-sm text-gray-600">
                    Bill will include all department charges for the selected job
                  </div>
                  {/* Here you could show a preview of department charges */}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-6 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setActiveTab('consolidated');
                    setGenerationError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleGenerateBill}
                  disabled={!selectedJobId || loading}
                >
                  {loading ? 'Generating...' : 'Generate Consolidated Bill'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
