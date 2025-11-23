export interface JobService {
  id: string;
  job_id: string;
  service_id: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  estimated_duration_minutes: number;
  sequence_order: number;
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
  service_name?: string;
  service_description?: string;
}

export interface Job {
  id: string;
  business_id: string;
  job_number: string;
  title: string;
  description: string | null;
  customer_id: string;
  service_id: string | null; // Can be null for package jobs
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
  is_package_job: boolean;
  package_configuration: {
    deconstructed_from?: string;
    selected_services?: string[];
    total_price?: number;
    total_duration?: number;
  } | null;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  service_name: string | null;
  service_base_price: string | null;
  assigned_to_name: string | null;
  package_name: string | null;
  location: string | null;
  job_services?: JobService[]; // Only for package jobs
}

export interface JobCreateRequest {
  title: string;
  description?: string;
  customer_id: string;
  // Single service job fields
  service_id?: string;
  // Package job fields
  package_id?: string;
  is_package_job?: boolean;
  package_configuration?: {
    deconstructed_from?: string;
    selected_services?: string[];
    total_price?: number;
    total_duration?: number;
  };
  job_services?: Array<{
    service_id: string;
    quantity?: number;
    unit_price?: number;
    sequence_order?: number;
  }>;
  // Common fields
  scheduled_date?: string;
  estimated_duration_minutes?: number;
  priority: Job['priority'];
  assigned_to?: string;
  location?: string;
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
  location?: string;
}

export interface JobFilters {
  status?: Job['status'];
  priority?: Job['priority'];
  customerId?: string;
  assigned_to?: string;
  is_package_job?: boolean;
}
