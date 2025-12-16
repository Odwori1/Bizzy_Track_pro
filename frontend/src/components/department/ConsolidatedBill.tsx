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
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'draft':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Safe bill data
  const safeBill = {
    id: bill?.id || '',
    invoice_number: bill?.invoice_number || 'N/A',
    status: bill?.status || 'draft',
    total_amount: bill?.total_amount || 0,
    tax_amount: bill?.tax_amount || 0,
    discount_amount: bill?.discount_amount || 0,
    final_amount: bill?.final_amount || 0,
    created_at: bill?.created_at || new Date().toISOString(),
    department_breakdown: bill?.department_breakdown || [],
  };

  // Calculate percentages for breakdown
  const getBreakdownWithPercentages = () => {
    return safeBill.department_breakdown.map(dept => ({
      ...dept,
      percentage: (dept.amount / safeBill.total_amount) * 100
    }));
  };

  const breakdown = getBreakdownWithPercentages();

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
          <div className="text-sm text-gray-600">
            Created on {formatDate(safeBill.created_at)}
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {format(safeBill.final_amount)}
          </div>
          <div className="text-sm text-gray-600">
            Total Amount
          </div>
        </div>
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Subtotal</div>
          <div className="text-lg font-semibold text-gray-900">
            {format(safeBill.total_amount)}
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Tax</div>
          <div className="text-lg font-semibold text-gray-900">
            {format(safeBill.tax_amount)}
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Discount</div>
          <div className="text-lg font-semibold text-gray-900">
            {format(safeBill.discount_amount)}
          </div>
        </div>
        
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
          <div className="text-xs text-blue-600 uppercase tracking-wider mb-1">Final Amount</div>
          <div className="text-lg font-semibold text-blue-700">
            {format(safeBill.final_amount)}
          </div>
        </div>
      </div>

      {/* Department Breakdown */}
      <div className="mb-8">
        <h4 className="text-md font-semibold text-gray-900 mb-4">Department Breakdown</h4>
        
        {breakdown.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            No department breakdown available
          </div>
        ) : (
          <div className="space-y-3">
            {breakdown.map((dept, index) => (
              <div key={dept.department_id} className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium text-gray-900">
                      {dept.department_name}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {format(dept.amount)}
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${dept.percentage}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {dept.percentage.toFixed(1)}% of total
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
          
          {onViewInvoice && (
            <Button
              variant="primary"
              onClick={() => onViewInvoice(safeBill.id)}
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
