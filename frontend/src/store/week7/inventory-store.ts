import { create } from 'zustand';
import { apiClient } from '@/lib/api';
import {
  InventoryItem,
  InventoryCategory,
  InventoryStats,
  InventoryFilters,
  CreateItemData,
  CreateCategoryData
} from '@/types/week7';

interface InventoryState {
  // State
  items: InventoryItem[];
  categories: InventoryCategory[];
  stats: InventoryStats | null;
  loading: boolean;
  error: string | null;
  filters: InventoryFilters;

  // Actions
  setFilters: (filters: InventoryFilters) => void;
  fetchItems: (filters?: InventoryFilters) => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchStats: () => Promise<void>;
  createItem: (data: CreateItemData) => Promise<{ success: boolean; error?: string }>;
  createCategory: (data: CreateCategoryData) => Promise<{ success: boolean; error?: string }>;
  updateCategory: (id: string, data: Partial<CreateCategoryData>) => Promise<{ success: boolean; error?: string }>;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;
  updateItem: (id: string, data: Partial<CreateItemData>) => Promise<{ success: boolean; error?: string }>;
  getItemById: (id: string) => InventoryItem | undefined;
  clearError: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  // Initial state
  items: [],
  categories: [],
  stats: null,
  loading: false,
  error: null,
  filters: {},

  // Actions
  setFilters: (filters) => {
    set({ filters });
  },

  fetchItems: async (filters = {}) => {
    set({ loading: true, error: null });
    try {
      const queryParams: Record<string, string> = {};
      if (filters.category_id) queryParams.category_id = filters.category_id;
      if (filters.search) queryParams.search = filters.search;
      if (filters.low_stock) queryParams.low_stock = filters.low_stock.toString();

      const items = await apiClient.get<InventoryItem[]>('/inventory/items', queryParams);
      set({ items, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await apiClient.get<InventoryCategory[]>('/inventory/categories');
      set({ categories, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchStats: async () => {
    set({ loading: true, error: null });
    try {
      const stats = await apiClient.get<InventoryStats>('/inventory/statistics');
      set({ stats, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  createItem: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.post('/inventory/items', data);
      await get().fetchItems();
      await get().fetchStats();
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  createCategory: async (data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.post('/inventory/categories', data);
      await get().fetchCategories();
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  updateCategory: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.put(`/inventory/categories/${id}`, data);
      await get().fetchCategories();
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  deleteCategory: async (id) => {
    set({ loading: true, error: null });
    try {
      await apiClient.delete(`/inventory/categories/${id}`);
      await get().fetchCategories();
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  updateItem: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await apiClient.put(`/inventory/items/${id}`, data);
      await get().fetchItems();
      await get().fetchStats();
      set({ loading: false });
      return { success: true };
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  getItemById: (id) => {
    return get().items.find(item => item.id === id);
  },

  clearError: () => set({ error: null }),
}));
