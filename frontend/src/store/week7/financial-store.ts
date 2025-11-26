import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import {
  FinancialReport,
  ProfitLossReport,
  CashFlowReport,
  BalanceSheet,
  TitheCalculation,
  ReportFilters
} from '@/types/week7';

interface FinancialState {
  // State
  financialReport: FinancialReport | null;
  profitLoss: ProfitLossReport | null;
  cashFlow: CashFlowReport[] | null;
  balanceSheet: BalanceSheet | null;
  titheCalculation: TitheCalculation | null;
  loading: boolean;
  error: string | null;
  reportFilters: ReportFilters;

  // Actions
  setReportFilters: (filters: ReportFilters) => void;
  fetchFinancialReport: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchProfitLoss: (filters: ReportFilters) => Promise<void>;
  fetchCashFlow: (filters: ReportFilters) => Promise<void>;
  fetchBalanceSheet: (filters: ReportFilters) => Promise<void>;
  fetchTitheCalculation: (filters?: Partial<ReportFilters>) => Promise<void>;
  clearError: () => void;
}

export const useFinancialStore = create<FinancialState>((set, get) => ({
  // Initial state
  financialReport: null,
  profitLoss: null,
  cashFlow: null,
  balanceSheet: null,
  titheCalculation: null,
  loading: false,
  error: null,
  reportFilters: {
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Jan 1 current year
    end_date: new Date().toISOString().split('T')[0] // Today
  },

  // Actions - SEPARATED: setReportFilters only updates filters, doesn't fetch
  setReportFilters: (filters) => {
    set({ reportFilters: filters });
    // REMOVED: No automatic fetch calls
  },

  fetchFinancialReport: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.start_date) queryParams.start_date = filters.start_date;
      if (filters.end_date) queryParams.end_date = filters.end_date;

      const response = await apiClient.get('/financial-reports/profit-loss', queryParams);
      set({ financialReport: response.data, loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || error.message, loading: false });
    }
  },

  fetchProfitLoss: async (filters) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/financial-reports/profit-loss', {
        start_date: filters.start_date,
        end_date: filters.end_date
      });
      set({ profitLoss: response, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch profit loss data', loading: false });
    }
  },

  fetchCashFlow: async (filters) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/financial-reports/cash-flow', {
        start_date: filters.start_date,
        end_date: filters.end_date
      });
      set({ cashFlow: response, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch cash flow data', loading: false });
    }
  },

  fetchBalanceSheet: async (filters) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/financial-reports/balance-sheet', {
        start_date: filters.start_date,
        end_date: filters.end_date
      });
      set({ balanceSheet: response, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch balance sheet data', loading: false });
    }
  },

  fetchTitheCalculation: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.start_date) queryParams.start_date = filters.start_date;
      if (filters.end_date) queryParams.end_date = filters.end_date;

      const response = await apiClient.get('/financial-reports/tithe-calculation', queryParams);
      set({ titheCalculation: response.data, loading: false });
    } catch (error: any) {
      set({ error: error.response?.data?.error || error.message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
