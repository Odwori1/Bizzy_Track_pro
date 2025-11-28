import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

export interface SalesPerformance {
  total_revenue: number;
  total_transactions: number;
  average_order_value: number;
  revenue_trend: number;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  quantity_sold: number;
  total_revenue: number;
}

export const useAnalytics = () => {
  const [performance, setPerformance] = useState<SalesPerformance | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      
      const [performanceData, topProductsData] = await Promise.all([
        apiClient.get<SalesPerformance>('/analytics/sales/performance'),
        apiClient.get<TopProduct[]>('/analytics/sales/top-items')
      ]);

      console.log('📈 Analytics data:', { performanceData, topProductsData });
      
      setPerformance(performanceData);
      setTopProducts(Array.isArray(topProductsData) ? topProductsData : []);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching analytics:', err);
      setError(err.message || 'Failed to fetch analytics');
      setPerformance(null);
      setTopProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return {
    performance,
    topProducts,
    loading,
    error,
    refetch: fetchAnalytics
  };
};
