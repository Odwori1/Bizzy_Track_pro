/**
 * COMPLETE WORKFORCE MANAGEMENT TYPE DEFINITIONS
 * All workforce-related types in one place for consistency
 */

// ==================== CORE DATE/TIME TYPES ====================
export interface DateTimeObject {
  utc: string;
  local: string;
  iso_local: string;
  formatted: string;
  timestamp: number;
}

// ==================== STAFF PROFILES (Enhanced Staff) ====================
export interface StaffProfile {
  id: string;
  business_id: string;
  user_id: string;
  employee_id: string;
  job_title: string;
  department_id: string;
  employment_type: 'full_time' | 'part_time' | 'contract' | 'temporary';
  hire_date: DateTimeObject;
  termination_date: DateTimeObject | null;
  base_wage_rate: string;
  wage_type: 'hourly' | 'salary' | 'commission';
  overtime_rate: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  skills: string[];
  certifications: string[];
  max_hours_per_week: number;
  is_active: boolean;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
  department_name: string;
  department_code: string;
  user_email: string;
  user_full_name: string;
  active_shifts_count: string;
}

export interface StaffProfileFormData {
  user_id: string;
  employee_id: string;
  job_title: string;
  department_id: string;
  employment_type: 'full_time' | 'part_time' | 'contract' | 'temporary';
  hire_date: string;
  termination_date?: string | null;
  base_wage_rate: number;
  wage_type: 'hourly' | 'salary' | 'commission';
  overtime_rate?: number;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  skills?: string[];
  certifications?: string[];
  max_hours_per_week?: number;
}

export interface StaffProfileUpdateData {
  job_title?: string;
  department_id?: string;
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'temporary';
  termination_date?: string | null;
  base_wage_rate?: number;
  wage_type?: 'hourly' | 'salary' | 'commission';
  overtime_rate?: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  skills?: string[];
  certifications?: string[];
  max_hours_per_week?: number;
  is_active?: boolean;
}

// ==================== SHIFT MANAGEMENT ====================
export interface Shift {
  id: string;
  business_id: string;
  shift_template_id: string | null;
  shift_date: DateTimeObject;
  actual_start_time: string | null;
  actual_end_time: string | null;
  shift_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  staff_profile_id: string;
  assigned_by: string;
  actual_hours_worked: number | null;
  break_taken_minutes: number;
  notes: string;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
  employee_id: string;
  job_title: string;
  user_full_name: string;
  shift_template_name: string | null;
  department_name: string;
}

export interface ShiftFormData {
  shift_template_id?: string;
  shift_date: string;
  staff_profile_id: string;
  notes?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
}

export interface ShiftUpdateData {
  shift_date?: string;
  staff_profile_id?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  shift_status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  break_taken_minutes?: number;
  notes?: string;
}

export interface ShiftTemplate {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  default_start_time: string;
  default_end_time: string;
  department_id: string | null;
  required_staff_count: number;
  break_minutes: number;
  is_active: boolean;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
}

export interface ShiftTemplateFormData {
  name: string;
  description?: string;
  default_start_time: string;
  default_end_time: string;
  department_id?: string;
  required_staff_count: number;
  break_minutes?: number;
}

// ==================== TIMESHEET MANAGEMENT ====================
export interface Timesheet {
  id: string;
  business_id: string;
  timesheet_period_id: string;
  staff_profile_id: string;
  regular_hours: string;
  overtime_hours: string;
  break_hours: string;
  regular_rate: string;
  overtime_rate: string;
  total_regular_pay: string;
  total_overtime_pay: string;
  total_pay: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  approved_by: string | null;
  approved_at: DateTimeObject | null;
  notes: string;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
  user_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  period_name: string;
  period_start_date: DateTimeObject;
  period_end_date: DateTimeObject;
  pay_date: DateTimeObject;
}

export interface TimesheetFormData {
  timesheet_period_id: string;
  staff_profile_id: string;
  regular_hours: number;
  overtime_hours?: number;
  break_hours?: number;
  notes?: string;
}

