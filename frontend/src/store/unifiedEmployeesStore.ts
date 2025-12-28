/**
 * UNIFIED EMPLOYEES STATE MANAGEMENT
 * Combines staff + workforce data using unified /api/employees endpoints
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { unifiedEmployeesApi } from '@/lib/api/unifiedEmployees';
import { UnifiedEmployee, ClockEvent } from '@/types/unifiedEmployees';

interface UnifiedEmployeesFilters {
  department_name?: string;
  role?: 'owner' | 'manager' | 'supervisor' | 'staff';
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

interface UnifiedEmployeesState {
  // State
  employees: UnifiedEmployee[];
  selectedEmployee: UnifiedEmployee | null;
  clockEvents: ClockEvent[];
  loading: boolean;
  error: string | null;
  filters: UnifiedEmployeesFilters;

  // Actions
  actions: {
    // Employees
    fetchEmployees: (filters?: UnifiedEmployeesFilters) => Promise<void>;
    fetchEmployeeById: (id: string) => Promise<void>;
    fetchEmployeeByEmployeeId: (employeeId: string) => Promise<void>;
    updateEmployee: (id: string, data: any) => Promise<void>;
    deleteEmployee: (id: string) => Promise<void>;

    // Time Clock
    fetchClockEvents: (employeeId?: string, limit?: number) => Promise<void>;
    clockIn: (employeeId: string, notes?: string) => Promise<void>;
    clockOut: (employeeId: string, notes?: string) => Promise<void>;
    startBreak: (employeeId: string) => Promise<void>;
    endBreak: (employeeId: string) => Promise<void>;

    // Employee Details
    fetchEmployeeWorkforceData: (id: string) => Promise<any>;
    fetchEmployeeStats: (employeeId: string) => Promise<any>;

    // Selection
    selectEmployee: (employee: UnifiedEmployee | null) => void;
    clearSelections: () => void;

    // Filters
    setFilters: (filters: UnifiedEmployeesFilters) => void;
    clearFilters: () => void;

    // Error handling
    clearError: () => void;

    // Debugging
    logDebugInfo: () => void;
  };
}

export const useUnifiedEmployeesStore = create<UnifiedEmployeesState>()(
  persist(
    (set, get) => ({
      // Initial state
      employees: [],
      selectedEmployee: null,
      clockEvents: [],
      loading: false,
      error: null,
      filters: {},

      // Actions
      actions: {
        // ==================== EMPLOYEES ====================
        fetchEmployees: async (filters = {}) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Fetching employees with filters:', filters);
            const mergedFilters = { ...get().filters, ...filters };
            const employees = await unifiedEmployeesApi.getEmployees(mergedFilters);
            
            console.log('✅ Store: Received employees:', employees.length);
            if (employees.length > 0) {
              console.log('Sample employee:', {
                id: employees[0].id,
                employee_id: employees[0].employee_id,
                full_name: employees[0].full_name
              });
            }
            
            set({
              employees,
              loading: false,
              filters: mergedFilters
            });
          } catch (error: any) {
            console.error('❌ Store: Failed to fetch employees:', error);
            set({
              error: error.message || 'Failed to fetch employees',
              loading: false
            });
            throw error;
          }
        },

        fetchEmployeeById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Fetching employee by ID:', id);
            const employee = await unifiedEmployeesApi.getEmployeeById(id);
            console.log('✅ Store: Received employee:', {
              id: employee.id,
              employee_id: employee.employee_id,
              full_name: employee.full_name
            });
            set({ selectedEmployee: employee, loading: false });
          } catch (error: any) {
            console.error('❌ Store: Failed to fetch employee details:', error);
            set({
              error: error.message || 'Failed to fetch employee details',
              loading: false
            });
            throw error;
          }
        },

        fetchEmployeeByEmployeeId: async (employeeId: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Fetching employee by employee_id:', employeeId);
            const employee = await unifiedEmployeesApi.getEmployeeByEmployeeId(employeeId);
            console.log('✅ Store: Received employee:', {
              id: employee.id,
              employee_id: employee.employee_id,
              full_name: employee.full_name
            });
            set({ selectedEmployee: employee, loading: false });
          } catch (error: any) {
            console.error('❌ Store: Failed to fetch employee details:', error);
            set({
              error: error.message || 'Failed to fetch employee details',
              loading: false
            });
            throw error;
          }
        },

        updateEmployee: async (id: string, data: any) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Updating employee:', id, data);
            const updatedEmployee = await unifiedEmployeesApi.updateEmployee(id, data);
            set(state => ({
              employees: state.employees.map(employee =>
                employee.id === id ? updatedEmployee : employee
              ),
              selectedEmployee: state.selectedEmployee?.id === id ? updatedEmployee : state.selectedEmployee,
              loading: false
            }));
            console.log('✅ Store: Employee updated successfully');
          } catch (error: any) {
            console.error('❌ Store: Failed to update employee:', error);
            set({
              error: error.message || 'Failed to update employee',
              loading: false
            });
            throw error;
          }
        },

        deleteEmployee: async (id: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Deleting employee:', id);
            await unifiedEmployeesApi.deleteEmployee(id);
            set(state => ({
              employees: state.employees.filter(employee => employee.id !== id),
              selectedEmployee: state.selectedEmployee?.id === id ? null : state.selectedEmployee,
              loading: false
            }));
            console.log('✅ Store: Employee deleted successfully');
          } catch (error: any) {
            console.error('❌ Store: Failed to delete employee:', error);
            set({
              error: error.message || 'Failed to delete employee',
              loading: false
            });
            throw error;
          }
        },

        // ==================== TIME CLOCK ====================
        fetchClockEvents: async (employeeId?: string, limit?: number) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Fetching clock events for employee:', employeeId);
            const clockEvents = await unifiedEmployeesApi.getClockEvents(employeeId, limit);
            
            console.log('✅ Store: Received clock events:', clockEvents.length);
            if (clockEvents.length > 0) {
              console.log('Sample clock event:', {
                id: clockEvents[0].id,
                employee_id: clockEvents[0].employee_id,
                event_type: clockEvents[0].event_type,
                event_time: clockEvents[0].event_time?.utc
              });
              
              // Group events by employee for debugging
              const eventsByEmployee = clockEvents.reduce((acc, event) => {
                if (event.employee_id) {
                  acc[event.employee_id] = (acc[event.employee_id] || 0) + 1;
                }
                return acc;
              }, {} as Record<string, number>);
              
              console.log('Events by employee:', eventsByEmployee);
            }
            
            set({ clockEvents, loading: false });
          } catch (error: any) {
            console.error('❌ Store: Failed to fetch clock events:', error);
            set({
              error: error.message || 'Failed to fetch clock events',
              loading: false
            });
            throw error;
          }
        },

        clockIn: async (employeeId: string, notes?: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🕐 Store: Clocking in employee:', employeeId);
            const clockEvent = await unifiedEmployeesApi.clockIn(employeeId, notes);
            console.log('✅ Store: Clock in successful:', {
              id: clockEvent.id,
              event_type: clockEvent.event_type,
              employee_id: clockEvent.employee_id
            });
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
            // Refresh employee to update last_clock_event status
            get().actions.fetchEmployeeByEmployeeId(employeeId);
          } catch (error: any) {
            console.error('❌ Store: Failed to clock in:', error);
            set({
              error: error.message || 'Failed to clock in',
              loading: false
            });
            throw error;
          }
        },

        clockOut: async (employeeId: string, notes?: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🚪 Store: Clocking out employee:', employeeId);
            const clockEvent = await unifiedEmployeesApi.clockOut(employeeId, notes);
            console.log('✅ Store: Clock out successful:', {
              id: clockEvent.id,
              event_type: clockEvent.event_type,
              employee_id: clockEvent.employee_id
            });
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
            // Refresh employee to update last_clock_event status
            get().actions.fetchEmployeeByEmployeeId(employeeId);
          } catch (error: any) {
            console.error('❌ Store: Failed to clock out:', error);
            set({
              error: error.message || 'Failed to clock out',
              loading: false
            });
            throw error;
          }
        },

        startBreak: async (employeeId: string) => {
          set({ loading: true, error: null });
          try {
            console.log('☕ Store: Starting break for employee:', employeeId);
            const clockEvent = await unifiedEmployeesApi.startBreak(employeeId);
            console.log('✅ Store: Break started successfully:', {
              id: clockEvent.id,
              event_type: clockEvent.event_type,
              employee_id: clockEvent.employee_id
            });
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
            // Refresh employee to update last_clock_event status
            get().actions.fetchEmployeeByEmployeeId(employeeId);
          } catch (error: any) {
            console.error('❌ Store: Failed to start break:', error);
            set({
              error: error.message || 'Failed to start break',
              loading: false
            });
            throw error;
          }
        },

        endBreak: async (employeeId: string) => {
          set({ loading: true, error: null });
          try {
            console.log('↩️ Store: Ending break for employee:', employeeId);
            const clockEvent = await unifiedEmployeesApi.endBreak(employeeId);
            console.log('✅ Store: Break ended successfully:', {
              id: clockEvent.id,
              event_type: clockEvent.event_type,
              employee_id: clockEvent.employee_id
            });
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
            // Refresh employee to update last_clock_event status
            get().actions.fetchEmployeeByEmployeeId(employeeId);
          } catch (error: any) {
            console.error('❌ Store: Failed to end break:', error);
            set({
              error: error.message || 'Failed to end break',
              loading: false
            });
            throw error;
          }
        },

        // ==================== EMPLOYEE DETAILS ====================
        fetchEmployeeWorkforceData: async (id: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Fetching workforce data for employee:', id);
            const workforceData = await unifiedEmployeesApi.getEmployeeWorkforceData(id);
            set({ loading: false });
            console.log('✅ Store: Received workforce data');
            return workforceData;
          } catch (error: any) {
            console.error('❌ Store: Failed to fetch workforce data:', error);
            set({
              error: error.message || 'Failed to fetch workforce data',
              loading: false
            });
            throw error;
          }
        },

        fetchEmployeeStats: async (employeeId: string) => {
          set({ loading: true, error: null });
          try {
            console.log('🔍 Store: Fetching stats for employee:', employeeId);
            const stats = await unifiedEmployeesApi.getEmployeeStats(employeeId);
            set({ loading: false });
            console.log('✅ Store: Received employee stats');
            return stats;
          } catch (error: any) {
            console.error('❌ Store: Failed to fetch employee stats:', error);
            set({
              error: error.message || 'Failed to fetch employee stats',
              loading: false
            });
            throw error;
          }
        },

        // ==================== SELECTION ====================
        selectEmployee: (employee: UnifiedEmployee | null) => {
          console.log('🎯 Store: Selecting employee:', employee?.employee_id);
          set({ selectedEmployee: employee });
        },

        clearSelections: () => {
          console.log('🎯 Store: Clearing selections');
          set({ selectedEmployee: null });
        },

        // ==================== FILTERS ====================
        setFilters: (filters: UnifiedEmployeesFilters) => {
          console.log('🎛️ Store: Setting filters:', filters);
          set(state => ({
            filters: { ...state.filters, ...filters }
          }));
          get().actions.fetchEmployees();
        },

        clearFilters: () => {
          console.log('🎛️ Store: Clearing filters');
          set({ filters: {} });
          get().actions.fetchEmployees();
        },

        // ==================== ERROR HANDLING ====================
        clearError: () => {
          console.log('⚠️ Store: Clearing error');
          set({ error: null });
        },

        // ==================== DEBUGGING ====================
        logDebugInfo: () => {
          const state = get();
          console.log('=== STORE DEBUG INFO ===');
          console.log('Employees:', state.employees.length);
          console.log('Clock Events:', state.clockEvents.length);
          console.log('Selected Employee:', state.selectedEmployee?.employee_id);
          console.log('Loading:', state.loading);
          console.log('Error:', state.error);
          
          // Show sample employee
          if (state.employees.length > 0) {
            const sample = state.employees[0];
            console.log('Sample Employee:', {
              id: sample.id,
              employee_id: sample.employee_id,
              full_name: sample.full_name
            });
          }
          
          // Show sample clock event
          if (state.clockEvents.length > 0) {
            const sample = state.clockEvents[0];
            console.log('Sample Clock Event:', {
              id: sample.id,
              employee_id: sample.employee_id,
              event_type: sample.event_type,
              event_time: sample.event_time
            });
          }
          
          console.log('=== END DEBUG ===');
        },
      }
    }),
    {
      name: 'unified-employees-storage',
      partialize: (state) => ({
        employees: state.employees,
        filters: state.filters
      }),
    }
  )
);
