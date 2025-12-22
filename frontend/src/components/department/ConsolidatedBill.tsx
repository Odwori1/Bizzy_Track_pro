import React from 'react';
import { ConsolidatedBill } from '@/types/department';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import Link from 'next/link';

interface ConsolidatedBillProps {
  bill: ConsolidatedBill;
  onExport?: (billId: string) => void;
  onViewInvoice?: (invoiceId: string) => void;
  showActions?: boolean;
}

export const ConsolidatedBillComponent: React.FC<ConsolidatedBillProps> = ({
  bill,
  onExport,
  onViewInvoice,
  showActions = true,
}) => {
  const { format } = useCurrency();

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
      case 'draft':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  // Format date
  const formatDate = (dateString: string | any) => {
    if (!dateString) return 'N/A';

    if (typeof dateString === 'string') {
      try {
        return new Date(dateString).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } catch (e) {
        return 'Invalid date';
      }
    }

    // Handle backend date object format
    if (dateString?.formatted) {
      return dateString.formatted.split(',')[0]; // Get just the date part
    }

    return 'N/A';
  };

  // Safe bill data with proper calculations
  const safeBill = {
    id: bill?.id || '',
    invoice_number: bill?.invoice_number || bill?.invoice?.invoice_number || 'N/A',
    status: bill?.status || bill?.invoice?.status || 'draft',
    total_amount: bill?.total_amount || parseFloat(bill?.invoice?.total_amount || '0') || 0,
    tax_amount: bill?.tax_amount || parseFloat(bill?.invoice?.tax_amount || '0') || 0,
    discount_amount: bill?.discount_amount || parseFloat(bill?.invoice?.discount_amount || '0') || 0,
    final_amount: bill?.final_amount || parseFloat(bill?.invoice?.total_amount || '0') || 0,
    created_at: bill?.created_at || bill?.invoice?.created_at || new Date().toISOString(),
    department_breakdown: bill?.department_breakdown || [],

    // Job details
    job_number: bill?.job_number || 'Unknown',
    job_title: bill?.job_title || 'No title',
    job_status: bill?.job_status || 'unknown',
    customer_name: bill?.customer_first_name && bill?.customer_last_name
      ? `${bill.customer_first_name} ${bill.customer_last_name}`
      : bill?.customer_first_name || bill?.customer_last_name || 'Unknown Customer',

    // Pricing details (from fixed backend)
    service_price: bill?.service_price || 0,
    department_total: bill?.department_total || 0,
    profit: bill?.profit || 0,
    total_cost: bill?.total_cost || 0,
    
    // CRITICAL: Get the actual invoice ID
    invoice_id: bill?.invoice?.id || bill?.id || '',
    
    // Also get from consolidated response if available
    consolidated_invoice_id: bill?.invoice_id || bill?.invoice?.id || '',
  };

  // Determine which ID to use for viewing
  const getViewableInvoiceId = () => {
    // Try in order: invoice_id, consolidated_invoice_id, id
    return safeBill.invoice_id || safeBill.consolidated_invoice_id || safeBill.id;
  };

  const viewableInvoiceId = getViewableInvoiceId();
  console.log('Viewable Invoice ID:', viewableInvoiceId, 'from bill:', bill);

  // Calculate department total from breakdown if not provided
  const calculatedDepartmentTotal = safeBill.department_total > 0
    ? safeBill.department_total
    : safeBill.department_breakdown.reduce((sum, dept) => sum + (dept.amount || 0), 0);

  // Calculate percentages for breakdown
  const getBreakdownWithPercentages = () => {
    const deptTotal = calculatedDepartmentTotal;
    if (deptTotal === 0) return safeBill.department_breakdown.map(dept => ({ ...dept, percentage: 0 }));

    return safeBill.department_breakdown.map(dept => ({
      ...dept,
      percentage: (dept.amount / deptTotal) * 100
    }));
  };

  const breakdown = getBreakdownWithPercentages();

  // Calculate price discrepancy
  const hasServicePrice = safeBill.service_price > 0;
  const hasDepartmentCosts = calculatedDepartmentTotal > 0;
  const priceDifference = hasServicePrice && hasDepartmentCosts
    ? safeBill.service_price - calculatedDepartmentTotal
    : 0;
  const profitMargin = hasServicePrice && safeBill.service_price > 0
    ? (priceDifference / safeBill.service_price) * 100
    : 0;

  // Determine billing scenario for clear messaging
  const getBillingMessage = () => {
    if (!hasServicePrice && !hasDepartmentCosts) return {
      title: 'No Pricing Data',
      color: 'gray',
      message: 'Service price and department costs not available'
    };

    if (!hasServicePrice && hasDepartmentCosts) return {
      title: 'Department Costs Only',
      color: 'yellow',
      message: 'Only department costs available. Service price needed for complete billing.'
    };

    if (hasServicePrice && !hasDepartmentCosts) return {
      title: 'Service Price Only',
      color: 'blue',
      message: 'Service price set. No department costs recorded.'
    };

    if (Math.abs(priceDifference) < 0.01) return {
      title: 'Break Even',
      color: 'yellow',
      message: 'Service price equals department costs'
    };

    if (priceDifference > 0) return {
      title: 'Profitable',
      color: 'green',
      message: `Profit: ${format(priceDifference)} (${profitMargin.toFixed(1)}% margin)`
    };

    return {
      title: 'Loss',
      color: 'red',
      message: `Loss: ${format(Math.abs(priceDifference))}`
    };
  };

  const billingInfo = getBillingMessage();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(safeBill.status)}`}>
              {safeBill.status.toUpperCase()}
            </span>
            <h3 className="text-lg font-semibold text-gray-900">
              Invoice #{safeBill.invoice_number}
            </h3>
          </div>
          <div className="text-sm text-gray-600 mb-1">
            Job: {safeBill.job_number} - {safeBill.job_title}
          </div>
          <div className="text-sm text-gray-600">
            Customer: {safeBill.customer_name} | Created on {formatDate(safeBill.created_at)}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {format(safeBill.final_amount)}
          </div>
          <div className="text-sm text-gray-600">
            Customer Invoice Amount
          </div>
        </div>
      </div>

      {/* Billing Analysis - CRITICAL SECTION */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h4 className="font-medium text-gray-900 mb-3">Billing Analysis</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Customer Invoice */}
          <div className="bg-white p-4 rounded border">
            <div className="text-sm font-medium text-blue-600 mb-2">Customer Invoice</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Invoice Amount:</span>
                <span className="font-bold text-gray-900">{format(safeBill.final_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Tax:</span>
                <span className="text-sm text-gray-900">{format(safeBill.tax_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Discount:</span>
                <span className="text-sm text-gray-900">{format(safeBill.discount_amount)}</span>
              </div>
            </div>
          </div>

          {/* Cost Analysis */}
          <div className="bg-white p-4 rounded border">
            <div className="text-sm font-medium text-gray-700 mb-2">Cost Analysis</div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Service Price:</span>
                <span className={`font-medium ${hasServicePrice ? 'text-gray-900' : 'text-gray-400'}`}>
                  {hasServicePrice ? format(safeBill.service_price) : 'Not set'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Department Costs:</span>
                <span className={`font-medium ${hasDepartmentCosts ? 'text-gray-900' : 'text-gray-400'}`}>
                  {hasDepartmentCosts ? format(calculatedDepartmentTotal) : 'No costs'}
                </span>
              </div>
              {hasServicePrice && hasDepartmentCosts && (
                <div className="flex justify-between pt-1 border-t">
                  <span className="text-sm font-medium text-gray-900">Net Result:</span>
                  <span className={`font-bold ${priceDifference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {priceDifference >= 0 ? '+' : '-'}{format(Math.abs(priceDifference))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status Message */}
        <div className={`p-3 rounded border border-${billingInfo.color}-200 bg-${billingInfo.color}-50`}>
          <div className="flex items-center">
            <div className={`text-sm font-medium text-${billingInfo.color}-700 mr-2`}>
              {billingInfo.title}
            </div>
            <div className="text-sm text-gray-600 flex-1">{billingInfo.message}</div>
          </div>
        </div>
      </div>

      {/* Department Cost Details */}
      {hasDepartmentCosts && (
        <div className="mb-6">
          <h4 className="text-md font-semibold text-gray-900 mb-4">Department Cost Details (Internal)</h4>

          <div className="space-y-3">
            {breakdown.map((dept, index) => (
              <div key={`${dept.department_id}-${dept.id || index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <span className="font-medium text-gray-900">{dept.department_name}</span>
                      {dept.billing_type && (
                        <span className="ml-2 text-xs text-gray-500">({dept.billing_type})</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {format(dept.amount)}
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>
                      {dept.quantity ? `${dept.quantity} × ${format(dept.unit_price || 0)}` : 'Fixed cost'}
                    </span>
                    <span>{dept.percentage.toFixed(1)}% of total costs</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Total Department Costs */}
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <div className="font-medium text-gray-900">Total Department Costs</div>
                <div className="text-lg font-bold text-gray-900">
                  {format(calculatedDepartmentTotal)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Details */}
      <div className="mb-6">
        <h4 className="text-md font-semibold text-gray-900 mb-3">Invoice Details</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Subtotal</div>
            <div className="text-sm font-semibold text-gray-900">
              {format(safeBill.total_amount)}
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Tax</div>
            <div className="text-sm font-semibold text-gray-900">
              {format(safeBill.tax_amount)}
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Discount</div>
            <div className="text-sm font-semibold text-gray-900">
              {format(safeBill.discount_amount)}
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded border border-blue-100">
            <div className="text-xs text-blue-600 uppercase tracking-wider mb-1">Final Amount</div>
            <div className="text-sm font-semibold text-blue-700">
              {format(safeBill.final_amount)}
            </div>
          </div>
        </div>
      </div>

      {/* Important Note for Existing Bills */}
      {hasServicePrice && safeBill.final_amount !== safeBill.service_price && safeBill.final_amount > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium text-yellow-700">Note about existing bills:</span>
          </div>
          <p className="text-sm text-yellow-600 mt-1">
            This bill was generated before the pricing fix. New bills will correctly use the service price ({format(safeBill.service_price)}).
            The system now properly charges customers the service price while tracking department costs internally.
          </p>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex justify-end space-x-3 pt-6 border-t">
          {onExport && (
            <Button
              variant="outline"
              onClick={() => onExport(safeBill.id)}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export PDF
            </Button>
          )}

          {onViewInvoice && viewableInvoiceId && viewableInvoiceId.trim() !== '' && (
            <Button
              variant="primary"
              onClick={() => onViewInvoice(viewableInvoiceId)}
              disabled={!viewableInvoiceId || viewableInvoiceId.trim() === ''}
            >
              View Invoice
            </Button>
          )}

          <Link href={`/dashboard/management/invoices/${safeBill.id}`}>
            <Button variant="outline">
              View Details
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};
