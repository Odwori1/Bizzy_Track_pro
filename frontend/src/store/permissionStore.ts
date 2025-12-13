import { create } from 'zustand';
import {
  Permission,
  PermissionCategory,
  Role,
  UserPermissionsResponse,
  PermissionAuditLog
} from '@/types/permissions';
import { permissionApi } from '@/lib/api/permissions';

interface PermissionStore {
  // State
  categories: PermissionCategory[];
  roles: Role[];
  permissions: Permission[];
  auditLogs: PermissionAuditLog[];
  userPermissions: Record<string, UserPermissionsResponse>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchCategories: () => Promise<void>;
  fetchRoles: () => Promise<void>;
  fetchPermissions: (roleId?: string) => Promise<void>;
  fetchAuditLogs: (filters?: any) => Promise<void>;
  fetchUserPermissions: (userId: string) => Promise<void>;
  updateRolePermissions: (roleId: string, permissions: string[], operation: 'add' | 'remove' | 'replace') => Promise<void>;
  addUserPermissionOverride: (userId: string, data: any) => Promise<void>;
  removeUserPermissionOverride: (userId: string, permissionId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const usePermissionStore = create<PermissionStore>((set, get) => ({
  // Initial State
  categories: [],
  roles: [],
  permissions: [],
  auditLogs: [],
  userPermissions: {},
  loading: false,
  error: null,

  // Actions
  fetchCategories: async () => {
    set({ loading: true, error: null });
    try {
      const categories = await permissionApi.getCategories();
      set({ categories, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchRoles: async () => {
    set({ loading: true, error: null });
    try {
      const roles = await permissionApi.getBusinessRoles();
      set({ roles, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchPermissions: async (roleId?: string) => {
    set({ loading: true, error: null });
    try {
      const permissions = await permissionApi.getAllPermissions(roleId);
      set({ permissions, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchAuditLogs: async (filters?: any) => {
    set({ loading: true, error: null });
    try {
      const auditLogs = await permissionApi.getPermissionAuditLog(filters);
      set({ auditLogs, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchUserPermissions: async (userId: string) => {
    console.log('🔄 fetchUserPermissions called for user:', userId);
    set({ loading: true, error: null });
    
    try {
      const userPermissionsData = await permissionApi.getUserPermissions(userId);
      
      console.log('✅ Permissions fetched successfully:', {
        userId,
        rbacCount: userPermissionsData.rbac_permissions?.length || 0,
        abacCount: userPermissionsData.abac_overrides?.length || 0,
        permissions: userPermissionsData.rbac_permissions?.map((p: any) => p.name)
      });
      
      set(state => ({
        userPermissions: {
          ...state.userPermissions,
          [userId]: userPermissionsData
        },
        loading: false
      }));
    } catch (error: any) {
      console.error('❌ Error fetching user permissions:', error);
      set({ error: error.message, loading: false });
    }
  },

  updateRolePermissions: async (roleId: string, permissions: string[], operation: 'add' | 'remove' | 'replace') => {
    set({ loading: true, error: null });
    try {
      await permissionApi.updateRolePermissions(roleId, permissions, operation);

      // Refresh data after update
      await Promise.all([
        get().fetchRoles(),
        get().fetchPermissions(),
        get().fetchAuditLogs()
      ]);

      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  addUserPermissionOverride: async (userId: string, data: any) => {
    set({ loading: true, error: null });
    try {
      await permissionApi.addUserPermissionOverride(userId, data);

      // Refresh user permissions after update
      await get().fetchUserPermissions(userId);
      await get().fetchAuditLogs();

      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  removeUserPermissionOverride: async (userId: string, permissionId: string) => {
    set({ loading: true, error: null });
    try {
      await permissionApi.removeUserPermissionOverride(userId, permissionId);

      // Refresh user permissions after removal
      await get().fetchUserPermissions(userId);
      await get().fetchAuditLogs();

      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set({
      categories: [],
      roles: [],
      permissions: [],
      auditLogs: [],
      userPermissions: {},
      loading: false,
      error: null
    });
  }
}));

// Helper selectors
export const permissionSelectors = {
  // Get role by ID
  getRoleById: (state: PermissionStore, roleId: string) =>
    state.roles.find(role => role.id === roleId),

  // Get permissions by category
  getPermissionsByCategory: (state: PermissionStore, category: string) =>
    state.permissions.filter(perm => perm.category === category),

  // Get user permissions
  getUserPermissions: (state: PermissionStore, userId: string) =>
    state.userPermissions[userId],

  // Get audit logs filtered by user
  getAuditLogsByUser: (state: PermissionStore, userId: string) =>
    state.auditLogs.filter(log => log.user_id === userId),

  // Get permission by ID
  getPermissionById: (state: PermissionStore, permissionId: string) =>
    state.permissions.find(perm => perm.id === permissionId)
};
