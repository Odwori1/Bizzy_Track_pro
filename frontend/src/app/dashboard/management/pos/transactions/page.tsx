'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';
import { formatDate, formatDateShort } from '@/lib/date-utils';

interface Transaction {
  id: string;
  transaction_number: string;
  customer_name: string;
  customer_phone: string;
  final_amount: string;
  payment_method: string;
  payment_status: string;
  status: string;
  transaction_date: any;
  created_by_name: string;
  item_count: string;
  notes: string;
}

export default function TransactionsPage() {
  const { format } = useCurrency();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Transaction[]>('/pos/transactions');
      setTransactions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
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

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'cash': return 'bg-green-100 text-green-800';
      case 'card': return 'bg-blue-100 text-blue-800';
      case 'mobile_money': return 'bg-purple-100 text-purple-800';
      case 'credit': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter transactions based on search and status
  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = 
      transaction.transaction_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.customer_phone.includes(searchTerm);
    
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleDeleteTransaction = async (transactionId: string) => {
    if (confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      try {
        await apiClient.delete(`/pos/transactions/${transactionId}`);
        fetchTransactions(); // Refresh the list
      } catch (err: any) {
        alert(err.message || 'Failed to delete transaction');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading transactions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-600">Error: {error}</div>
        <Button onClick={fetchTransactions} className="ml-4">
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
          <h1 className="text-2xl font-bold text-gray-900">Transaction History</h1>
          <p className="text-gray-600">View all POS transactions</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={fetchTransactions}
          >
            Refresh
          </Button>
          <Link href="/dashboard/management/pos/checkout">
            <Button variant="primary">
              New Sale
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by transaction #, customer name, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-4">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">
              {searchTerm || statusFilter !== 'all' ? 'No transactions found' : 'No transactions yet'}
            </div>
            <p className="text-gray-400 mb-4">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Get started by creating your first sale'
              }
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <Link href="/dashboard/management/pos/checkout">
                <Button variant="primary">
                  Create First Sale
                </Button>
              </Link>
            )}
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div key={transaction.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {transaction.transaction_number}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                      {transaction.status.toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPaymentMethodColor(transaction.payment_method)}`}>
                      {transaction.payment_method.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Date:</span>
                      <span className="ml-2 text-gray-900">
                        {formatDate(transaction.transaction_date)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Customer:</span>
                      <span className="ml-2 text-gray-900">{transaction.customer_name}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Items:</span>
                      <span className="ml-2 text-gray-900">{transaction.item_count} products</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Cashier:</span>
                      <span className="ml-2 text-gray-900">{transaction.created_by_name}</span>
                    </div>
                  </div>

                  {transaction.notes && (
                    <div className="mt-2">
                      <span className="text-gray-600">Notes:</span>
                      <span className="ml-2 text-gray-900 text-sm">{transaction.notes}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-4 mt-4 lg:mt-0 lg:pl-4">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {format(transaction.final_amount)}
                    </div>
                    <div className="text-sm text-gray-500">
                      {transaction.customer_phone}
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <Link href={`/dashboard/management/pos/transactions/${transaction.id}`}>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </Link>
                    <Button 
                      variant="danger" 
                      size="sm"
                      onClick={() => handleDeleteTransaction(transaction.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Stats */}
      {filteredTransactions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredTransactions.length}</div>
            <div className="text-sm text-gray-600">Total Transactions</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {format(filteredTransactions.reduce((sum, t) => sum + parseFloat(t.final_amount), 0))}
            </div>
            <div className="text-sm text-gray-600">Total Revenue</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {filteredTransactions.filter(t => t.payment_method === 'cash').length}
            </div>
            <div className="text-sm text-gray-600">Cash Payments</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {filteredTransactions.filter(t => t.payment_method === 'mobile_money').length}
            </div>
            <div className="text-sm text-gray-600">Mobile Money</div>
          </div>
        </div>
      )}
    </div>
  );
}
