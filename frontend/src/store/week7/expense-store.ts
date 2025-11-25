import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import {
  Expense,
  ExpenseCategory,
  ExpenseStats,
  ExpenseFilters,
  CreateExpenseData,
  UpdateExpenseData
} from '@/types/week7';

interface ExpenseState {
  // State
  expenses: Expense[];
  categories: ExpenseCategory[];
  stats: ExpenseStats | null;
  loading: boolean;
  error: string | null;
  filters: ExpenseFilters;

  // Actions
  setFilters: (filters: ExpenseFilters) => void;
  fetchExpenses: (filters?: ExpenseFilters) => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createExpense: (data: CreateExpenseData) => Promise<{ success: boolean; error?: string }>;
  updateExpense: (id: string, data: UpdateExpenseData) => Promise<{ success: boolean; error?: string }>;
  deleteExpense: (id: string) => Promise<{ success: boolean; error?: string }>;
  clearError: () => void;
}

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  // Initial state
  expenses: [],
  categories: [],
  stats: null,
  loading: false,
  error: null,
  filters: {},

  // Actions - SEPARATED: setFilters only updates filters, doesn't fetch
  setFilters: (filters) => {
    set({ filters });
    // REMOVED: get().fetchExpenses(filters); - This was causing infinite loop
  },

  fetchExpenses: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.category_id) queryParams.category_id = filters.category_id;
      if (filters.status) queryParams.status = filters.status;
      if (filters.start_date) queryParams.start_date = filters.start_date;
      if (filters.end_date) queryParams.end_date = filters.end_date;
      if (filters.search) queryParams.search = filters.search;
      if (filters.page) queryParams.page = filters.page.toString();
      if (filters.limit) queryParams.limit = filters.limit.toString();

      const expenses = await apiClient.get<Expense[]>('/expenses', queryParams);
      set({ expenses, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await apiClient.get<ExpenseCategory[]>('/expenses/categories');
      set({ categories, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await apiClient.get<ExpenseStats>('/expenses/statistics');
      set({ stats, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  createExpense: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.post('/expenses', data);
      await get().fetchExpenses(); // Refresh the list
      await get().fetchStats(); // Refresh statistics
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  updateExpense: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.put(`/expenses/${id}`, data);
      await get().fetchExpenses(); // Refresh the list
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  deleteExpense: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiClient.delete(`/expenses/${id}`);
      await get().fetchExpenses(); // Refresh the list
      await get().fetchStats(); // Refresh statistics
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  clearError: () => set({ error: null }),
}));
