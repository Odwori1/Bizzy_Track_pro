'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface TransactionItem {
  id: string;
  product_id: string | null;
  inventory_item_id: string | null;
  service_id: string | null;
  item_type: string;
  item_name: string;
  item_display_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  discount_amount: string;
}

interface Transaction {
  id: string;
  transaction_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  transaction_date: any;
  total_amount: string;
  tax_amount: string;
  discount_amount: string;
  final_amount: string;
  payment_method: string;
  payment_status: string;
  status: string;
  notes: string;
  created_by_name: string;
  created_at: any;
  updated_at: any;
  items: TransactionItem[];
}

export default function TransactionDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { format } = useCurrency();
  const transactionId = params.id as string;

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    notes: '',
    status: '',
    payment_status: ''
  });

  useEffect(() => {
    fetchTransactionData();
  }, [transactionId]);

  const fetchTransactionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch transaction details - items are included in the main response
      const transactionData = await apiClient.get<Transaction>(`/pos/transactions/${transactionId}`);
      setTransaction(transactionData);
      setFormData({
        notes: transactionData.notes || '',
        status: transactionData.status,
        payment_status: transactionData.payment_status
      });

    } catch (err: any) {
      console.error('Failed to fetch transaction:', err);
      setError(err.message || 'Failed to fetch transaction details');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.put(`/pos/transactions/${transactionId}`, formData);
      setEditing(false);
      fetchTransactionData(); // Refresh data
    } catch (err: any) {
      alert(err.message || 'Failed to update transaction');
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      try {
        await apiClient.delete(`/pos/transactions/${transactionId}`);
        router.push('/dashboard/management/pos/transactions');
      } catch (err: any) {
        alert(err.message || 'Failed to delete transaction');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'cash': return 'bg-green-100 text-green-800';
      case 'card': return 'bg-blue-100 text-blue-800';
      case 'mobile_money': return 'bg-purple-100 text-purple-800';
      case 'credit': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getItemTypeColor = (type: string) => {
    switch (type) {
      case 'product': return 'bg-blue-100 text-blue-800';
      case 'service': return 'bg-green-100 text-green-800';
      case 'inventory': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading transaction details...</div>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 space-y-4">
        <div className="text-red-600 text-center">
          <div className="text-lg font-semibold">Error Loading Transaction</div>
          <div className="text-sm mt-2">{error || 'Transaction not found'}</div>
        </div>
        <div className="flex space-x-3">
          <Button onClick={fetchTransactionData} variant="outline">
            Try Again
          </Button>
          <Button onClick={() => router.push('/dashboard/management/pos/transactions')}>
            Back to Transactions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{transaction.transaction_number}</h1>
          <p className="text-gray-600">Transaction Details</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/pos/transactions')}
          >
            Back to Transactions
          </Button>
          {!editing && (
            <Button
              variant="primary"
              onClick={() => setEditing(true)}
            >
              Edit Transaction
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Transaction Information */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Transaction Information</h2>

            {editing ? (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="active">Active</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={formData.payment_status}
                      onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="completed">Completed</option>
                      <option value="pending">Pending</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex space-x-3">
                  <Button type="submit" variant="primary">
                    Save Changes
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Transaction Date</label>
                  <p className="mt-1 text-sm text-gray-900">{formatDate(transaction.transaction_date)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                      {transaction.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Payment Method</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentMethodColor(transaction.payment_method)}`}>
                      {transaction.payment_method.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Payment Status</label>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(transaction.payment_status)}`}>
                      {transaction.payment_status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Customer</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {transaction.customer_name || 'Walk-in Customer'}
                  </p>
                  {transaction.customer_phone && (
                    <p className="text-sm text-gray-500">{transaction.customer_phone}</p>
                  )}
                  {transaction.customer_email && (
                    <p className="text-sm text-gray-500">{transaction.customer_email}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Cashier</label>
                  <p className="mt-1 text-sm text-gray-900">{transaction.created_by_name}</p>
                </div>
                {transaction.notes && (
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Notes</label>
                    <p className="mt-1 text-sm text-gray-900">{transaction.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Items List */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Items ({transaction.items?.length || 0})
            </h2>

            {!transaction.items || transaction.items.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No items found in this transaction.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
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
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transaction.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.item_display_name || item.item_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getItemTypeColor(item.item_type)}`}>
                            {item.item_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(item.unit_price)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(item.total_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                        Subtotal:
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {format(transaction.total_amount)}
                      </td>
                    </tr>
                    {parseFloat(transaction.tax_amount) > 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                          Tax:
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {format(transaction.tax_amount)}
                        </td>
                      </tr>
                    )}
                    {parseFloat(transaction.discount_amount) > 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                          Discount:
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          -{format(transaction.discount_amount)}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={4} className="px-6 py-4 text-sm font-bold text-gray-900 text-right">
                        Total:
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {format(transaction.final_amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Items</span>
                <span className="text-sm text-gray-900">{transaction.items?.length || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Subtotal</span>
                <span className="text-sm text-gray-900">{format(transaction.total_amount)}</span>
              </div>
              {parseFloat(transaction.tax_amount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tax</span>
                  <span className="text-sm text-gray-900">{format(transaction.tax_amount)}</span>
                </div>
              )}
              {parseFloat(transaction.discount_amount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Discount</span>
                  <span className="text-sm text-gray-900">-{format(transaction.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="text-sm font-medium text-gray-900">Total</span>
                <span className="text-sm font-medium text-gray-900">{format(transaction.final_amount)}</span>
              </div>
            </div>
          </div>

          {/* Actions Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-2">
              <Button variant="outline" className="w-full">
                Print Receipt
              </Button>
              <Button variant="outline" className="w-full">
                Send Receipt
              </Button>
              <Button
                variant="danger"
                className="w-full"
                onClick={handleDelete}
              >
                Delete Transaction
              </Button>
            </div>
          </div>

          {/* Timeline Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Created</span>
                <span className="text-gray-900">{formatDate(transaction.created_at)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Last Updated</span>
                <span className="text-gray-900">{formatDate(transaction.updated_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
