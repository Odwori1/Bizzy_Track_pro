import { useState, useEffect, useCallback } from 'react';

interface UseDataFetchingOptions<T> {
  fetchFn: () => Promise<T>;
  autoFetch?: boolean;
  dependencies?: any[];
}

export function useDataFetching<T>({
  fetchFn,
  autoFetch = true,
  dependencies = []
}: UseDataFetchingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  const refetch = useCallback(() => {
    return fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData, ...dependencies]);

  return {
    data,
    loading,
    error,
    refetch,
    setData
  };
}

// Specialized hooks for common patterns
export function usePaginatedFetching<T>(fetchFn: (page: number, limit: number) => Promise<T>) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  
  const { data, loading, error, refetch } = useDataFetching({
    fetchFn: () => fetchFn(page, limit),
    dependencies: [page, limit]
  });

  return {
    data,
    loading,
    error,
    refetch,
    page,
    setPage,
    limit,
    setLimit
  };
}

export function useFilteredFetching<T, F>(fetchFn: (filters: F) => Promise<T>) {
  const [filters, setFilters] = useState<F>({} as F);
  
  const { data, loading, error, refetch } = useDataFetching({
    fetchFn: () => fetchFn(filters),
    dependencies: [filters]
  });

  return {
    data,
    loading,
    error,
    refetch,
    filters,
    setFilters
  };
}
