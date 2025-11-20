import { create } from 'zustand';
import { PricingRule, SeasonalPricing, PriceHistory } from '@/types/pricing';
import { usePricing } from '@/hooks/usePricing';

interface PricingState {
  // State
  pricingRules: PricingRule[];
  seasonalPricing: SeasonalPricing[];
  priceHistory: PriceHistory[];
  selectedRule: PricingRule | null;
  selectedSeasonalRule: SeasonalPricing | null;
  
  // Actions
  setPricingRules: (rules: PricingRule[]) => void;
  setSeasonalPricing: (rules: SeasonalPricing[]) => void;
  setPriceHistory: (history: PriceHistory[]) => void;
  setSelectedRule: (rule: PricingRule | null) => void;
  setSelectedSeasonalRule: (rule: SeasonalPricing | null) => void;
  
  // API actions will be integrated via hooks
}

export const usePricingStore = create<PricingState>((set) => ({
  // Initial state
  pricingRules: [],
  seasonalPricing: [],
  priceHistory: [],
  selectedRule: null,
  selectedSeasonalRule: null,
  
  // Actions
  setPricingRules: (rules) => set({ pricingRules: rules }),
  setSeasonalPricing: (rules) => set({ seasonalPricing: rules }),
  setPriceHistory: (history) => set({ priceHistory: history }),
  setSelectedRule: (rule) => set({ selectedRule: rule }),
  setSelectedSeasonalRule: (rule) => set({ selectedSeasonalRule: rule }),
}));
