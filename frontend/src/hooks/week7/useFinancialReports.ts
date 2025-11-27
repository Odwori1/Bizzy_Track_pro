import { useFinancialStore } from '@/store/week7';
import { useCallback } from 'react';

export const useFinancialReports = () => {
  const store = useFinancialStore();

  // Use useCallback to prevent infinite re-renders
  const fetchBalanceSheet = useCallback(async (filters: { start_date: string; end_date: string }) => {
    return await store.fetchBalanceSheet(filters);
  }, [store.fetchBalanceSheet]);

  const fetchProfitLoss = useCallback(async (filters: { start_date: string; end_date: string }) => {
    return await store.fetchProfitLoss(filters);
  }, [store.fetchProfitLoss]);

  const fetchCashFlow = useCallback(async (filters: { start_date: string; end_date: string }) => {
    return await store.fetchCashFlow(filters);
  }, [store.fetchCashFlow]);

  const fetchFinancialReport = useCallback(async (filters?: { start_date?: string; end_date?: string }) => {
    return await store.fetchFinancialReport(filters);
  }, [store.fetchFinancialReport]);

  // Quick Reports hooks
  const fetchMonthlySummary = useCallback(async () => {
    return await store.fetchMonthlySummary();
  }, [store.fetchMonthlySummary]);

  const fetchExpenseAnalysis = useCallback(async (filters: { start_date: string; end_date: string }) => {
    return await store.fetchExpenseAnalysis(filters);
  }, [store.fetchExpenseAnalysis]);

  const fetchRevenueReport = useCallback(async (filters: { start_date: string; end_date: string }) => {
    return await store.fetchRevenueReport(filters);
  }, [store.fetchRevenueReport]);

  // Export hooks
  const exportPDF = useCallback(async (reportType: string, filters?: { start_date?: string; end_date?: string }) => {
    return await store.exportPDF(reportType, filters);
  }, [store.exportPDF]);

  const exportExcel = useCallback(async (reportType: string, filters?: { start_date?: string; end_date?: string }) => {
    return await store.exportExcel(reportType, filters);
  }, [store.exportExcel]);

  // NEW: Date range hook
  const setDateRange = useCallback(async (startDate: string, endDate: string) => {
    return store.setDateRange(startDate, endDate);
  }, [store.setDateRange]);

  return {
    // State
    balanceSheet: store.balanceSheet,
    profitLoss: store.profitLoss,
    cashFlow: store.cashFlow,
    financialReport: store.financialReport,
    monthlySummary: store.monthlySummary,
    expenseAnalysis: store.expenseAnalysis,
    revenueReport: store.revenueReport,
    loading: store.loading,
    exportLoading: store.exportLoading,
    error: store.error,
    currentDateRange: store.currentDateRange,

    // Actions with useCallback
    fetchBalanceSheet,
    fetchProfitLoss,
    fetchCashFlow,
    fetchFinancialReport,
    fetchMonthlySummary,
    fetchExpenseAnalysis,
    fetchRevenueReport,
    exportPDF,
    exportExcel,
    setDateRange,
    clearError: store.clearError,
  };
};
