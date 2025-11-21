import { useEffect } from 'react';
import { usePricingStore } from '@/store/pricingStore';

export const usePricing = () => {
  const { pricingRules, seasonalPricing, priceHistory, loading, error } = usePricingStore();
  const { fetchPricingRules, fetchSeasonalPricing, fetchPriceHistory } = usePricingStore(state => state.actions);

  useEffect(() => {
    fetchPricingRules();
    fetchSeasonalPricing();
    fetchPriceHistory();
  }, [fetchPricingRules, fetchSeasonalPricing, fetchPriceHistory]);

  return {
    pricingRules,
    seasonalPricing,
    priceHistory,
    loading,
    error,
    refetch: () => {
      fetchPricingRules();
      fetchSeasonalPricing();
      fetchPriceHistory();
    }
  };
};

export const usePricingRule = (id?: string) => {
  const { selectedPricingRule, loading, error } = usePricingStore();
  const { fetchPricingRule } = usePricingStore(state => state.actions);

  useEffect(() => {
    if (id) {
      fetchPricingRule(id);
    }
  }, [id, fetchPricingRule]);

  return {
    pricingRule: selectedPricingRule,
    loading,
    error,
    refetch: () => id ? fetchPricingRule(id) : Promise.resolve()
  };
};

export const useSeasonalPricing = (id?: string) => {
  const { selectedSeasonalPricing, loading, error } = usePricingStore();
  const { fetchSeasonalPricingById } = usePricingStore(state => state.actions);

  useEffect(() => {
    if (id) {
      fetchSeasonalPricingById(id);
    }
  }, [id, fetchSeasonalPricingById]);

  return {
    seasonalPricing: selectedSeasonalPricing,
    loading,
    error,
    refetch: () => id ? fetchSeasonalPricingById(id) : Promise.resolve()
  };
};

export const usePricingActions = () => {
  const {
    createPricingRule,
    updatePricingRule,
    deletePricingRule,
    createSeasonalPricing,
    updateSeasonalPricing,
    deleteSeasonalPricing,
    evaluatePricingWithABAC,
    bulkUpdatePreview,
    bulkUpdateServices,
    fetchSeasonalPricingById,
    clearError
  } = usePricingStore(state => state.actions);

  return {
    // Pricing Rule Actions
    createPricingRule: async (ruleData: any) => {
      try {
        const result = await createPricingRule(ruleData);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create pricing rule'
        };
      }
    },

    updatePricingRule: async (id: string, ruleData: any) => {
      try {
        const result = await updatePricingRule(id, ruleData);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update pricing rule'
        };
      }
    },

    deletePricingRule: async (id: string) => {
      try {
        await deletePricingRule(id);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete pricing rule'
        };
      }
    },

    // Seasonal Pricing Actions
    createSeasonalPricing: async (pricingData: any) => {
      try {
        const result = await createSeasonalPricing(pricingData);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create seasonal pricing'
        };
      }
    },

    updateSeasonalPricing: async (id: string, pricingData: any) => {
      try {
        const result = await updateSeasonalPricing(id, pricingData);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update seasonal pricing'
        };
      }
    },

    deleteSeasonalPricing: async (id: string) => {
      try {
        await deleteSeasonalPricing(id);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete seasonal pricing'
        };
      }
    },

    getSeasonalPricingById: async (id: string) => {
      try {
        const result = await fetchSeasonalPricingById(id);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch seasonal pricing'
        };
      }
    },

    // Evaluation and Bulk Actions
    evaluatePricingWithABAC: async (params: any) => {
      try {
        const result = await evaluatePricingWithABAC(params);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to evaluate pricing'
        };
      }
    },

    bulkUpdatePreview: async (params: any) => {
      try {
        const result = await bulkUpdatePreview(params);
        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to preview bulk update'
        };
      }
    },

    bulkUpdateServices: async (params: any) => {
      try {
        await bulkUpdateServices(params);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to execute bulk update'
        };
      }
    },

    clearError
  };
};
