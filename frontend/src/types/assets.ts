export interface FixedAsset {
  id: string;
  business_id: string;
  asset_code: string;
  asset_name: string;
  category: 'property' | 'vehicle' | 'furniture' | 'electronics' | 'machinery' | 'equipment' | 'intangible' | 'other';
  description: string;
  purchase_date: string;
  purchase_price: number;
  supplier: string;
  invoice_reference: string;
  current_value: number;
  depreciation_method: 'straight_line' | 'reducing_balance';
  depreciation_rate: number;
  useful_life_years: number;
  salvage_value: number;
  location: string;
  condition_status: 'excellent' | 'good' | 'fair' | 'poor' | 'broken';
  serial_number: string;
  model: string;
  insurance_details: any;
  maintenance_schedule: 'none' | 'monthly' | 'quarterly' | 'biannual' | 'annual';
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  is_active: boolean;
  disposal_date: string | null;
  disposal_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface EquipmentAsset {
  id: string;
  business_id: string;
  asset_name: string;
  category: string;
  description: string;
  purchase_date: string;
  purchase_price: number;
  current_value: number;
  location: string;
  condition_status: string;
  serial_number: string;
  is_available: boolean;
  hire_rate: number;
  deposit_amount: number;
  min_hire_duration: number;
  max_hire_duration: number;
  photos: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRecord {
  id: string;
  asset_id: string;
  business_id: string;
  maintenance_type: 'routine' | 'repair' | 'inspection' | 'emergency' | 'preventive';
  maintenance_date: string;
  cost: number;
  description: string;
  technician: string;
  next_maintenance_date: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_by: string;
  created_at: string;
  updated_at: string;
  asset_name?: string;
  asset_code?: string;
}

export interface DepreciationRecord {
  id: string;
  asset_id: string;
  business_id: string;
  period_date: string;
  period_type: string;
  beginning_value: number;
  depreciation_amount: number;
  ending_value: number;
  accumulated_depreciation: number;
  remaining_value: number;
  depreciation_method: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface HireBooking {
  id: string;
  equipment_id: string;
  business_id: string;
  customer_id: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  deposit_paid: number;
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  condition_before: string;
  condition_after: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AssetStatistics {
  total_assets: number;
  active_assets: number;
  inactive_assets: number;
  total_current_value: number;
  total_purchase_value: number;
  avg_asset_value: number;
  overdue_maintenance: number;
  poor_condition_assets: number;
}
