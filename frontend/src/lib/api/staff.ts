/**
 * COMPLETE STAFF API SERVICE
 * All staff-related API calls in one place
 */

import { apiClient } from '@/lib/api';
import { cleanStaffFilters, cleanUuidParam } from '@/lib/api-utils';
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
    // Use cleaned filters
    const cleanedFilters = cleanStaffFilters(filters);
    console.log('Getting staff with cleaned filters:', cleanedFilters);
    
    return apiClient.get<Staff[]>('/staff', cleanedFilters);
  }

  async getStaffById(id: string): Promise<Staff> {
    // Clean the ID to prevent "undefined" UUID errors
    const cleanedId = cleanUuidParam(id);
    if (!cleanedId) {
      throw new Error('Invalid staff ID');
    }
    
    return apiClient.get<Staff>(`/staff/${cleanedId}`);
  }

  async updateStaff(id: string, data: StaffUpdateData): Promise<Staff> {
    // Clean the ID and data
    const cleanedId = cleanUuidParam(id);
    if (!cleanedId) {
      throw new Error('Invalid staff ID');
    }
    
    return apiClient.put<Staff>(`/staff/${cleanedId}`, data);
  }

  async deleteStaff(id: string): Promise<Staff> {
    // Clean the ID
    const cleanedId = cleanUuidParam(id);
    if (!cleanedId) {
      throw new Error('Invalid staff ID');
    }
    
    return apiClient.delete<Staff>(`/staff/${cleanedId}`);
  }

  // ==================== INVITATION SYSTEM ====================
  async inviteStaff(data: StaffInvitationData): Promise<any> {
    return apiClient.post('/staff/invite', data);
  }

  async resendInvitation(staffId: string): Promise<any> {
    // Clean the ID
    const cleanedId = cleanUuidParam(staffId);
    if (!cleanedId) {
      throw new Error('Invalid staff ID');
    }
    
    return apiClient.post(`/staff/${cleanedId}/resend-invitation`);
  }

  // ==================== ROLES & PERMISSIONS ====================
  async getStaffRoles(): Promise<StaffRoleDefinition[]> {
    return apiClient.get<StaffRoleDefinition[]>('/staff/roles');
  }

  async assignRole(staffId: string, roleId: string): Promise<any> {
    // Clean both IDs
    const cleanedStaffId = cleanUuidParam(staffId);
    const cleanedRoleId = cleanUuidParam(roleId);
    
    if (!cleanedStaffId || !cleanedRoleId) {
      throw new Error('Invalid staff ID or role ID');
    }
    
    return apiClient.post(`/staff/${cleanedStaffId}/assign-role`, { roleId: cleanedRoleId });
  }

  // ==================== PERFORMANCE & ANALYTICS ====================
  async getStaffPerformance(staffId: string, filters?: any): Promise<StaffPerformanceMetrics> {
    // Clean staff ID and filters
    const cleanedStaffId = cleanUuidParam(staffId);
    if (!cleanedStaffId) {
      throw new Error('Invalid staff ID');
    }
    
    const cleanedFilters = cleanStaffFilters(filters);
    
    return apiClient.get<StaffPerformanceMetrics>(`/staff/${cleanedStaffId}/performance`, cleanedFilters);
  }

  async getStaffDashboard(): Promise<StaffDashboardData> {
    return apiClient.get<StaffDashboardData>('/staff/dashboard/overview');
  }

  // ==================== DEPARTMENT ASSIGNMENTS ====================
  async assignToDepartment(staffId: string, departmentId: string): Promise<any> {
    // Clean both IDs
    const cleanedStaffId = cleanUuidParam(staffId);
    const cleanedDeptId = cleanUuidParam(departmentId);
    
    if (!cleanedStaffId || !cleanedDeptId) {
      throw new Error('Invalid staff ID or department ID');
    }
    
    return apiClient.post(`/staff/${cleanedStaffId}/assign-department`, { 
      departmentId: cleanedDeptId 
    });
  }

  async getDepartmentStaff(departmentId: string): Promise<Staff[]> {
    // Clean department ID
    const cleanedDeptId = cleanUuidParam(departmentId);
    if (!cleanedDeptId) {
      throw new Error('Invalid department ID');
    }
    
    return apiClient.get<Staff[]>(`/departments/${cleanedDeptId}/staff`);
  }

  // ==================== BULK OPERATIONS ====================
  async bulkUpdateStaff(updates: Array<{ id: string; data: StaffUpdateData }>): Promise<any[]> {
    // Clean each update
    const cleanedUpdates = updates.map(update => ({
      id: cleanUuidParam(update.id),
      data: update.data
    })).filter(update => update.id); // Remove invalid IDs
    
    return Promise.all(cleanedUpdates.map(update => 
      this.updateStaff(update.id!, update.data)
    ));
  }

  async exportStaffList(filters?: StaffFilters): Promise<Blob> {
    const cleanedFilters = cleanStaffFilters(filters);
    const queryString = new URLSearchParams(cleanedFilters as any).toString();
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'}/api/staff/export?${queryString}`,
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
