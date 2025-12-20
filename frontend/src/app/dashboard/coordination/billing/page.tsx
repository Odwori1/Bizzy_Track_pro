'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConsolidatedBillComponent } from '@/components/department/ConsolidatedBill';
import { BillingEntryForm } from '@/components/department/BillingEntryForm';
import { Modal } from '@/components/ui/Modal';
import { useDepartment } from '@/hooks/useDepartment';
import { useCurrency } from '@/lib/currency';
import { formatDisplayDate } from '@/lib/date-format';
import { ConsolidatedBill, DepartmentBillingEntry } from '@/types/department';

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<'consolidated' | 'entries' | 'generate'>('consolidated');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [servicePrices, setServicePrices] = useState<Record<string, number>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEntryToEdit, setSelectedEntryToEdit] = useState<DepartmentBillingEntry | null>(null);

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

  // Calculate totals with proper null/undefined handling - FIXED VERSION
  const calculateTotals = (entries: any[] | null | undefined) => {
    const safeEntries = ensureArray(entries);

    return safeEntries.reduce(
      (acc, entry) => ({
        totalAmount: acc.totalAmount + (parseFloat(entry.total_amount) || 0),
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
      const pending = safeBills.filter(bill => bill.status === 'pending' || bill.status === 'draft').length;
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
        `Bill #: ${existingBill.invoice_number || existingBill.id}\n` +
        `Status: ${existingBill.status || 'Unknown'}\n\n` +
        'Would you like to view the existing bill instead?\n' +
        '(Click OK to view, Cancel to generate new bill)'
      );

      if (userChoice) {
        // User wants to view existing bill
        if (existingBill.invoice_id) {
          handleViewInvoice(existingBill.invoice_id);
        } else if (existingBill.id) {
          handleViewInvoice(existingBill.id);
        } else {
          alert('Cannot find invoice ID for this bill');
        }
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
    alert('Export feature will be implemented');
  };

  // Handle view invoice - Updated function with validation
  const handleViewInvoice = (invoiceId: string) => {
    if (!invoiceId || invoiceId === 'undefined' || invoiceId === 'null') {
      console.error('Invalid invoice ID:', invoiceId);
      alert('Invalid invoice ID');
      return;
    }
    
    console.log('Opening invoice:', invoiceId);
    // Open in new tab
    window.open(`/dashboard/management/invoices/${invoiceId}`, '_blank');
  };

  // Generate bill for specific job
  const handleGenerateBillForJob = async (jobId: string) => {
    try {
      setSelectedJobId(jobId);
      await generateConsolidatedBill(jobId);
      
      // Refresh data
      await fetchBillingEntries();
      await fetchConsolidatedBilling();
      
      alert('Bill generated successfully!');
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
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
        existingBillNumber: bill?.invoice_number,
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
        <div className="flex space-x-2">
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Billing Entry
          </Button>
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
              {safeConsolidatedBills.map((bill: ConsolidatedBill, index: number) => (
                <ConsolidatedBillComponent
                  key={`consolidated-bill-${bill.job_id || bill.invoice?.id || `bill-${index}`}`}
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
                <div className="mt-6">
                  <Button
                    variant="primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create Billing Entry
                  </Button>
                </div>
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
                        Quantity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
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
                          <div className="text-sm text-gray-900 max-w-xs truncate">
                            {entry.description}
                          </div>
                          <div className="text-xs text-gray-500">
                            {entry.billing_type || 'service'}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.quantity || 1}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(entry.unit_price || 0)}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">
                            {format(entry.total_amount)}
                          </div>
                          {entry.cost_amount && (
                            <div className="text-xs text-gray-500">
                              Cost: {format(entry.cost_amount)}
                            </div>
                          )}
                        </td>

                        {/* Status Column - Updated with link to invoice */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {entry.invoice_id ? (
                            <div>
                              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                Invoiced
                              </span>
                              <button
                                onClick={() => handleViewInvoice(entry.invoice_id)}
                                className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                              >
                                View Invoice
                              </button>
                            </div>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDisplayDate(entry.billing_date)}
                        </td>

                        {/* Actions Column */}
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {!entry.invoice_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateBillForJob(entry.job_id)}
                              disabled={loading}
                            >
                              Generate Bill
                            </Button>
                          )}
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
                    setGenerationError(null);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose a job...</option>
                  {uniqueJobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.number} - {job.title}
                      {job.hasExistingBill ? ` (Has bill: ${job.existingBillNumber})` : ''}
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
                  <h3 className="font-medium text-gray-900 mb-2">Billing Preview</h3>
                  <div className="text-sm text-gray-600">
                    The consolidated bill will use the service price as the customer charge.
                    Department costs will be tracked internally for profit analysis.
                  </div>
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

      {/* Billing Entry Form Modal */}
      {showCreateModal && (
        <Modal
          title="Create Billing Entry"
          onClose={() => {
            setShowCreateModal(false);
            setSelectedEntryToEdit(null);
          }}
          size="lg"
        >
          <BillingEntryForm
            onSuccess={() => {
              setShowCreateModal(false);
              setSelectedEntryToEdit(null);
              // Refresh billing entries
              if (activeTab === 'entries') {
                fetchBillingEntries();
              }
            }}
            onCancel={() => {
              setShowCreateModal(false);
              setSelectedEntryToEdit(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
