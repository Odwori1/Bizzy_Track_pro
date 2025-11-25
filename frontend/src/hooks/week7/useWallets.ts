import { useWalletStore } from '@/store/week7';
import { CreateWalletData, CreateTransactionData } from '@/types/week7';

export const useWallets = () => {
  const store = useWalletStore();

  return {
    // State
    wallets: store.wallets,
    transactions: store.transactions,
    stats: store.stats,
    loading: store.loading,
    error: store.error,
    filters: store.filters,
    transactionFilters: store.transactionFilters,

    // Actions
    setFilters: store.setFilters,
    setTransactionFilters: store.setTransactionFilters,
    fetchWallets: store.fetchWallets,
    fetchTransactions: store.fetchTransactions,
    fetchStats: store.fetchStats,
    
    // CRUD Operations
    createWallet: async (data: CreateWalletData) => {
      return await store.createWallet(data);
    },
    
    createTransaction: async (data: CreateTransactionData) => {
      return await store.createTransaction(data);
    },
    
    clearError: store.clearError,

    // Derived data
    activeWallets: store.wallets.filter(wallet => wallet.is_active),
    
    totalBalance: store.wallets.reduce((total, wallet) => 
      total + wallet.current_balance, 0
    ),

    // Utility functions
    getWalletById: (id: string) => {
      return store.wallets.find(wallet => wallet.id === id);
    },

    getWalletTransactions: (walletId: string) => {
      return store.transactions.filter(transaction => transaction.wallet_id === walletId);
    },

    getTransactionsByType: (type: 'income' | 'expense') => {
      return store.transactions.filter(transaction => transaction.transaction_type === type);
    }
  };
};
