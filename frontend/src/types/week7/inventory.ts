export interface InventoryItem {
  id: string;
  business_id: string;
  category_id: string;
  name: string;
  description?: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  unit_of_measure: string;
  is_active: boolean;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at?: string;
  category_name?: string;
}

export interface InventoryCategory {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  color?: string;
  item_count?: number;
  created_at: string;
}

export interface InventoryStats {
  total_items: number;
  low_stock_items: number;
  out_of_stock_items: number;
  total_inventory_value: number;
  categories_count: number;
}

export interface InventoryFilters {
  category_id?: string;
  low_stock?: boolean;
  out_of_stock?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateInventoryItemData {
  name: string;
  description?: string;
  sku: string;
  category_id: string;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  unit_of_measure: string;
  is_active: boolean;
}

export interface UpdateInventoryItemData extends Partial<CreateInventoryItemData> {}
