'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useInvoices } from '@/hooks/useInvoices';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-orange-100 text-orange-800',
};

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
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [updating, setUpdating] = useState(false);

  const invoiceId = params.id as string;

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice(invoiceId);
    }
  }, [invoiceId, fetchInvoice]);

  useEffect(() => {
    if (error) {
      console.error('Invoice error:', error);
    }
  }, [error]);

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      setUpdating(true);
      await updateInvoiceStatus(invoiceId, { status: newStatus });
      // Refresh the invoice data
      await fetchInvoice(invoiceId);
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setUpdating(true);
      // FIXED: Using correct field name 'amount' instead of 'amount_paid'
      await recordPayment(invoiceId, {
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod
      });
      setPaymentAmount('');
      // Refresh the invoice data
      await fetchInvoice(invoiceId);
    } catch (err) {
      console.error('Failed to record payment:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-4 text-red-700 bg-red-50 rounded-lg">{error}</div>;
  if (!currentInvoice) return <div className="p-4 text-gray-500">Invoice not found</div>;

  const invoice = currentInvoice;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoice {invoice.invoice_number}</h1>
          <p className="text-gray-600">Invoice details and management</p>
        </div>
        <Link href="/dashboard/management/invoices">
          <Button variant="secondary">
            Back to Invoices
          </Button>
        </Link>
      </div>

      {/* Invoice Status and Actions */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Invoice Status</h2>
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[invoice.status]}`}>
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
            {invoice.status === 'sent' && (
              <Button
                onClick={() => handleStatusUpdate('paid')}
                variant="primary"
                size="sm"
                disabled={updating}
              >
                {updating ? 'Updating...' : 'Mark as Paid'}
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
                  {invoice.due_date?.formatted || new Date(invoice.due_date).toLocaleDateString()}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Invoice Date</label>
                <p className="text-gray-900">
                  {invoice.created_at?.formatted || new Date(invoice.created_at).toLocaleDateString()}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Total Amount</label>
                <p className="text-gray-900 font-semibold">
                  {format(invoice.total_amount)} {/* ✅ CORRECT: Using format function */}
                </p>
              </div>
            </div>

            {invoice.notes && (
              <div>
                <label className="text-sm font-medium text-gray-700">Notes</label>
                <p className="text-gray-900">{invoice.notes}</p>
              </div>
            )}

            {invoice.terms && (
              <div>
                <label className="text-sm font-medium text-gray-700">Terms & Conditions</label>
                <p className="text-gray-900">{invoice.terms}</p>
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
                  {format(invoice.total_amount)} {/* ✅ CORRECT: Using format function */}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">Amount Paid:</span>
                <span className="font-semibold text-green-600">
                  {format(invoice.amount_paid)} {/* ✅ CORRECT: Using format function */}
                </span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-700 font-medium">Balance Due:</span>
                <span className="font-semibold text-red-600">
                  {format(invoice.balance_due)} {/* ✅ CORRECT: Using format function */}
                </span>
              </div>
            </div>

            {/* Record Payment Form */}
            {parseFloat(invoice.balance_due) > 0 && (
              <form onSubmit={handleRecordPayment} className="space-y-3 pt-4 border-t">
                <h3 className="font-medium text-gray-900">Record Payment</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount
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

      {/* Line Items */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {invoice.line_items && invoice.line_items.map((item: any, index: number) => (
              <div key={index} className="flex justify-between items-center py-3 border-b border-gray-200 last:border-b-0">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{item.description}</p>
                  {item.service_name && (
                    <p className="text-sm text-gray-600">Service: {item.service_name}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-gray-900">
                    {item.quantity} × {format(item.unit_price.toString())} {/* ✅ CORRECT: Using format function */}
                  </p>
                  <p className="font-semibold text-gray-900">
                    {format((item.quantity * item.unit_price).toString())} {/* ✅ CORRECT: Using format function */}
                  </p>
                  {item.tax_rate > 0 && (
                    <p className="text-sm text-gray-600">Tax: {item.tax_rate}%</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
