/**
 * COMPLETE STAFF TYPE DEFINITIONS
 * All staff-related types in one place for consistency
 */

// ==================== CORE STAFF TYPES ====================
export interface Staff {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  phone?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string;
  hourly_rate?: number | null;
  notes?: string | null;
  invitation_status?: StaffInvitationStatus | null;
  is_staff: boolean;
  business_id: string;
}

export type StaffRole = 'admin' | 'manager' | 'supervisor' | 'staff';

export type StaffInvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface StaffWithDetails extends Staff {
  created_by_name?: string;
  department_name?: string;
  job_count?: number;
  performance_rating?: number;
}

// ==================== FORM DATA TYPES ====================
export interface StaffFormData {
  email: string;
  full_name: string;
  role: StaffRole;
  phone?: string;
  department_id?: string;
  hourly_rate?: number;
  notes?: string;
  generate_password?: boolean;
  custom_password?: string;
  send_invitation?: boolean;
}

export interface StaffInvitationData {
  email: string;
  full_name: string;
  role: StaffRole;
  department_id?: string;
}

export interface StaffLoginData {
  email: string;
  password: string;
  // business_id is detected automatically by system
}

export interface StaffUpdateData {
  full_name?: string;
  phone?: string;
  role?: StaffRole;
  department_id?: string;
  hourly_rate?: number;
  notes?: string;
  is_active?: boolean;
}

// ==================== API RESPONSE TYPES ====================
export interface StaffLoginResponse {
  user: Staff;
  business: {
    id: string;
    name: string;
  };
  token: string;
}

export interface StaffListResponse {
  data: Staff[];
  count: number;
  message: string;
}

export interface StaffPerformanceMetrics {
  staff_id: string;
  total_jobs: number;
  jobs_completed: number;
  jobs_in_progress: number;
  jobs_pending: number;
  total_hours: number;
  revenue_generated: number;
  average_rating?: number;
  last_activity?: string;
  efficiency_score?: number;
}

export interface StaffDashboardData {
  total_staff: number;
  active_staff: number;
  pending_invitations: number;
  recent_activity: StaffActivity[];
  department_distribution: DepartmentStaffCount[];
  performance_overview: {
    top_performers: StaffPerformanceMetrics[];
    needs_attention: StaffPerformanceMetrics[];
  };
}

// ==================== SUPPORTING TYPES ====================
export interface StaffActivity {
  id: string;
  staff_id: string;
  staff_name: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface DepartmentStaffCount {
  department_id: string;
  department_name: string;
  staff_count: number;
}

export interface StaffRoleDefinition {
  id: string;
  name: StaffRole;
  description: string;
  permissions: string[];
  level: number; // 1=admin, 2=manager, 3=supervisor, 4=staff
}

export interface StaffPermission {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
}

// ==================== FILTER TYPES ====================
export interface StaffFilters {
  role?: StaffRole;
  department_id?: string;
  is_active?: boolean;
  invitation_status?: StaffInvitationStatus;
  search?: string;
  page?: number;
  limit?: number;
}

// ==================== STATISTICS TYPES ====================
export interface StaffStatistics {
  total: number;
  active: number;
  by_role: Record<StaffRole, number>;
  by_department: Array<{
    department_id: string;
    department_name: string;
    count: number;
  }>;
  pending_invitations: number;
  avg_performance: number;
}
