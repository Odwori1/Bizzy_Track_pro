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
}

export default function ReceiptsPage() {
  const router = useRouter();
  const { format } = useCurrency();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

    fetchReceipts();
  }, []);

  const handlePrintReceipt = (receiptId: string) => {
    // In a real implementation, this would generate a printable receipt
    window.open(`/dashboard/management/pos/receipts/${receiptId}/print`, '_blank');
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
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/management/pos/transactions')}
        >
          View Transactions
        </Button>
      </div>

      {/* Receipts List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {receipts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-500 text-lg mb-2">No receipts found</div>
            <p className="text-gray-400 mb-4">Transactions will appear here once you start making sales</p>
            <Button
              variant="primary"
              onClick={() => router.push('/dashboard/management/pos/checkout')}
            >
              Create First Sale
            </Button>
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
                {receipts.map((receipt) => (
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintReceipt(receipt.id)}
                      >
                        Reprint
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
      {receipts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{receipts.length}</div>
            <div className="text-sm text-gray-600">Total Receipts</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {format(receipts.reduce((sum, receipt) => sum + parseFloat(receipt.final_amount), 0))}
            </div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {receipts.filter(r => r.payment_method === 'cash').length}
            </div>
            <div className="text-sm text-gray-600">Cash Payments</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {receipts.filter(r => r.payment_method === 'mobile_money').length}
            </div>
            <div className="text-sm text-gray-600">Mobile Money</div>
          </div>
        </div>
      )}
    </div>
  );
}