export interface TimesheetUpdateData {
  regular_hours?: number;
  overtime_hours?: number;
  break_hours?: number;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  notes?: string;
}

export interface ClockEvent {
  id: string;
  business_id: string;
  staff_profile_id: string;
  event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  event_time: DateTimeObject;
  location_coordinates: string | null;
  location_address: string | null;
  device_id: string | null;
  shift_id: string | null;
  notes: string | null;
  created_at: DateTimeObject;
}

export interface ClockEventFormData {
  staff_profile_id: string;
  event_type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  location_coordinates?: string;
  location_address?: string;
  device_id?: string;
  shift_id?: string;
  notes?: string;
}

// ==================== PERFORMANCE MANAGEMENT ====================
export interface PerformanceMetric {
  id: string;
  business_id: string;
  staff_profile_id: string;
  metric_date: DateTimeObject;
  metric_type: 'efficiency' | 'quality' | 'attendance' | 'customer_satisfaction' | 'revenue';
  metric_value: number;
  target_value: number;
  weight: number;
  notes: string | null;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
  user_full_name: string;
  employee_id: string;
}

export interface PerformanceMetricFormData {
  staff_profile_id: string;
  metric_date: string;
  metric_type: 'efficiency' | 'quality' | 'attendance' | 'customer_satisfaction' | 'revenue';
  metric_value: number;
  target_value?: number;
  weight?: number;
  notes?: string;
}

// ==================== AVAILABILITY MANAGEMENT ====================
export interface StaffAvailability {
  id: string;
  business_id: string;
  staff_profile_id: string;
  availability_date: DateTimeObject;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  reason: string | null;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
  user_full_name: string;
  employee_id: string;
}

export interface AvailabilityFormData {
  staff_profile_id: string;
  availability_date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  reason?: string;
}

// ==================== PAYROLL MANAGEMENT ====================
export interface PayrollExport {
  id: string;
  business_id: string;
  payroll_period_id: string;
  export_type: 'quickbooks' | 'xero' | 'csv' | 'pdf';
  file_url: string | null;
  export_data: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: DateTimeObject;
  updated_at: DateTimeObject;
  period_name: string;
  period_start_date: DateTimeObject;
  period_end_date: DateTimeObject;
}

export interface PayrollExportFormData {
  payroll_period_id: string;
  export_type: 'quickbooks' | 'xero' | 'csv' | 'pdf';
}

// ==================== API RESPONSE TYPES ====================
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

export interface WorkforceDashboardData {
  total_staff: number;
  active_shifts: number;
  pending_timesheets: number;
  total_hours_worked: number;
  upcoming_shifts: Shift[];
  recent_clock_events: ClockEvent[];
}

export interface StaffPerformanceSummary {
  staff_profile_id: string;
  user_full_name: string;
  total_hours_worked: number;
  average_efficiency: number;
  attendance_rate: number;
  total_earnings: number;
}

// ==================== FILTER TYPES ====================
export interface StaffProfileFilters {
  department_id?: string;
  employment_type?: 'full_time' | 'part_time' | 'contract' | 'temporary';
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ShiftFilters {
  start_date: string;
  end_date: string;
  department_id?: string;
  staff_profile_id?: string;
  shift_status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  page?: number;
  limit?: number;
}

export interface TimesheetFilters {
  period_id?: string;
  staff_profile_id?: string;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface PerformanceFilters {
  staff_profile_id?: string;
  metric_type?: 'efficiency' | 'quality' | 'attendance' | 'customer_satisfaction' | 'revenue';
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

// ==================== STATISTICS TYPES ====================
export interface WorkforceStatistics {
  total_staff_profiles: number;
  active_staff_profiles: number;
  total_shifts: number;
  completed_shifts: number;
  total_timesheets: number;
  approved_timesheets: number;
  total_hours_worked: number;
  total_payroll_amount: string;
  by_department: Array<{
    department_id: string;
    department_name: string;
    staff_count: number;
    shift_count: number;
  }>;
}
