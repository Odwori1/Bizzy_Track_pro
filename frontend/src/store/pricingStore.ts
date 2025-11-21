import { create } from 'zustand';
import { PricingRule, SeasonalPricing, PriceHistory, PricingEvaluation, BulkUpdatePreview } from '@/types/pricing';
import { apiClient } from '@/lib/api';

interface PricingState {
  // State
  pricingRules: PricingRule[];
  seasonalPricing: SeasonalPricing[];
  priceHistory: PriceHistory[];
  selectedPricingRule: PricingRule | null;
  selectedSeasonalPricing: SeasonalPricing | null;
  loading: boolean;
  error: string | null;

  // Actions
  actions: {
    fetchPricingRules: () => Promise<void>;
    fetchSeasonalPricing: () => Promise<void>;
    fetchPriceHistory: () => Promise<void>;
    fetchPricingRule: (id: string) => Promise<void>;
    fetchSeasonalPricingById: (id: string) => Promise<void>;
    createPricingRule: (ruleData: any) => Promise<void>;
    updatePricingRule: (id: string, ruleData: any) => Promise<void>;
    deletePricingRule: (id: string) => Promise<void>;
    createSeasonalPricing: (pricingData: any) => Promise<void>;
    updateSeasonalPricing: (id: string, pricingData: any) => Promise<void>;
    deleteSeasonalPricing: (id: string) => Promise<void>;
    evaluatePricingWithABAC: (params: any) => Promise<any>;
    bulkUpdatePreview: (params: any) => Promise<any>;
    bulkUpdateServices: (params: any) => Promise<void>;
    clearError: () => void;
  };
}

export const usePricingStore = create<PricingState>()((set, get) => ({
  // Initial state
  pricingRules: [],
  seasonalPricing: [],
  priceHistory: [],
  selectedPricingRule: null,
  selectedSeasonalPricing: null,
  loading: false,
  error: null,

  // Actions
  actions: {
    fetchPricingRules: async () => {
      set({ loading: true, error: null });
      try {
        const pricingRules = await apiClient.get<PricingRule[]>('/pricing-rules');
        set({ pricingRules, loading: false });
      } catch (error) {
        console.warn('Pricing rules endpoint not available:', error);
        set({ pricingRules: [], loading: false });
      }
    },

    fetchSeasonalPricing: async () => {
      set({ loading: true, error: null });
      try {
        const seasonalPricing = await apiClient.get<SeasonalPricing[]>('/seasonal-pricing');
        set({ seasonalPricing, loading: false });
      } catch (error) {
        console.warn('Seasonal pricing endpoint not available:', error);
        set({ seasonalPricing: [], loading: false });
      }
    },

    fetchPriceHistory: async () => {
      set({ loading: true, error: null });
      try {
        // ✅ CORRECT: Use the actual backend endpoint that exists
        const response = await apiClient.get<any>('/price-history/business');
        // Extract the data from the backend response structure
        const priceHistory = response.data || [];
        set({ priceHistory, loading: false });
      } catch (error) {
        console.warn('Price history endpoint not available:', error);
        set({ priceHistory: [], loading: false });
      }
    },

    fetchPricingRule: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const pricingRule = await apiClient.get<PricingRule>(`/pricing-rules/${id}`);
        set({ selectedPricingRule: pricingRule, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch pricing rule'
        });
      }
    },

    fetchSeasonalPricingById: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const seasonalPricing = await apiClient.get<SeasonalPricing>(`/seasonal-pricing/${id}`);
        set({ selectedSeasonalPricing: seasonalPricing, loading: false });
        return seasonalPricing;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch seasonal pricing'
        });
        throw error;
      }
    },

    createPricingRule: async (ruleData: any) => {
      set({ loading: true, error: null });
      try {
        const newRule = await apiClient.post<PricingRule>('/pricing-rules', ruleData);
        set(state => ({
          pricingRules: [...state.pricingRules, newRule],
          loading: false
        }));
        return newRule;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create pricing rule'
        });
        throw error;
      }
    },

    updatePricingRule: async (id: string, ruleData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedRule = await apiClient.put<PricingRule>(`/pricing-rules/${id}`, ruleData);
        set(state => ({
          pricingRules: state.pricingRules.map(rule => rule.id === id ? updatedRule : rule),
          selectedPricingRule: state.selectedPricingRule?.id === id ? updatedRule : state.selectedPricingRule,
          loading: false
        }));
        return updatedRule;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update pricing rule'
        });
        throw error;
      }
    },

    deletePricingRule: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/pricing-rules/${id}`);
        set(state => ({
          pricingRules: state.pricingRules.filter(rule => rule.id !== id),
          selectedPricingRule: state.selectedPricingRule?.id === id ? null : state.selectedPricingRule,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete pricing rule'
        });
        throw error;
      }
    },

    createSeasonalPricing: async (pricingData: any) => {
      set({ loading: true, error: null });
      try {
        const newPricing = await apiClient.post<SeasonalPricing>('/seasonal-pricing', pricingData);
        set(state => ({
          seasonalPricing: [...state.seasonalPricing, newPricing],
          loading: false
        }));
        return newPricing;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create seasonal pricing'
        });
        throw error;
      }
    },

    updateSeasonalPricing: async (id: string, pricingData: any) => {
      set({ loading: true, error: null });
      try {
        const updatedPricing = await apiClient.put<SeasonalPricing>(`/seasonal-pricing/${id}`, pricingData);
        set(state => ({
          seasonalPricing: state.seasonalPricing.map(sp => sp.id === id ? updatedPricing : sp),
          selectedSeasonalPricing: state.selectedSeasonalPricing?.id === id ? updatedPricing : state.selectedSeasonalPricing,
          loading: false
        }));
        return updatedPricing;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update seasonal pricing'
        });
        throw error;
      }
    },

    deleteSeasonalPricing: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/seasonal-pricing/${id}`);
        set(state => ({
          seasonalPricing: state.seasonalPricing.filter(sp => sp.id !== id),
          selectedSeasonalPricing: state.selectedSeasonalPricing?.id === id ? null : state.selectedSeasonalPricing,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete seasonal pricing'
        });
        throw error;
      }
    },

    evaluatePricingWithABAC: async (params: any) => {
      set({ loading: true, error: null });
      try {
        const result = await apiClient.post<PricingEvaluation>('/pricing-rules/evaluate-with-abac', params);
        set({ loading: false });
        return result;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to evaluate pricing'
        });
        throw error;
      }
    },

    bulkUpdatePreview: async (params: any) => {
      set({ loading: true, error: null });
      try {
        const result = await apiClient.post<BulkUpdatePreview>('/pricing-rules/bulk/preview', params);
        set({ loading: false });
        return result;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to preview bulk update'
        });
        throw error;
      }
    },

    bulkUpdateServices: async (params: any) => {
      set({ loading: true, error: null });
      try {
        await apiClient.post('/pricing-rules/bulk/update-services', params);
        set({ loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to execute bulk update'
        });
        throw error;
      }
    },

    clearError: () => {
      set({ error: null });
    },
  },
}));
