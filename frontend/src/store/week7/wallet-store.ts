import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import {
  Wallet,
  WalletTransaction,
  WalletStats,
  WalletFilters,
  TransactionFilters,
  CreateWalletData,
  CreateTransactionData
} from '@/types/week7';

interface WalletState {
  // State
  wallets: Wallet[];
  transactions: WalletTransaction[];
  stats: WalletStats | null;
  loading: boolean;
  error: string | null;
  filters: WalletFilters;
  transactionFilters: TransactionFilters;

  // Actions
  setFilters: (filters: WalletFilters) => void;
  setTransactionFilters: (filters: TransactionFilters) => void;
  fetchWallets: (filters?: WalletFilters) => Promise<void>;
  fetchTransactions: (filters?: TransactionFilters) => Promise<void>;
  fetchStats: () => Promise<void>;
  createWallet: (data: CreateWalletData) => Promise<{ success: boolean; error?: string }>;
  createTransaction: (data: CreateTransactionData) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  // Initial state
  wallets: [],
  transactions: [],
  stats: null,
  loading: false,
  error: null,
  filters: {},
  transactionFilters: {},

  // Actions - SEPARATED: setFilters only updates filters, doesn't fetch
  setFilters: (filters) => {
    set({ filters });
    // REMOVED: get().fetchWallets(filters); - This was causing infinite loop
  },

  setTransactionFilters: (filters) => {
    set({ transactionFilters: filters });
    // REMOVED: get().fetchTransactions(filters); - This was causing infinite loop
  },

  fetchWallets: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.wallet_type) queryParams.wallet_type = filters.wallet_type;
      if (filters.is_active !== undefined) queryParams.is_active = filters.is_active.toString();

      const wallets = await apiClient.get<Wallet[]>('/wallets', queryParams);
      set({ wallets, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchTransactions: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.transaction_type) queryParams.transaction_type = filters.transaction_type;
      if (filters.start_date) queryParams.start_date = filters.start_date;
      if (filters.end_date) queryParams.end_date = filters.end_date;
      if (filters.page) queryParams.page = filters.page.toString();
      if (filters.limit) queryParams.limit = filters.limit.toString();

      const response = await apiClient.get<any>('/wallets/transactions', queryParams);
      set({ transactions: response.transactions || [], loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await apiClient.get<WalletStats>('/wallets/statistics');
      set({ stats, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  createWallet: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.post('/wallets', data);
      await get().fetchWallets(); // Refresh the list
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  createTransaction: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.post('/wallets/transactions', data);
      await get().fetchTransactions(); // Refresh the list
      await get().fetchWallets(); // Refresh wallet balances
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  clearError: () => set({ error: null }),
}));
