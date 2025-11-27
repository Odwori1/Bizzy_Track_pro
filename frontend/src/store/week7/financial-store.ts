import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import { exportAsPDF, exportAsExcel } from '@/lib/export-utils';
import {
  FinancialReport,
  ProfitLossReport,
  CashFlowReport,
  BalanceSheet,
  TitheCalculation,
  ReportFilters,
  MonthlySummary,
  ExpenseAnalysis,
  RevenueReport
} from '@/types/week7';

interface FinancialState {
  // State
  financialReport: FinancialReport | null;
  profitLoss: ProfitLossReport | null;
  cashFlow: CashFlowReport[] | null;
  balanceSheet: BalanceSheet | null;
  titheCalculation: TitheCalculation | null;
  monthlySummary: MonthlySummary | null;
  expenseAnalysis: ExpenseAnalysis | null;
  revenueReport: RevenueReport | null;
  loading: boolean;
  error: string | null;
  reportFilters: ReportFilters;
  exportLoading: boolean;
  currentDateRange: { startDate: string; endDate: string };

  // Actions
  setReportFilters: (filters: ReportFilters) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  fetchFinancialReport: (filters?: Partial<ReportFilters>) => Promise<void>;
  fetchProfitLoss: (filters: ReportFilters) => Promise<void>;
  fetchCashFlow: (filters: ReportFilters) => Promise<void>;
  fetchBalanceSheet: (filters: ReportFilters) => Promise<void>;
  fetchTitheCalculation: (filters?: Partial<ReportFilters>) => Promise<void>;
  
  // Quick Reports Actions
  fetchMonthlySummary: () => Promise<void>;
  fetchExpenseAnalysis: (filters: ReportFilters) => Promise<void>;
  fetchRevenueReport: (filters: ReportFilters) => Promise<void>;
  
  // Export Actions
  exportPDF: (reportType: string, filters?: Partial<ReportFilters>) => Promise<{ success: boolean; error?: string }>;
  exportExcel: (reportType: string, filters?: Partial<ReportFilters>) => Promise<{ success: boolean; error?: string }>;
  
  clearError: () => void;
}

export const useFinancialStore = create<FinancialState>((set, get) => ({
  // Initial state
  financialReport: null,
  profitLoss: null,
  cashFlow: null,
  balanceSheet: null,
  titheCalculation: null,
  monthlySummary: null,
  expenseAnalysis: null,
  revenueReport: null,
  loading: false,
  error: null,
  exportLoading: false,
  reportFilters: {
    start_date: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  },
  currentDateRange: {
    startDate: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  },

  // Actions
  setReportFilters: (filters) => {
    set({ reportFilters: filters });
  },

  setDateRange: (startDate, endDate) => {
    set({ 
      currentDateRange: { startDate, endDate },
      reportFilters: { start_date: startDate, end_date: endDate }
    });
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

  // Quick Reports Actions
  fetchMonthlySummary: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/financial-reports/monthly-summary');
      set({ monthlySummary: response, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch monthly summary', loading: false });
    }
  },

  fetchExpenseAnalysis: async (filters) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/financial-reports/expense-analysis', {
        start_date: filters.start_date,
        end_date: filters.end_date
      });
      set({ expenseAnalysis: response, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch expense analysis', loading: false });
    }
  },

  fetchRevenueReport: async (filters) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/financial-reports/revenue-report', {
        start_date: filters.start_date,
        end_date: filters.end_date
      });
      set({ revenueReport: response, loading: false });
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch revenue report', loading: false });
    }
  },

  // Export Actions
  exportPDF: async (reportType: string, filters = {}) => {
    set({ exportLoading: true, error: null });
    try {
      const result = await exportAsPDF(reportType, filters);
      set({ exportLoading: false });
      return result;
    } catch (error: any) {
      set({ error: error.message || 'PDF export failed', exportLoading: false });
      return { success: false, error: error.message };
    }
  },

  exportExcel: async (reportType: string, filters = {}) => {
    set({ exportLoading: true, error: null });
    try {
      const result = await exportAsExcel(reportType, filters);
      set({ exportLoading: false });
      return result;
    } catch (error: any) {
      set({ error: error.message || 'Excel export failed', exportLoading: false });
      return { success: false, error: error.message };
    }
  },

  clearError: () => set({ error: null }),
}));
