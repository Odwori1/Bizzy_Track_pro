import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

export interface POSTransaction {
  id: string;
  transaction_number: string;
  total_amount: string;
  payment_method: 'cash' | 'card' | 'mobile_money' | 'credit';
  status: 'completed' | 'refunded' | 'cancelled';
  created_at: string;
  items: TransactionItem[];
}

export interface TransactionItem {
  product_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
}

export const useTransactions = () => {
  const [transactions, setTransactions] = useState<POSTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching transactions...');
      
      const data = await apiClient.get<any>('/pos/transactions');
      console.log('📊 Raw transactions API response:', data);
      
      // Handle different response formats
      let transactionsData: POSTransaction[] = [];
      
      if (Array.isArray(data)) {
        transactionsData = data;
      } else if (data && Array.isArray(data.data)) {
        transactionsData = data.data;
      } else if (data && data.transactions) {
        transactionsData = data.transactions;
      }
      
      console.log('✅ Processed transactions:', transactionsData);
      setTransactions(transactionsData);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  return {
    transactions,
    loading,
    error,
    refetch: fetchTransactions
  };
};
