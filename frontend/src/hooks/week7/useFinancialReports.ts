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

  return {
    // State
    balanceSheet: store.balanceSheet,
    profitLoss: store.profitLoss,
    cashFlow: store.cashFlow,
    financialReport: store.financialReport,
    loading: store.loading,
    error: store.error,

    // Actions with useCallback
    fetchBalanceSheet,
    fetchProfitLoss,
    fetchCashFlow,
    fetchFinancialReport,
    clearError: store.clearError,
  };
};
