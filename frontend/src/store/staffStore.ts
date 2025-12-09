/**
 * COMPLETE STAFF STATE MANAGEMENT
 * All staff-related state in one place
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { staffApi } from '@/lib/api/staff';
import {
  Staff,
  StaffFormData,
  StaffUpdateData,
  StaffFilters,
  StaffPerformanceMetrics,
  StaffDashboardData,
  StaffRoleDefinition,
  StaffStatistics
} from '@/types/staff';

interface StaffState {
  // State
  staff: Staff[];
  selectedStaff: Staff | null;
  staffRoles: StaffRoleDefinition[];
  dashboardData: StaffDashboardData | null;
  statistics: StaffStatistics | null;
  loading: boolean;
  error: string | null;
  filters: StaffFilters;

  // Actions
  actions: {
    // Staff management
    fetchStaff: (filters?: StaffFilters) => Promise<void>;
    fetchStaffById: (id: string) => Promise<void>;
    createStaff: (data: StaffFormData) => Promise<Staff>;
    updateStaff: (id: string, data: StaffUpdateData) => Promise<void>;
    deleteStaff: (id: string) => Promise<void>;
    
    // Selection
    selectStaff: (staff: Staff | null) => void;
    clearSelection: () => void;
    
    // Roles & permissions
    fetchStaffRoles: () => Promise<void>;
    
    // Dashboard & analytics
    fetchDashboardData: () => Promise<void>;
    fetchStaffPerformance: (staffId: string) => Promise<StaffPerformanceMetrics>;
    
    // Invitations
    inviteStaff: (data: { email: string; full_name: string; role: string }) => Promise<void>;
    resendInvitation: (staffId: string) => Promise<void>;
    
    // Filters
    setFilters: (filters: StaffFilters) => void;
    clearFilters: () => void;
    
    // Error handling
    clearError: () => void;
    
    // Statistics
    fetchStatistics: () => Promise<void>;
  };
}

export const useStaffStore = create<StaffState>()(
  persist(
    (set, get) => ({
      // Initial state
      staff: [],
      selectedStaff: null,
      staffRoles: [],
      dashboardData: null,
      statistics: null,
      loading: false,
      error: null,
      filters: {},

      // Actions
      actions: {
        fetchStaff: async (filters = {}) => {
          set({ loading: true, error: null });
          try {
            const mergedFilters = { ...get().filters, ...filters };
            const staff = await staffApi.getStaff(mergedFilters);
            set({ staff, loading: false, filters: mergedFilters });
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to fetch staff', 
              loading: false 
            });
            throw error;
          }
        },

        fetchStaffById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const staff = await staffApi.getStaffById(id);
            set({ selectedStaff: staff, loading: false });
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to fetch staff details', 
              loading: false 
            });
            throw error;
          }
        },

        createStaff: async (data: StaffFormData) => {
          set({ loading: true, error: null });
          try {
            const newStaff = await staffApi.createStaff(data);
            set(state => ({ 
              staff: [newStaff, ...state.staff], 
              loading: false 
            }));
            return newStaff;
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to create staff', 
              loading: false 
            });
            throw error;
          }
        },

        updateStaff: async (id: string, data: StaffUpdateData) => {
          set({ loading: true, error: null });
          try {
            const updatedStaff = await staffApi.updateStaff(id, data);
            set(state => ({
              staff: state.staff.map(staff => 
                staff.id === id ? updatedStaff : staff
              ),
              selectedStaff: state.selectedStaff?.id === id ? updatedStaff : state.selectedStaff,
              loading: false
            }));
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to update staff', 
              loading: false 
            });
            throw error;
          }
        },

        deleteStaff: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await staffApi.deleteStaff(id);
            set(state => ({
              staff: state.staff.filter(staff => staff.id !== id),
              selectedStaff: state.selectedStaff?.id === id ? null : state.selectedStaff,
              loading: false
            }));
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to delete staff', 
              loading: false 
            });
            throw error;
          }
        },

        selectStaff: (staff: Staff | null) => {
          set({ selectedStaff: staff });
        },

        clearSelection: () => {
          set({ selectedStaff: null });
        },

        fetchStaffRoles: async () => {
          set({ loading: true, error: null });
          try {
            const roles = await staffApi.getStaffRoles();
            set({ staffRoles: roles, loading: false });
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to fetch staff roles', 
              loading: false 
            });
            throw error;
          }
        },

        fetchDashboardData: async () => {
          set({ loading: true, error: null });
          try {
            const dashboardData = await staffApi.getStaffDashboard();
            set({ dashboardData, loading: false });
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to fetch dashboard data', 
              loading: false 
            });
            throw error;
          }
        },

        fetchStaffPerformance: async (staffId: string) => {
          set({ loading: true, error: null });
          try {
            const performance = await staffApi.getStaffPerformance(staffId);
            set({ loading: false });
            return performance;
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to fetch staff performance', 
              loading: false 
            });
            throw error;
          }
        },

        inviteStaff: async (data: { email: string; full_name: string; role: string }) => {
          set({ loading: true, error: null });
          try {
            await staffApi.inviteStaff(data);
            set({ loading: false });
            // Refresh staff list to show new invitation
            get().actions.fetchStaff();
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to invite staff', 
              loading: false 
            });
            throw error;
          }
        },

        resendInvitation: async (staffId: string) => {
          set({ loading: true, error: null });
          try {
            await staffApi.resendInvitation(staffId);
            set({ loading: false });
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to resend invitation', 
              loading: false 
            });
            throw error;
          }
        },

        setFilters: (filters: StaffFilters) => {
          set(state => ({ filters: { ...state.filters, ...filters } }));
          // Auto-refresh with new filters
          get().actions.fetchStaff();
        },

        clearFilters: () => {
          set({ filters: {} });
          get().actions.fetchStaff();
        },

        clearError: () => {
          set({ error: null });
        },

        fetchStatistics: async () => {
          set({ loading: true, error: null });
          try {
            // This would call a statistics endpoint when available
            // For now, calculate from existing staff data
            const staff = get().staff;
            const stats: StaffStatistics = {
              total: staff.length,
              active: staff.filter(s => s.is_active).length,
              by_role: {
                admin: staff.filter(s => s.role === 'admin').length,
                manager: staff.filter(s => s.role === 'manager').length,
                supervisor: staff.filter(s => s.role === 'supervisor').length,
                staff: staff.filter(s => s.role === 'staff').length
              },
              by_department: [],
              pending_invitations: staff.filter(s => s.invitation_status === 'pending').length,
              avg_performance: 0
            };
            set({ statistics: stats, loading: false });
          } catch (error: any) {
            set({ 
              error: error.message || 'Failed to fetch statistics', 
              loading: false 
            });
            throw error;
          }
        }
      }
    }),
    {
      name: 'staff-storage',
      partialize: (state) => ({
        staff: state.staff,
        staffRoles: state.staffRoles,
        filters: state.filters
      }),
    }
  )
);
