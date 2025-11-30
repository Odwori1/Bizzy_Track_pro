// Universal Sellable Item Definition - Industry Standard
export type SellableItemType = 
  | 'product' 
  | 'service' 
  | 'equipment_hire' 
  | 'job_fee' 
  | 'custom_charge';

export type SourceModule = 
  | 'inventory' 
  | 'services' 
  | 'hire' 
  | 'jobs' 
  | 'custom';

export interface SellableItem {
  // Core identification
  id: string;
  type: SellableItemType;
  sourceModule: SourceModule;
  
  // Display information
  name: string;
  description?: string;
  image_url?: string;
  category?: string;
  
  // Pricing
  unitPrice: number;
  quantity: number;
  taxRate?: number;
  
  // Module-specific metadata
  metadata: {
    // Inventory module
    product_id?: string;
    sku?: string;
    stock_quantity?: number;
    
    // Services module  
    service_id?: string;
    duration_minutes?: number;
    service_category_id?: string;
    
    // Hire module
    equipment_id?: string;
    hire_duration_days?: number;
    hire_start_date?: string;
    hire_end_date?: string;
    
    // Jobs module
    job_id?: string;
    job_stage?: string;
    job_description?: string;
    
    // Custom charges
    custom_reason?: string;
    custom_category?: string;
  };
  
  // System fields
  business_id: string;
  created_at?: string;
  updated_at?: string;
}

// Cart item that extends sellable item for UI
export interface CartItem extends SellableItem {
  // UI-specific fields
  lineTotal: number;
  isAvailable?: boolean;
  validationErrors?: string[];
}

// Sale record for backend
export interface SaleRecord {
  id: string;
  business_id: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  customer_id?: string;
  payment_method: string;
  wallet_id?: string;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  items: SellableItem[];
  created_at: string;
  updated_at: string;
}
