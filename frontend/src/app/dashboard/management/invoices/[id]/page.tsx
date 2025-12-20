'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useInvoices } from '@/hooks/useInvoices';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency';

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-orange-100 text-orange-800',
  partial: 'bg-yellow-100 text-yellow-800',
};

interface Invoice {
  id: string;
  invoice_number: string;
  job_id: string;
  job_number: string;
  job_title: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  notes: string;
  terms: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
  }>;
  payments: Array<{
    amount: number;
    payment_method: string;
    reference: string;
    notes: string;
    created_at: string;
  }>;
  // Consolidated bill fields
  service_price?: number;
  department_total?: number;
  profit?: number;
  department_breakdown?: Array<{
    department_name: string;
    description: string;
    quantity: number;
    unit_price: number;
    total_amount: number;
    billing_type: string;
  }>;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const {
    currentInvoice,
    loading,
    error,
    fetchInvoice,
    updateInvoiceStatus,
    recordPayment,
    clearError
  } = useInvoices();
  const { format } = useCurrency();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [updating, setUpdating] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [showConsolidatedDetails, setShowConsolidatedDetails] = useState(false);
  
  // SAFELY get invoice ID from params
  const invoiceId = params?.id as string;

  useEffect(() => {
    if (!invoiceId || invoiceId === 'undefined') {
      console.error('Invalid invoice ID:', invoiceId);
      return;
    }
    
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    if (!invoiceId || invoiceId === 'undefined') {
      console.error('Cannot load invoice: ID is invalid');
      return;
    }

    try {
      console.log('Loading invoice with ID:', invoiceId);
      
      // First try to get consolidated invoice details
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/invoices/consolidated/${invoiceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log('Loaded consolidated invoice:', result.data.invoice_number);
          setInvoice(result.data);
          return;
        }
      } else if (response.status === 404) {
        // Try regular invoice endpoint
        console.log('Consolidated endpoint 404, trying regular endpoint...');
      }

      // Fallback to regular invoice fetch via store
      console.log('Using fallback invoice fetch');
      await fetchInvoice(invoiceId);
      if (currentInvoice) {
        setInvoice(currentInvoice as Invoice);
      }
    } catch (err) {
      console.error('Error loading invoice:', err);
      // Final fallback - try regular endpoint directly
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/invoices/${invoiceId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setInvoice(result.data);
          }
        }
      } catch (fallbackErr) {
        console.error('Fallback also failed:', fallbackErr);
      }
    }
  };

  useEffect(() => {
    if (currentInvoice && !invoice) {
      setInvoice(currentInvoice as Invoice);
    }
  }, [currentInvoice, invoice]);

  useEffect(() => {
    if (error) {
      console.error('Invoice error:', error);
    }
  }, [error]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!invoiceId || invoiceId === 'undefined') {
      alert('Invalid invoice ID');
      return;
    }
    
    try {
      setUpdating(true);
      await updateInvoiceStatus(invoiceId, { status: newStatus });
      await loadInvoice();
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update invoice status');
    } finally {
      setUpdating(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!invoiceId || invoiceId === 'undefined') {
      alert('Invalid invoice ID');
      return;
    }
    
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    try {
      setUpdating(true);
      await recordPayment(invoiceId, {
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        reference: paymentReference || undefined
      });
      setPaymentAmount('');
      setPaymentReference('');
      await loadInvoice();
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      alert(err.message || 'Failed to record payment');
    } finally {
      setUpdating(false);
    }
  };

  // Show loading state
  if (!invoiceId || invoiceId === 'undefined') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Invalid Invoice</div>
          <p className="text-red-600 mt-1">The invoice ID is missing or invalid.</p>
          <Link href="/dashboard/management/invoices">
            <Button variant="secondary" className="mt-2">
              Back to Invoices
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !invoice) {
    return (
      <div className="p-6">
        <Loading />
        <p className="text-center text-gray-600 mt-2">Loading invoice {invoiceId}...</p>
      </div>
    );
  }

  if (error && !invoice) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Error Loading Invoice</div>
          <p className="text-red-600 mt-1">{error}</p>
          <div className="mt-3 space-x-2">
            <Button variant="secondary" onClick={loadInvoice}>
              Retry
            </Button>
            <Link href="/dashboard/management/invoices">
              <Button variant="outline">
                Back to Invoices
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="text-yellow-800 font-medium">Invoice Not Found</div>
          <p className="text-yellow-600 mt-1">The invoice with ID {invoiceId} could not be found.</p>
          <Link href="/dashboard/management/invoices">
            <Button variant="secondary" className="mt-2">
              Back to Invoices
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isConsolidatedBill = invoice.invoice_number?.startsWith('CONS');
  const hasDepartmentBreakdown = invoice.department_breakdown && invoice.department_breakdown.length > 0;

  // Format date safely
  const formatDate = (dateString: any) => {
    if (!dateString) return 'N/A';
    
    try {
      if (typeof dateString === 'string') {
        return new Date(dateString).toLocaleDateString();
      }
      if (dateString.formatted) {
        return dateString.formatted;
      }
      return 'Invalid date';
    } catch (e) {
      return 'Invalid date';
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice {invoice.invoice_number}</h1>
          <p className="text-gray-600">
            {invoice.job_number && `Job: ${invoice.job_number} - ${invoice.job_title}`}
            {isConsolidatedBill && ' • Consolidated Bill'}
          </p>
        </div>
        <Link href="/dashboard/management/invoices">
          <Button variant="secondary">
            Back to Invoices
          </Button>
        </Link>
      </div>

      {/* Consolidated Bill Notice */}
      {isConsolidatedBill && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="font-medium text-blue-900">Consolidated Bill</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConsolidatedDetails(!showConsolidatedDetails)}
              >
                {showConsolidatedDetails ? 'Hide Details' : 'Show Cost Analysis'}
              </Button>
            </div>
            {showConsolidatedDetails && invoice.service_price && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-3 rounded border">
                  <div className="text-sm font-medium text-gray-700">Service Price</div>
                  <div className="text-lg font-bold text-gray-900">{format(invoice.service_price)}</div>
                  <div className="text-xs text-gray-600">Customer charge</div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-sm font-medium text-gray-700">Department Costs</div>
                  <div className="text-lg font-bold text-gray-900">{format(invoice.department_total || 0)}</div>
                  <div className="text-xs text-gray-600">Internal costs</div>
                </div>
                <div className="bg-white p-3 rounded border">
                  <div className="text-sm font-medium text-gray-700">Profit</div>
                  <div className={`text-lg font-bold ${(invoice.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {format(invoice.profit || 0)}
                  </div>
                  <div className="text-xs text-gray-600">Margin: {invoice.service_price ? `${(((invoice.profit || 0) / invoice.service_price) * 100).toFixed(1)}%` : '0%'}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoice Status and Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Invoice Status</h2>
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[invoice.status as keyof typeof statusColors] || 'bg-gray-100'}`}>
              {invoice.status.toUpperCase()}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {invoice.status === 'draft' && (
              <Button
                onClick={() => handleStatusUpdate('sent')}
                variant="primary"
                size="sm"
                disabled={updating}
              >
                {updating ? 'Updating...' : 'Mark as Sent'}
              </Button>
            )}
            {(invoice.status === 'sent' || invoice.status === 'partial') && (
              <Button
                onClick={() => handleStatusUpdate('paid')}
                variant="primary"
                size="sm"
                disabled={updating}
              >
                {updating ? 'Updating...' : 'Mark as Fully Paid'}
              </Button>
            )}
            {(invoice.status === 'draft' || invoice.status === 'sent') && (
              <Button
                onClick={() => handleStatusUpdate('cancelled')}
                variant="danger"
                size="sm"
                disabled={updating}
              >
                {updating ? 'Cancelling...' : 'Cancel Invoice'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Invoice Details</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Customer</label>
                <p className="text-gray-900">
                  {invoice.customer_first_name} {invoice.customer_last_name}
                </p>
                <p className="text-sm text-gray-600">{invoice.customer_email}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Due Date</label>
                <p className="text-gray-900">
                  {formatDate(invoice.due_date)}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Invoice Date</label>
                <p className="text-gray-900">
                  {formatDate(invoice.created_at)}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Total Amount</label>
                <p className="text-gray-900 font-semibold">
                  {format(invoice.total_amount)}
                </p>
              </div>
            </div>

            {invoice.notes && (
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <p className="text-gray-900 whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}

            {invoice.terms && (
              <div>
                <label className="text-sm font-medium text-gray-700">Terms & Conditions</label>
                <p className="text-gray-900 whitespace-pre-line">{invoice.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Information */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Payment Information</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-700">Total Amount:</span>
                <span className="font-semibold">
                  {format(invoice.total_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Amount Paid:</span>
                <span className="font-semibold text-green-600">
                  {format(invoice.amount_paid)}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-700 font-medium">Balance Due:</span>
                <span className="font-semibold text-red-600">
                  {format(invoice.balance_due)}
                </span>
              </div>
            </div>

            {/* Record Payment Form */}
            {parseFloat(invoice.balance_due.toString()) > 0 && (
              <form onSubmit={handleRecordPayment} className="space-y-3 pt-4 border-t">
                <h3 className="font-medium text-gray-900">Record Payment</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount (max: {format(invoice.balance_due)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={invoice.balance_due}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                    disabled={updating}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={updating}
                  >
                    <option value="cash">Cash</option>
                    <option value="card">Credit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="check">Check</option>
                    <option value="digital">Digital Payment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Check #, Transaction ID, etc."
                    disabled={updating}
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={updating || !paymentAmount}
                >
                  {updating ? 'Recording...' : 'Record Payment'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Department Breakdown for Consolidated Bills */}
      {hasDepartmentBreakdown && showConsolidatedDetails && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Department Cost Breakdown</h2>
            <p className="text-sm text-gray-600">Internal department costs for this job</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
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
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {invoice.department_breakdown!.map((dept, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {dept.department_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {dept.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {dept.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {format(dept.unit_price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {format(dept.total_amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {dept.billing_type}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td colSpan={4} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                      Total Department Costs:
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">
                      {format(invoice.department_total || 0)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Line Items */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Invoice Line Items</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {invoice.line_items && invoice.line_items.map((item: any, index: number) => (
              <div key={index} className="flex justify-between items-center py-3 border-b border-gray-200 last:border-b-0">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-900">
                    {item.quantity} × {format(item.unit_price)}
                  </p>
                  <p className="font-semibold text-gray-900">
                    {format(item.quantity * item.unit_price)}
                  </p>
                  {item.tax_rate > 0 && (
                    <p className="text-sm text-gray-600">Tax: {item.tax_rate}%</p>
                  )}
                </div>
              </div>
            ))}
            {(!invoice.line_items || invoice.line_items.length === 0) && (
              <p className="text-gray-500 text-center py-4">No line items found</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payments History */}
      {invoice.payments && invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invoice.payments.map((payment, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <div className="font-medium text-gray-900">{format(payment.amount)}</div>
                    <div className="text-sm text-gray-600">
                      {payment.payment_method} • {payment.reference || 'No reference'}
                      {payment.notes && <span className="ml-2">• {payment.notes}</span>}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(payment.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
