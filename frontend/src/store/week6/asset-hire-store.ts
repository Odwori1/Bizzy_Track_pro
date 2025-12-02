import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import { FixedAsset } from '@/types/assets';

interface AssetHireState {
  hireableAssets: FixedAsset[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchHireableAssets: () => Promise<void>;
  markAssetAsHireable: (assetId: string, hireData: any) => Promise<void>;
  getAssetHireDetails: (assetId: string) => Promise<any>;
  clearError: () => void;
}

export const useAssetHireStore = create<AssetHireState>((set) => ({
  hireableAssets: [],
  isLoading: false,
  error: null,
  
  fetchHireableAssets: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.get<any>('/asset-hire/assets/hireable');
      set({ 
        hireableAssets: Array.isArray(response) ? response : (response?.data || []),
        isLoading: false 
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
  
  markAssetAsHireable: async (assetId: string, hireData: any) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.post(`/asset-hire/assets/${assetId}/mark-hireable`, hireData);
      set({ isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },
  
  getAssetHireDetails: async (assetId: string) => {
    try {
      const response = await apiClient.get(`/asset-hire/assets/${assetId}/hire-details`);
      return Array.isArray(response) ? response : (response?.data || {});
    } catch (error: any) {
      throw error;
    }
  },
  
  clearError: () => set({ error: null })
}));
