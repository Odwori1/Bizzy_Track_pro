/**
 * COMPLETE STAFF API SERVICE
 * All staff-related API calls in one place
 */

import { apiClient } from '@/lib/api';
import { cleanStaffFilters, cleanStaffIdParam, safeExtractId, isValidUuid } from '@/lib/api-utils';
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
    // USE THE FIXED CLEANER SPECIFICALLY FOR STAFF IDs
    const cleanedId = cleanStaffIdParam(id);
    
    if (!cleanedId) {
      console.error('getStaffById: Invalid staff ID after cleaning:', id);
      throw new Error(`Invalid staff ID: "${id}". Please check the URL and ensure it contains a valid staff ID.`);
    }
    
    console.log('Fetching staff with ID:', { original: id, cleaned: cleanedId });
    
    try {
      const result = await apiClient.get<Staff>(`/staff/${cleanedId}`);
      console.log('getStaffById: Successfully fetched staff:', result.id);
      return result;
    } catch (error: any) {
      console.error('getStaffById: API call failed:', { 
        id: cleanedId, 
        error: error.message,
        status: error.status 
      });
      throw error;
    }
  }

  async updateStaff(id: string, data: StaffUpdateData): Promise<Staff> {
    // USE THE FIXED CLEANER
    const cleanedId = cleanStaffIdParam(id);
    
    if (!cleanedId) {
      console.error('updateStaff: Invalid staff ID:', id);
      throw new Error(`Invalid staff ID: ${id}`);
    }
    
    console.log('Updating staff with ID:', { original: id, cleaned: cleanedId });
    
    try {
      return await apiClient.put<Staff>(`/staff/${cleanedId}`, data);
    } catch (error: any) {
      console.error('updateStaff error:', { id: cleanedId, error: error.message });
      throw error;
    }
  }

  async deleteStaff(id: string): Promise<Staff> {
    // USE THE FIXED CLEANER
    const cleanedId = cleanStaffIdParam(id);
    
    if (!cleanedId) {
      console.error('deleteStaff: Invalid staff ID:', id);
      throw new Error(`Invalid staff ID: ${id}`);
    }
    
    return await apiClient.delete<Staff>(`/staff/${cleanedId}`);
  }

  // ==================== INVITATION SYSTEM ====================
  async inviteStaff(data: StaffInvitationData): Promise<any> {
    return apiClient.post('/staff/invite', data);
  }

  async resendInvitation(staffId: string): Promise<any> {
    // USE THE FIXED CLEANER
    const cleanedId = cleanStaffIdParam(staffId);
    
    if (!cleanedId) {
      console.error('resendInvitation: Invalid staff ID:', staffId);
      throw new Error(`Invalid staff ID: ${staffId}`);
    }
    
    return await apiClient.post(`/staff/${cleanedId}/resend-invitation`);
  }

  // ==================== ROLES & PERMISSIONS ====================
  async getStaffRoles(): Promise<StaffRoleDefinition[]> {
    return apiClient.get<StaffRoleDefinition[]>('/staff/roles');
  }

  async assignRole(staffId: string, roleId: string): Promise<any> {
    // USE THE FIXED CLEANER FOR STAFF ID
    const cleanedStaffId = cleanStaffIdParam(staffId);
    const cleanedRoleId = cleanStaffIdParam(roleId); // Use same function for role IDs

    if (!cleanedStaffId || !cleanedRoleId) {
      console.error('assignRole: Invalid IDs:', { staffId, roleId });
      throw new Error('Invalid staff ID or role ID');
    }

    return await apiClient.post(`/staff/${cleanedStaffId}/assign-role`, { 
      roleId: cleanedRoleId 
    });
  }

  // ==================== PERFORMANCE & ANALYTICS ====================
  async getStaffPerformance(staffId: string, filters?: any): Promise<StaffPerformanceMetrics> {
    // USE THE FIXED CLEANER
    const cleanedStaffId = cleanStaffIdParam(staffId);
    
    if (!cleanedStaffId) {
      console.error('getStaffPerformance: Invalid staff ID:', staffId);
      throw new Error(`Invalid staff ID: ${staffId}`);
    }
    
    const cleanedFilters = cleanStaffFilters(filters);

    return await apiClient.get<StaffPerformanceMetrics>(
      `/staff/${cleanedStaffId}/performance`, 
      cleanedFilters
    );
  }

  async getStaffDashboard(): Promise<StaffDashboardData> {
    return apiClient.get<StaffDashboardData>('/staff/dashboard/overview');
  }

  // ==================== DEPARTMENT ASSIGNMENTS ====================
  async assignToDepartment(staffId: string, departmentId: string): Promise<any> {
    // USE THE FIXED CLEANER
    const cleanedStaffId = cleanStaffIdParam(staffId);
    const cleanedDeptId = cleanStaffIdParam(departmentId); // Use same function

    if (!cleanedStaffId || !cleanedDeptId) {
      console.error('assignToDepartment: Invalid IDs:', { staffId, departmentId });
      throw new Error('Invalid staff ID or department ID');
    }

    return await apiClient.put(`/staff/${cleanedStaffId}`, {
      department_id: cleanedDeptId
    });
  }

  async unassignFromDepartment(staffId: string): Promise<any> {
    // USE THE FIXED CLEANER
    const cleanedStaffId = cleanStaffIdParam(staffId);
    
    if (!cleanedStaffId) {
      console.error('unassignFromDepartment: Invalid staff ID:', staffId);
      throw new Error(`Invalid staff ID: ${staffId}`);
    }

    return await apiClient.put(`/staff/${cleanedStaffId}`, {
      department_id: null
    });
  }

  async getDepartmentStaff(departmentId: string): Promise<Staff[]> {
    // USE THE FIXED CLEANER
    const cleanedDeptId = cleanStaffIdParam(departmentId);
    
    if (!cleanedDeptId) {
      console.error('getDepartmentStaff: Invalid department ID:', departmentId);
      throw new Error(`Invalid department ID: ${departmentId}`);
    }

    return await apiClient.get<Staff[]>(`/departments/${cleanedDeptId}/staff`);
  }

  // ==================== BULK OPERATIONS ====================
  async bulkUpdateStaff(updates: Array<{ id: string; data: StaffUpdateData }>): Promise<any[]> {
    // Clean each update
    const cleanedUpdates = updates
      .map(update => ({
        id: cleanStaffIdParam(update.id),
        data: update.data
      }))
      .filter(update => update.id); // Remove invalid IDs

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
