export interface Job {
  id: string;
  business_id: string;
  job_number: string;
  title: string;
  description: string | null;
  customer_id: string;
  service_id: string;
  scheduled_date: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  } | null;
  estimated_duration_minutes: number | null;
  actual_duration_minutes: number | null;
  base_price: string;
  final_price: string;
  discount_amount: string;
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string | null;
  started_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  } | null;
  completed_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  } | null;
  created_by: string;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  package_id: string | null;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  service_name: string;
  service_base_price: string;
  assigned_to_name: string | null;
}

export interface JobCreateRequest {
  title: string;
  description?: string;
  customer_id: string;
  service_id: string;
  scheduled_date?: string;
  estimated_duration_minutes?: number;
  priority: Job['priority'];
  assigned_to?: string;
}

export interface JobUpdateRequest {
  title?: string;
  description?: string;
  customer_id?: string;
  service_id?: string;
  scheduled_date?: string;
  estimated_duration_minutes?: number;
  priority?: Job['priority'];
  assigned_to?: string;
}

export interface JobFilters {
  status?: Job['status'];
  priority?: Job['priority'];
  customerId?: string;
  assigned_to?: string;
}
