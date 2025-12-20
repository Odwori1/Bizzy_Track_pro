/**
 * DEPARTMENT COORDINATION TYPE DEFINITIONS
 * Based on ACTUAL API responses from Week 9.2 backend
 */

// ==================== CORE DEPARTMENT TYPES ====================
export interface Department {
  id: string;
  business_id: string;
  name: string;
  code: string;
  description: string;
  parent_department_id: string | null;
  cost_center_code: string;
  is_active: boolean;
  department_type: 'sales' | 'service' | 'admin' | 'production' | 'support';
  color_hex: string;
  sort_order: number;
  created_at: string | {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at: string | {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
}

export interface DepartmentWithMetrics extends Department {
  total_assignments?: string;
  completed_assignments?: string;
  in_progress_assignments?: string;
  avg_completion_hours?: string;
  total_revenue?: string;
  total_cost?: string;
  efficiency?: number;
  completion_rate?: number;
  profit?: number;
}

export interface DepartmentHierarchy extends Department {
  children?: DepartmentHierarchy[];
  staff_count?: number;
}

// ==================== JOB DEPARTMENT ASSIGNMENT TYPES ====================
export interface JobDepartmentAssignment {
  id: string;
  business_id: string;
  job_id: string;
  department_id: string;
  assigned_by: string;
  assigned_to: string | null;
  assignment_type: 'primary' | 'collaboration' | 'review';
  status: 'assigned' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_hours: number | null;
  actual_hours: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  notes: string;
  sla_deadline: string | null;
  created_at: string | {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at: string | {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };

  // Joined fields
  job_number?: string;
  job_title?: string;
  job_status?: string;
  department_name?: string;
  department_code?: string;
  department_color?: string;
  department_type?: string;
  assigned_by_name?: string;
  assigned_to_name?: string | null;
}

// ==================== WORKFLOW HANDOFF TYPES ====================
export interface DepartmentWorkflowHandoff {
  id: string;
  business_id: string;
  job_id: string;
  from_department_id: string;
  to_department_id: string;
  handoff_by: string;
  handoff_to: string | null;
  handoff_notes: string;
  handoff_status: 'pending' | 'accepted' | 'rejected' | 'completed';
  required_actions: Record<string, any> | null;
  handoff_at: string | {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  accepted_at: string | null;
  completed_at: string | null;
  created_at: string | {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };

  // Joined fields
  from_department_name?: string;
  to_department_name?: string;
  handoff_by_name?: string;
  handoff_to_name?: string | null;
  job_number?: string;
  job_title?: string;
}

// ==================== BILLING TYPES ====================
export interface DepartmentBillingEntry {
  id: string;
  business_id: string;
  department_id: string;
  job_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_amount: number;  // ✅ CORRECTED: This is the actual field from backend
  billing_type?: string;  // Added from backend response
  cost_amount?: number;   // Added from backend response
  is_billable?: boolean;  // Added from backend response
  tax_rate: number;
  tax_amount: number;
  billing_date: string;
  invoice_id: string | null;
  created_by: string;
  created_at: string;

  // Joined fields
  department_name?: string;
  department_code?: string;
  job_number?: string;
  job_title?: string;
  invoice_number?: string | null;
  invoice_status?: string;  // Added from backend response
  created_by_name?: string;
  customer_first_name?: string;  // Added from backend response
  customer_last_name?: string;   // Added from backend response
}

export interface ConsolidatedBill {
  id: string;
  business_id: string;
  job_id: string;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  final_amount: number;
  invoice_number: string;
  status: string;
  created_at: string;
  
  // Service price information - ADDED FOR PRICING STRATEGY
  service_price?: number;
  job_final_price?: number;
  job_number?: string;
  job_title?: string;
  job_status?: string;
  customer_first_name?: string;
  customer_last_name?: string;
  department_count?: number;
  billing_entry_count?: number;
  total_cost?: number;
  profit?: number;

  // Department breakdown
  department_breakdown: Array<{
    id?: string;  // Added from backend response
    department_id: string;
    department_name: string;
    amount: number;
    percentage: number;
    quantity?: number;  // Added from backend
    unit_price?: number;  // Added from backend
    billing_type?: string;  // Added from backend
  }>;
  
  // Invoice details from backend
  invoice?: {
    id: string;
    invoice_number: string;
    invoice_date: any;
    due_date: any;
    subtotal: string;
    tax_amount: string;
    discount_amount: string;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
    status: string;
    notes: string;
  };
}

// ==================== PERFORMANCE METRICS TYPES ====================
export interface DepartmentPerformanceMetrics {
  department_id: string;
  department_name: string;
  total_assignments: number;
  completed_assignments: number;
  in_progress_assignments: number;
  pending_assignments: number;
  avg_completion_hours: number;
  total_revenue: number;
  total_cost: number;
  efficiency: number;
  completion_rate: number;
  profit: number;
  staff_count: number;
}

export interface OverallPerformanceMetrics {
  total_departments: number;
  active_departments: number;
  total_assignments: number;
  completed_assignments: number;
  overall_efficiency: number;
  total_revenue: number;
  total_profit: number;
  avg_completion_time: number;
}

// ==================== FORM DATA TYPES ====================
export interface DepartmentFormData {
  name: string;
  code: string;
  description?: string;
  parent_department_id?: string | null;
  cost_center_code?: string;
  department_type: 'sales' | 'service' | 'admin' | 'production' | 'support';
  color_hex?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface JobAssignmentFormData {
  job_id: string;
  department_id: string;
  assigned_to?: string | null;
  assignment_type?: 'primary' | 'collaboration' | 'review';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  estimated_hours?: number;
  scheduled_start?: string;
  scheduled_end?: string;
  notes?: string;
  sla_deadline?: string;
}

export interface WorkflowHandoffFormData {
  job_id: string;
  from_department_id: string;
  to_department_id: string;
  handoff_to?: string | null;
  handoff_notes?: string;
  required_actions?: Record<string, any>;
}

export interface DepartmentBillingFormData {
  department_id: string;
  job_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  billing_type?: string;
  cost_amount?: number;
  tax_rate?: number;
  billing_date?: string;
}

// ==================== FILTER TYPES ====================
export interface DepartmentFilters {
  department_type?: string;
  is_active?: boolean;
  search?: string;
  parent_id?: string | null;
}

export interface JobAssignmentFilters {
  job_id?: string;
  department_id?: string;
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export interface WorkflowFilters {
  status?: 'pending' | 'accepted' | 'rejected' | 'completed';
  department_id?: string;
  job_id?: string;
}

// ==================== API RESPONSE TYPES ====================
export interface DepartmentListResponse {
  data: Department[];
  count: number;
  message: string;
}

export interface DepartmentHierarchyResponse {
  data: DepartmentHierarchy[];
  message: string;
}

export interface JobAssignmentListResponse {
  data: JobDepartmentAssignment[];
  count: number;
  message: string;
}

export interface WorkflowHandoffListResponse {
  data: DepartmentWorkflowHandoff[];
  count: number;
  message: string;
}

export interface DepartmentPerformanceResponse {
  data: DepartmentPerformanceMetrics[];
  overall_metrics: OverallPerformanceMetrics;
  message: string;
}

// ==================== DASHBOARD TYPES ====================
export interface CoordinationDashboardStats {
  total_departments: number;
  active_departments: number;
  total_assignments: number;
  pending_handoffs: number;
  total_revenue: number;
  department_efficiency: number;
}

export interface DepartmentStaffAssignment {
  staff_id: string;
  staff_name: string;
  role: string;
  assigned_at: string;
}

// ==================== BILLING SUMMARY TYPES ====================
export interface BillingSummary {
  total_entries: number;
  total_amount: number;
  total_cost: number;
  billable_entries: number;
  billable_amount: number;
}
