import { create } from 'zustand';
import { FixedAsset, AssetStatistics } from '@/types/assets';
import { apiClient } from '@/lib/api';

interface AssetsState {
  assets: FixedAsset[];
  statistics: AssetStatistics | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchAssets: () => Promise<void>;
  fetchAssetStatistics: () => Promise<void>;
  createAsset: (assetData: Partial<FixedAsset>) => Promise<void>;
  updateAsset: (assetId: string, assetData: Partial<FixedAsset>) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
  clearError: () => void;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],
  statistics: null,
  isLoading: false,
  error: null,

  fetchAssets: async () => {
    set({ isLoading: true, error: null });
    try {
      const assets = await apiClient.get<FixedAsset[]>('/assets');
      set({ assets, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchAssetStatistics: async () => {
    set({ isLoading: true, error: null });
    try {
      const statistics = await apiClient.get<AssetStatistics>('/assets/statistics');
      set({ statistics, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createAsset: async (assetData: Partial<FixedAsset>) => {
    set({ isLoading: true, error: null });
    try {
      const newAsset = await apiClient.post<FixedAsset>('/assets', assetData);
      set(state => ({ 
        assets: [...state.assets, newAsset],
        isLoading: false 
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  updateAsset: async (assetId: string, assetData: Partial<FixedAsset>) => {
    set({ isLoading: true, error: null });
    try {
      const updatedAsset = await apiClient.put<FixedAsset>(`/assets/${assetId}`, assetData);
      set(state => ({
        assets: state.assets.map(asset => 
          asset.id === assetId ? updatedAsset : asset
        ),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  deleteAsset: async (assetId: string) => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.delete(`/assets/${assetId}`);
      set(state => ({
        assets: state.assets.filter(asset => asset.id !== assetId),
        isLoading: false
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null })
}));
