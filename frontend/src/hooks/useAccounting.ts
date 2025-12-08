import { useState, useEffect } from 'react';
import { useFinancialStore } from '@/store/week7/financial-store';

export const useAccounting = () => {
  const store = useFinancialStore();

  // State
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [journalEntries, setJournalEntries] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initial load - RUNS ONLY ONCE
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Get data directly from store
        const plData = await store.fetchAccountingProfitLoss({
          start_date: thirtyDaysAgo,
          end_date: today
        });
        
        if (isMounted) {
          setProfitLoss(plData);
        }

        const jeData = await store.fetchJournalEntries({ limit: 5 });
        
        if (isMounted) {
          setJournalEntries(jeData);
        }

      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load accounting data');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - runs once

  // Refresh function
  const refresh = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const plData = await store.fetchAccountingProfitLoss({
        start_date: thirtyDaysAgo,
        end_date: today
      });
      setProfitLoss(plData);

      const jeData = await store.fetchJournalEntries({ limit: 5 });
      setJournalEntries(jeData);
      
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh');
    } finally {
      setLoading(false);
    }
  };

  // Individual fetch functions for pages that need them
  const fetchAccountingProfitLoss = async (filters: { start_date: string; end_date: string }) => {
    return await store.fetchAccountingProfitLoss(filters);
  };

  const fetchJournalEntries = async (params?: any) => {
    return await store.fetchJournalEntries(params);
  };

  return {
    profitLoss,
    journalEntries,
    loading,
    error,
    refresh,
    fetchAccountingProfitLoss,
    fetchJournalEntries
  };
};
