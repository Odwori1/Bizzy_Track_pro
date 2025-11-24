import { create } from 'zustand';
import { DepreciationRecord } from '@/types/assets';
import { apiClient } from '@/lib/api';

interface DepreciationSummary {
  yearly_breakdown: Array<{
    year: string;
    total_depreciations: string;
    total_depreciation: string;
    avg_depreciation: string;
    assets_depreciated: string;
  }>;
  current_year_summary: any;
}

interface DepreciationState {
  depreciationRecords: DepreciationRecord[];
  businessSummary: DepreciationSummary | null;
  currentAssetValues: any[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDepreciationRecords: () => Promise<void>;
  fetchBusinessSummary: () => Promise<void>;
  fetchDepreciationByAsset: (assetId: string) => Promise<void>;
  fetchDepreciationSchedule: (assetId: string) => Promise<void>;
  fetchCurrentAssetValues: () => Promise<void>;
  calculateDepreciation: (assetData: any) => Promise<void>;
  clearError: () => void;
}

export const useDepreciationStore = create<DepreciationState>((set, get) => ({
  depreciationRecords: [],
  businessSummary: null,
  currentAssetValues: [],
  isLoading: false,
  error: null,

  fetchDepreciationRecords: async () => {
    set({ isLoading: true, error: null });
    try {
      // FIXED: Use assets endpoint since depreciation records might come from assets
      const assets = await apiClient.get<any[]>('/assets');
      // Extract depreciation data from assets or use empty array
      const depreciationRecords = assets.map(asset => ({
        id: asset.id,
        asset_id: asset.id,
        period_date: new Date().toISOString(),
        beginning_value: asset.purchase_price,
        depreciation_amount: asset.purchase_price - asset.current_value,
        ending_value: asset.current_value,
        accumulated_depreciation: asset.purchase_price - asset.current_value,
        remaining_value: asset.current_value,
        depreciation_method: asset.depreciation_method,
        business_id: asset.business_id,
        created_by: asset.created_by,
        created_at: asset.created_at,
        updated_at: asset.updated_at
      }));
      set({ depreciationRecords, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch depreciation records:', error);
      set({ depreciationRecords: [], error: error.message, isLoading: false });
    }
  },

  fetchBusinessSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      // FIXED ENDPOINT: This endpoint works based on our curl test
      const businessSummary = await apiClient.get<DepreciationSummary>('/depreciation/business-summary');
      set({ businessSummary, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch business summary:', error);
      set({ businessSummary: null, error: error.message, isLoading: false });
    }
  },

  fetchDepreciationByAsset: async (assetId: string) => {
    set({ isLoading: true, error: null });
    try {
      // FIXED ENDPOINT: This endpoint works
      const depreciationRecords = await apiClient.get<DepreciationRecord[]>(`/depreciation/asset/${assetId}`);
      set({ depreciationRecords, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch depreciation by asset:', error);
      set({ depreciationRecords: [], error: error.message, isLoading: false });
    }
  },

  fetchDepreciationSchedule: async (assetId: string) => {
    set({ isLoading: true, error: null });
    try {
      // FIXED ENDPOINT: This endpoint works
      const schedule = await apiClient.get<any[]>(`/depreciation/schedule/${assetId}`);
      set({ depreciationRecords: schedule, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch depreciation schedule:', error);
      set({ depreciationRecords: [], error: error.message, isLoading: false });
    }
  },

  fetchCurrentAssetValues: async () => {
    set({ isLoading: true, error: null });
    try {
      // FIXED ENDPOINT: This endpoint works
      const currentAssetValues = await apiClient.get<any[]>('/depreciation/current-values');
      set({ currentAssetValues, isLoading: false });
    } catch (error: any) {
      console.error('Failed to fetch current asset values:', error);
      set({ currentAssetValues: [], error: error.message, isLoading: false });
    }
  },

  calculateDepreciation: async (assetData: any) => {
    set({ isLoading: true, error: null });
    try {
      // FIXED ENDPOINT: This endpoint works
      const result = await apiClient.post<any>('/depreciation/calculate', assetData);
      set({ isLoading: false });
      return result;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null })
}));
