export interface DateTimeObject {
  utc: string;
  local: string;
  iso_local: string;
  formatted: string;
  timestamp: number;
}

export interface ClockEvent {
  id: string;
  business_id: string;
  staff_profile_id: string;
  shift_roster_id: string | null;
  event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  event_time: DateTimeObject;
  gps_latitude: number | null;
  gps_longitude: number | null;
  location_verified: boolean;
  device_id: string | null;
  ip_address: string | null;
  notes: string | null;
  created_at: DateTimeObject;
  employee_id: string;
  user_full_name: string;
}

export interface UnifiedEmployee {
  id: string;
  email: string;
  full_name: string;
  role: 'owner' | 'manager' | 'supervisor' | 'staff';
  phone: string | null;
  is_active: boolean;
  last_login_at: DateTimeObject | null;
  employee_id: string; // EMP5019 format
  job_title: string;
  employment_type?: string;
  hire_date?: DateTimeObject;
  base_wage_rate?: string;
  wage_type?: string;
  overtime_rate?: string;
  max_hours_per_week?: number;
  department_name: string | null;
  department_code: string | null;
  status: string;
  last_clock_event: string | null;
  last_clock_time: DateTimeObject | null;
  has_workforce_profile: boolean;
  can_clock_in: boolean;
  staff_profile_id?: string;
  recent_clock_events?: ClockEvent[];
  recent_shifts?: any[];
}

export interface UnifiedEmployeeFormData {
  email: string;
  full_name: string;
  role: 'owner' | 'manager' | 'supervisor' | 'staff';
  phone?: string;
  password: string;
  department_id?: string;
  job_title?: string;
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'temporary';
  hire_date?: string;
  base_wage_rate?: number;
  wage_type?: 'hourly' | 'salary' | 'commission';
}

export interface UnifiedEmployeeUpdateData {
  full_name?: string;
  phone?: string;
  role?: 'owner' | 'manager' | 'supervisor' | 'staff';
  is_active?: boolean;
  department_id?: string;
  job_title?: string;
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'temporary';
  base_wage_rate?: number;
  wage_type?: 'hourly' | 'salary' | 'commission';
  overtime_rate?: number;
}

// For API responses
export interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  count: number;
  message: string;
}

export interface ApiSingleResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

// For filters
export interface UnifiedEmployeesFilters {
  department_name?: string;
  role?: 'owner' | 'manager' | 'supervisor' | 'staff';
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}
