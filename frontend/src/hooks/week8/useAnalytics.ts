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

export interface SalesPerformanceData {
  date: any;
  transaction_count: string;
  total_sales: string;
  average_sale: string;
  unique_customers: string;
}

export const useAnalytics = (startDate?: string, endDate?: string) => {
  const [performance, setPerformance] = useState<SalesPerformance | null>(null);
  const [performanceData, setPerformanceData] = useState<SalesPerformanceData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (start?: string, end?: string) => {
    try {
      setLoading(true);

      // Build query parameters for date range
      const params: Record<string, string> = {};
      if (start) params.startDate = start;
      if (end) params.endDate = end;

      const [performanceResponse, topProductsData] = await Promise.all([
        apiClient.get<SalesPerformanceData[]>('/analytics/sales/performance', params),
        apiClient.get<TopProduct[]>('/analytics/sales/top-items', params)
      ]);

      console.log('📈 Analytics data:', { performanceResponse, topProductsData });

      // Calculate aggregate performance from daily data
      const aggregatePerformance = calculateAggregatePerformance(performanceResponse);
      
      setPerformance(aggregatePerformance);
      setPerformanceData(performanceResponse);
      setTopProducts(Array.isArray(topProductsData) ? topProductsData : []);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching analytics:', err);
      setError(err.message || 'Failed to fetch analytics');
      setPerformance(null);
      setPerformanceData([]);
      setTopProducts([]);
    } finally {
      setLoading(false);
    }
  };

  // Calculate aggregate performance from daily data
  const calculateAggregatePerformance = (dailyData: SalesPerformanceData[]): SalesPerformance => {
    if (!dailyData || dailyData.length === 0) {
      return {
        total_revenue: 0,
        total_transactions: 0,
        average_order_value: 0,
        revenue_trend: 0
      };
    }

    const totalRevenue = dailyData.reduce((sum, day) => sum + parseFloat(day.total_sales), 0);
    const totalTransactions = dailyData.reduce((sum, day) => sum + parseInt(day.transaction_count), 0);
    const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Simple trend calculation (compare first and last period)
    const revenueTrend = dailyData.length > 1 ? 
      ((parseFloat(dailyData[0].total_sales) - parseFloat(dailyData[dailyData.length - 1].total_sales)) / 
       parseFloat(dailyData[dailyData.length - 1].total_sales)) * 100 : 0;

    return {
      total_revenue: totalRevenue,
      total_transactions: totalTransactions,
      average_order_value: averageOrderValue,
      revenue_trend: revenueTrend
    };
  };

  useEffect(() => {
    fetchAnalytics(startDate, endDate);
  }, [startDate, endDate]);

  return {
    performance,
    performanceData,
    topProducts,
    loading,
    error,
    refetch: (start?: string, end?: string) => fetchAnalytics(start, end)
  };
};
