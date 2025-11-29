'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';

interface Receipt {
  id: string;
  transaction_number: string;
  customer_name: string;
  customer_phone: string;
  final_amount: string;
  payment_method: string;
  transaction_date: {
    formatted: string;
  };
  created_by_name: string;
  status: string;
}

export default function ReceiptsPage() {
  const router = useRouter();
  const { format } = useCurrency();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Receipt[]>('/pos/transactions');
      setReceipts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch receipts');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = (receiptId: string) => {
    // In a real implementation, this would generate a printable receipt
    window.open(`/dashboard/management/pos/receipts/${receiptId}/print`, '_blank');
  };

  const handleDeleteReceipt = async (receiptId: string, receiptNumber: string) => {
    if (confirm(`Are you sure you want to delete receipt ${receiptNumber}? This action cannot be undone.`)) {
      try {
        await apiClient.delete(`/pos/transactions/${receiptId}`);
        fetchReceipts(); // Refresh the list
      } catch (err: any) {
        alert(err.message || 'Failed to delete receipt');
      }
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter receipts based on search and payment method
  const filteredReceipts = receipts.filter(receipt => {
    const matchesSearch =
      receipt.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      receipt.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      receipt.customer_phone.includes(searchTerm);

    const matchesPayment = paymentFilter === 'all' || receipt.payment_method === paymentFilter;

    return matchesSearch && matchesPayment;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading receipts...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-600">Error: {error}</div>
        <Button onClick={fetchReceipts} className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receipts</h1>
          <p className="text-gray-600">Manage and reprint transaction receipts</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/pos/transactions')}
          >
            View Transactions
          </Button>
          <Button
            variant="outline"
            onClick={fetchReceipts}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by receipt #, customer name, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Payment Methods</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="credit">Credit</option>
          </select>
        </div>
      </div>

      {/* Receipts List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {filteredReceipts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg mb-2">
              {searchTerm || paymentFilter !== 'all' ? 'No receipts found' : 'No receipts found'}
            </div>
            <p className="text-gray-400 mb-4">
              {searchTerm || paymentFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Transactions will appear here once you start making sales'
              }
            </p>
            {!searchTerm && paymentFilter === 'all' && (
              <Button
                variant="primary"
                onClick={() => router.push('/dashboard/management/pos/checkout')}
              >
                Create First Sale
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receipt Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cashier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {receipt.transaction_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div>{receipt.customer_name}</div>
                        <div className="text-gray-500 text-xs">{receipt.customer_phone}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {receipt.transaction_date.formatted}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(receipt.status)}`}>
                        {receipt.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentMethodColor(receipt.payment_method)}`}>
                        {receipt.payment_method.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {format(receipt.final_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {receipt.created_by_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintReceipt(receipt.id)}
                      >
                        Reprint
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteReceipt(receipt.id, receipt.transaction_number)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stats Summary */}
      {filteredReceipts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredReceipts.length}</div>
            <div className="text-sm text-gray-600">Total Receipts</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {format(filteredReceipts.reduce((sum, receipt) => sum + parseFloat(receipt.final_amount), 0))}
            </div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {filteredReceipts.filter(r => r.payment_method === 'cash').length}
            </div>
            <div className="text-sm text-gray-600">Cash Payments</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {filteredReceipts.filter(r => r.payment_method === 'mobile_money').length}
            </div>
            <div className="text-sm text-gray-600">Mobile Money</div>
          </div>
        </div>
      )}
    </div>
  );
}
