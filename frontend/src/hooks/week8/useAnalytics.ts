import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { getDateFromBackendFormat } from '@/lib/date-utils';

export interface SalesPerformance {
  total_revenue: number;
  total_transactions: number;
  average_order_value: number;
  revenue_trend: number;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  item_name: string;
  quantity_sold: number;
  total_revenue: number;
  item_type: string;
}

export interface PaymentMethodData {
  payment_method: string;
  transaction_count: number;
  total_amount: number;
  percentage: number;
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
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async (start?: string, end?: string) => {
    try {
      setLoading(true);

      // Build query parameters for date range
      const params: Record<string, string> = {};
      if (start) params.startDate = start;
      if (end) params.endDate = end;

      const [performanceResponse, topProductsData, paymentMethodsData] = await Promise.all([
        apiClient.get<SalesPerformanceData[]>('/analytics/sales/performance', params),
        apiClient.get<TopProduct[]>('/analytics/sales/top-items', params),
        apiClient.get<PaymentMethodData[]>('/analytics/sales/payment-methods', params)
      ]);

      console.log('📈 Enhanced Analytics data:', { 
        performanceResponse, 
        topProductsData, 
        paymentMethodsData 
      });

      // Process performance data with proper date handling
      const processedPerformanceData = Array.isArray(performanceResponse) 
        ? performanceResponse.map(item => ({
            ...item,
            date: getDateFromBackendFormat(item.date) || item.date
          }))
        : [];

      // Process top products with proper name handling
      const processedTopProducts = Array.isArray(topProductsData) 
        ? topProductsData.map(item => ({
            ...item,
            // Use item_name if product_name is not available
            product_name: item.product_name || item.item_name || 'Unknown Product',
            quantity_sold: item.quantity_sold || 0,
            total_revenue: item.total_revenue || 0
          }))
        : [];

      // Process payment methods
      const processedPaymentMethods = Array.isArray(paymentMethodsData) 
        ? paymentMethodsData 
        : [];

      // Calculate aggregate performance from daily data
      const aggregatePerformance = calculateAggregatePerformance(processedPerformanceData);

      setPerformance(aggregatePerformance);
      setPerformanceData(processedPerformanceData);
      setTopProducts(processedTopProducts);
      setPaymentMethods(processedPaymentMethods);
      setError(null);
    } catch (err: any) {
      console.error('❌ Error fetching analytics:', err);
      setError(err.message || 'Failed to fetch analytics');
      setPerformance(null);
      setPerformanceData([]);
      setTopProducts([]);
      setPaymentMethods([]);
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

    const totalRevenue = dailyData.reduce((sum, day) => sum + parseFloat(day.total_sales || '0'), 0);
    const totalTransactions = dailyData.reduce((sum, day) => sum + parseInt(day.transaction_count || '0'), 0);
    const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Simple trend calculation (compare first and last period)
    let revenueTrend = 0;
    if (dailyData.length > 1) {
      const firstPeriodRevenue = parseFloat(dailyData[0]?.total_sales || '0');
      const lastPeriodRevenue = parseFloat(dailyData[dailyData.length - 1]?.total_sales || '0');
      
      if (lastPeriodRevenue > 0) {
        revenueTrend = ((firstPeriodRevenue - lastPeriodRevenue) / lastPeriodRevenue) * 100;
      }
    }

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
    paymentMethods,
    loading,
    error,
    refetch: (start?: string, end?: string) => fetchAnalytics(start, end)
  };
};
