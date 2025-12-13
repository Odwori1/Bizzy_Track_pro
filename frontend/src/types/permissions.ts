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

// IMPORTANT: Base URL should include /api or endpoints should include /api
// Current setup: baseURL = 'http://localhost:8002', endpoints start with '/api/...'
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

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

  // Debug log to see what URL is being constructed
  console.log('🔍 [API CALL]', {
    method: config.method?.toUpperCase(),
    url: config.url,
    fullUrl: config.baseURL + config.url
  });

  return config;
});

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('✅ [API SUCCESS]', {
      url: response.config.url,
      status: response.status,
      dataCount: Array.isArray(response.data?.data) ? response.data.data.length : 'single object'
    });
    return response;
  },
  (error) => {
    console.error('❌ [API ERROR]', {
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });
    return Promise.reject(error);
  }
);

// Permission API calls
export const permissionApi = {
  // Get all permission categories
  getCategories: async (): Promise<PermissionCategory[]> => {
    const response = await api.get('/api/permissions/categories');
    return response.data.data;
  },

  // Get permissions by category
  getPermissionsByCategory: async (category: string): Promise<Permission[]> => {
    const response = await api.get(`/api/permissions/categories/${category}/permissions`);
    return response.data.data;
  },

  // Get all permissions
  getAllPermissions: async (roleId?: string): Promise<Permission[]> => {
    const url = roleId ? `/api/permissions/all?roleId=${roleId}` : '/api/permissions/all';
    const response = await api.get(url);
    return response.data.data;
  },

  // Get business roles
  getBusinessRoles: async (): Promise<Role[]> => {
    const response = await api.get('/api/permissions/roles');
    return response.data.data;
  },

  // Get role permissions
  getRolePermissions: async (roleId: string): Promise<RolePermission[]> => {
    const response = await api.get(`/api/permissions/role/${roleId}`);
    return response.data.data;
  },

  // Update role permissions
  updateRolePermissions: async (
    roleId: string,
    permissions: string[],
    operation: 'add' | 'remove' | 'replace'
  ) => {
    const response = await api.put(`/api/permissions/role/${roleId}`, {
      permissions,
      operation
    });
    return response.data;
  },

  // Get user permissions (RBAC + ABAC) - CRITICAL FOR DYNAMIC SYSTEM
  getUserPermissions: async (userId: string): Promise<UserPermissionsResponse> => {
    const response = await api.get(`/api/permissions/user/${userId}`);
    return response.data.data;
  },

  // Add user permission override (ABAC)
  addUserPermissionOverride: async (
    userId: string,
    data: PermissionOverrideData
  ) => {
    const response = await api.post(`/api/permissions/user/${userId}`, data);
    return response.data;
  },

  // Remove user permission override (ABAC)
  removeUserPermissionOverride: async (userId: string, permissionId: string) => {
    const response = await api.delete(`/api/permissions/user/${userId}/${permissionId}`);
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

    const url = `/api/permissions/audit${params.toString() ? `?${params.toString()}` : ''}`;
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
      `/api/permissions/evaluate/user/${userId}/permission/${permissionName}`,
      { context }
    );
    return response.data;
  }
};
