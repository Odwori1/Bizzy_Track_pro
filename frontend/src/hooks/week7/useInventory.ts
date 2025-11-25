import { useInventoryStore } from '@/store/week7';
import { CreateItemData, CreateCategoryData } from '@/types/week7';

export const useInventory = () => {
  const store = useInventoryStore();

  return {
    // State
    items: store.items,
    categories: store.categories,
    stats: store.stats,
    loading: store.loading,
    error: store.error,
    filters: store.filters,

    // Actions
    setFilters: store.setFilters,
    fetchItems: store.fetchItems,
    fetchCategories: store.fetchCategories,
    fetchStats: store.fetchStats,

    // CRUD Operations - ALL FUNCTIONS DEFINED
    createItem: store.createItem,
    createCategory: store.createCategory,
    updateCategory: store.updateCategory,
    deleteCategory: store.deleteCategory,
    updateItem: store.updateItem,

    clearError: store.clearError,

    // Derived data
    lowStockItems: store.items.filter(item => 
      item.current_stock <= item.min_stock_level && item.current_stock > 0
    ),

    outOfStockItems: store.items.filter(item => 
      item.current_stock === 0
    ),

    inStockItems: store.items.filter(item => 
      item.current_stock > item.min_stock_level
    ),

    totalInventoryValue: store.items.reduce((total, item) =>
      total + (item.cost_price * item.current_stock), 0
    ),

    // Utility functions
    getItemById: store.getItemById,

    getItemsByCategory: (categoryId: string) => {
      return store.items.filter(item => item.category_id === categoryId);
    },

    searchItems: (searchTerm: string) => {
      return store.items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
  };
};
