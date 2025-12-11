import axios from 'axios';
import {
  Permission,
  PermissionCategory,
  Role,
  RolePermission,
  UserPermissionsResponse,
  PermissionOverrideData,
  PermissionAuditLog
} from '@/types/permissions';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002/api';

// Create axios instance with auth header
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token interceptor
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Permission API calls
export const permissionApi = {
  // Get all permission categories
  getCategories: async (): Promise<PermissionCategory[]> => {
    const response = await api.get('/permissions/categories');
    return response.data.data;
  },

  // Get permissions by category
  getPermissionsByCategory: async (category: string): Promise<Permission[]> => {
    const response = await api.get(`/permissions/categories/${category}/permissions`);
    return response.data.data;
  },

  // Get all permissions
  getAllPermissions: async (roleId?: string): Promise<Permission[]> => {
    const url = roleId ? `/permissions/all?roleId=${roleId}` : '/permissions/all';
    const response = await api.get(url);
    return response.data.data;
  },

  // Get business roles
  getBusinessRoles: async (): Promise<Role[]> => {
    const response = await api.get('/permissions/roles');
    return response.data.data;
  },

  // Get role permissions
  getRolePermissions: async (roleId: string): Promise<RolePermission[]> => {
    const response = await api.get(`/permissions/role/${roleId}`);
    return response.data.data;
  },

  // Update role permissions
  updateRolePermissions: async (
    roleId: string, 
    permissions: string[], 
    operation: 'add' | 'remove' | 'replace'
  ) => {
    const response = await api.put(`/permissions/role/${roleId}`, {
      permissions,
      operation
    });
    return response.data;
  },

  // Get user permissions (RBAC + ABAC)
  getUserPermissions: async (userId: string): Promise<UserPermissionsResponse> => {
    const response = await api.get(`/permissions/user/${userId}`);
    return response.data.data;
  },

  // Add user permission override (ABAC)
  addUserPermissionOverride: async (
    userId: string, 
    data: PermissionOverrideData
  ) => {
    const response = await api.post(`/permissions/user/${userId}`, data);
    return response.data;
  },

  // Remove user permission override (ABAC)
  removeUserPermissionOverride: async (userId: string, permissionId: string) => {
    const response = await api.delete(`/permissions/user/${userId}/${permissionId}`);
    return response.data;
  },

  // Get permission audit log
  getPermissionAuditLog: async (filters?: {
    user_id?: string;
    action?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<PermissionAuditLog[]> => {
    const params = new URLSearchParams();
    if (filters?.user_id) params.append('user_id', filters.user_id);
    if (filters?.action) params.append('action', filters.action);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    
    const url = `/permissions/audit${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await api.get(url);
    return response.data.data;
  },

  // Evaluate permission
  evaluatePermission: async (
    userId: string, 
    permissionName: string, 
    context?: any
  ) => {
    const response = await api.post(
      `/permissions/evaluate/user/${userId}/permission/${permissionName}`,
      { context }
    );
    return response.data;
  }
};
