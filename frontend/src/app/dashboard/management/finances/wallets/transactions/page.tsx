'use client';

import { useEffect, useState } from 'react';
import { useWallets } from '@/hooks/week7/useWallets';
import { Card } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Input } from '@/components/ui/Input';

export default function WalletTransactionsPage() {
  const { transactions, loading, error, fetchTransactions } = useWallets();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Apply Method 1: Client-side search pattern (EXACT PATTERN FROM REPORT)
  const filteredTransactions = transactions.filter(transaction =>
    transaction.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.wallet_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    transaction.transaction_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fix date formatting - use created_at instead of transaction_date
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Invalid Date';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Wallet Transactions</h1>
          <p className="text-gray-600">View all transactions across all wallets</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Search Input - Client-side filtering only */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 max-w-md">
          <Input
            type="text"
            placeholder="Search transactions by description, wallet, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="text-sm text-gray-500">
          {filteredTransactions.length} of {transactions.length} transactions
        </div>
      </div>

      <Card>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Wallet
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(transaction.created_at || transaction.transaction_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.wallet_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        transaction.transaction_type === 'income'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {transaction.transaction_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className={transaction.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}>
                        ${Number(transaction.amount).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {transaction.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredTransactions.length === 0 && (
            <div className="text-center py-8">
              <div className="text-gray-500">
                {searchTerm ? 'No transactions found matching your search.' : 'No transactions found'}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
