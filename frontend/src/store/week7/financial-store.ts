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
  profitLossReport: ProfitLossReport | null;
  cashFlowReport: CashFlowReport[] | null;
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
  profitLossReport: null,
  cashFlowReport: null,
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

      const financialReport = await apiClient.get<FinancialReport>('/financial-reports/financial-report', queryParams);
      set({ financialReport, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchProfitLoss: async (filters) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {
        start_date: filters.start_date,
        end_date: filters.end_date
      };

      const profitLossReport = await apiClient.get<ProfitLossReport>('/financial-reports/profit-loss', queryParams);
      set({ profitLossReport, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchCashFlow: async (filters) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {
        start_date: filters.start_date,
        end_date: filters.end_date
      };

      const cashFlowReport = await apiClient.get<CashFlowReport[]>('/financial-reports/cash-flow', queryParams);
      set({ cashFlowReport, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchBalanceSheet: async (filters) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {
        start_date: filters.start_date,
        end_date: filters.end_date
      };

      const balanceSheet = await apiClient.get<BalanceSheet>('/financial-reports/balance-sheet', queryParams);
      set({ balanceSheet, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchTitheCalculation: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.start_date) queryParams.start_date = filters.start_date;
      if (filters.end_date) queryParams.end_date = filters.end_date;

      const titheCalculation = await apiClient.get<TitheCalculation>('/financial-reports/tithe-calculation', queryParams);
      set({ titheCalculation, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
