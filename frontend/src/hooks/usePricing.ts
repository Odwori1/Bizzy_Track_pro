import useSWR from 'swr';
import { useApi } from './useApi';
import { PricingRule, SeasonalPricing, PriceHistory, PricingEvaluation, BulkUpdatePreview } from '@/types/pricing';

export const usePricing = () => {
  const { get, post, put, del } = useApi();

  // Pricing Rules
  const usePricingRules = () => useSWR<PricingRule[]>('/api/pricing-rules', get);
  const usePricingRule = (id: string) => useSWR<PricingRule>(id ? `/api/pricing-rules/${id}` : null, get);
  const useActivePricingRules = () => useSWR<PricingRule[]>('/api/pricing-rules/active', get);
  
  const createPricingRule = (data: Partial<PricingRule>) => post('/api/pricing-rules', data);
  const updatePricingRule = (id: string, data: Partial<PricingRule>) => put(`/api/pricing-rules/${id}`, data);
  const deletePricingRule = (id: string) => del(`/api/pricing-rules/${id}`);

  // Seasonal Pricing
  const useSeasonalPricing = () => useSWR<SeasonalPricing[]>('/api/seasonal-pricing', get);
  const useSeasonalPricingRule = (id: string) => useSWR<SeasonalPricing>(id ? `/api/seasonal-pricing/${id}` : null, get);
  
  const createSeasonalPricing = (data: Partial<SeasonalPricing>) => post('/api/seasonal-pricing', data);
  const updateSeasonalPricing = (id: string, data: Partial<SeasonalPricing>) => put(`/api/seasonal-pricing/${id}`, data);
  const deleteSeasonalPricing = (id: string) => del(`/api/seasonal-pricing/${id}`);

  // Price History
  const usePriceHistory = () => useSWR<PriceHistory[]>('/api/price-history/business', get);
  const usePriceHistoryStats = () => useSWR('/api/price-history/stats/summary', get);

  // Evaluation
  const evaluatePricing = (data: any) => post<PricingEvaluation>('/api/pricing-rules/evaluate', data);
  const evaluatePricingWithABAC = (data: any) => post<PricingEvaluation>('/api/pricing-rules/evaluate-with-abac', data);
  const evaluateSeasonalPricing = (data: any) => post('/api/seasonal-pricing/evaluate', data);

  // Bulk Operations
  const previewBulkChanges = (data: any) => post<BulkUpdatePreview>('/api/pricing-rules/bulk/preview', data);
  const bulkUpdateServices = (data: any) => post('/api/pricing-rules/bulk/update-services', data);

  // Statistics
  const usePricingStats = () => useSWR('/api/pricing-rules/stats/summary', get);
  const useSeasonalPricingStats = () => useSWR('/api/seasonal-pricing/stats/summary', get);

  return {
    // Pricing Rules
    usePricingRules,
    usePricingRule,
    useActivePricingRules,
    createPricingRule,
    updatePricingRule,
    deletePricingRule,
    
    // Seasonal Pricing
    useSeasonalPricing,
    useSeasonalPricingRule,
    createSeasonalPricing,
    updateSeasonalPricing,
    deleteSeasonalPricing,
    
    // Price History
    usePriceHistory,
    usePriceHistoryStats,
    
    // Evaluation
    evaluatePricing,
    evaluatePricingWithABAC,
    evaluateSeasonalPricing,
    
    // Bulk Operations
    previewBulkChanges,
    bulkUpdateServices,
    
    // Statistics
    usePricingStats,
    useSeasonalPricingStats,
  };
};
