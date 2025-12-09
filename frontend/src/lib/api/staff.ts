/**
 * COMPLETE STAFF API SERVICE
 * All staff-related API calls in one place
 */

import { apiClient } from '@/lib/api';
import {
  Staff,
  StaffFormData,
  StaffInvitationData,
  StaffLoginData,
  StaffLoginResponse,
  StaffUpdateData,
  StaffFilters,
  StaffPerformanceMetrics,
  StaffDashboardData,
  StaffListResponse,
  StaffRoleDefinition,
  StaffPermission
} from '@/types/staff';

class StaffApiService {
  // ==================== STAFF AUTHENTICATION ====================
  async staffLogin(data: StaffLoginData): Promise<StaffLoginResponse> {
    return apiClient.post<StaffLoginResponse>('/staff/login', data);
  }

  // ==================== STAFF MANAGEMENT (OWNER) ====================
  async createStaff(data: StaffFormData): Promise<Staff> {
    return apiClient.post<Staff>('/staff', data);
  }

  async getStaff(filters?: StaffFilters): Promise<Staff[]> {
    return apiClient.get<Staff[]>('/staff', filters as any);
  }

  async getStaffById(id: string): Promise<Staff> {
    return apiClient.get<Staff>(`/staff/${id}`);
  }

  async updateStaff(id: string, data: StaffUpdateData): Promise<Staff> {
    return apiClient.put<Staff>(`/staff/${id}`, data);
  }

  async deleteStaff(id: string): Promise<Staff> {
    return apiClient.delete<Staff>(`/staff/${id}`);
  }

  // ==================== INVITATION SYSTEM ====================
  async inviteStaff(data: StaffInvitationData): Promise<any> {
    return apiClient.post('/staff/invite', data);
  }

  async resendInvitation(staffId: string): Promise<any> {
    return apiClient.post(`/staff/${staffId}/resend-invitation`);
  }

  // ==================== ROLES & PERMISSIONS ====================
  async getStaffRoles(): Promise<StaffRoleDefinition[]> {
    return apiClient.get<StaffRoleDefinition[]>('/staff/roles');
  }

  async assignRole(staffId: string, roleId: string): Promise<any> {
    return apiClient.post(`/staff/${staffId}/assign-role`, { roleId });
  }

  // ==================== PERFORMANCE & ANALYTICS ====================
  async getStaffPerformance(staffId: string, filters?: any): Promise<StaffPerformanceMetrics> {
    return apiClient.get<StaffPerformanceMetrics>(`/staff/${staffId}/performance`, filters);
  }

  async getStaffDashboard(): Promise<StaffDashboardData> {
    return apiClient.get<StaffDashboardData>('/staff/dashboard/overview');
  }

  // ==================== DEPARTMENT ASSIGNMENTS ====================
  async assignToDepartment(staffId: string, departmentId: string): Promise<any> {
    return apiClient.post(`/staff/${staffId}/assign-department`, { departmentId });
  }

  async getDepartmentStaff(departmentId: string): Promise<Staff[]> {
    return apiClient.get<Staff[]>(`/departments/${departmentId}/staff`);
  }

  // ==================== BULK OPERATIONS ====================
  async bulkUpdateStaff(updates: Array<{ id: string; data: StaffUpdateData }>): Promise<any[]> {
    return Promise.all(updates.map(update => this.updateStaff(update.id, update.data)));
  }

  async exportStaffList(filters?: StaffFilters): Promise<Blob> {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'}/api/staff/export?${new URLSearchParams(filters as any).toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    return response.blob();
  }
}

export const staffApi = new StaffApiService();
