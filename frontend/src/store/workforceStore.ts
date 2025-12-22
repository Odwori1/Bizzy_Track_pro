/**
 * COMPLETE WORKFORCE STATE MANAGEMENT
 * All workforce-related state in one place
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { workforceApi } from '@/lib/api/workforce';
import {
  StaffProfile,
  StaffProfileFormData,
  StaffProfileUpdateData,
  StaffProfileFilters,
  Shift,
  ShiftFormData,
  ShiftUpdateData,
  ShiftFilters,
  ShiftTemplate,
  ShiftTemplateFormData,
  Timesheet,
  TimesheetFormData,
  TimesheetUpdateData,
  TimesheetFilters,
  ClockEvent,
  ClockEventFormData,
  PerformanceMetric,
  PerformanceMetricFormData,
  PerformanceFilters,
  StaffAvailability,
  AvailabilityFormData,
  PayrollExport,
  PayrollExportFormData,
  WorkforceDashboardData,
  WorkforceStatistics
} from '@/types/workforce';

interface WorkforceState {
  // State
  staffProfiles: StaffProfile[];
  selectedStaffProfile: StaffProfile | null;
  shifts: Shift[];
  selectedShift: Shift | null;
  shiftTemplates: ShiftTemplate[];
  timesheets: Timesheet[];
  selectedTimesheet: Timesheet | null;
  clockEvents: ClockEvent[];
  performanceMetrics: PerformanceMetric[];
  availabilityRecords: StaffAvailability[];
  payrollExports: PayrollExport[];
  dashboardData: WorkforceDashboardData | null;
  statistics: WorkforceStatistics | null;
  loading: boolean;
  error: string | null;
  staffProfileFilters: StaffProfileFilters;
  shiftFilters: ShiftFilters;
  timesheetFilters: TimesheetFilters;

  // Actions
  actions: {
    // Staff Profiles
    fetchStaffProfiles: (filters?: StaffProfileFilters) => Promise<void>;
    fetchStaffProfileById: (id: string) => Promise<void>;
    createStaffProfile: (data: StaffProfileFormData) => Promise<StaffProfile>;
    updateStaffProfile: (id: string, data: StaffProfileUpdateData) => Promise<void>;
    deleteStaffProfile: (id: string) => Promise<void>;

    // Shifts
    fetchShifts: (filters: ShiftFilters) => Promise<void>;
    fetchShiftById: (id: string) => Promise<void>;
    createShift: (data: ShiftFormData) => Promise<void>;
    updateShift: (id: string, data: ShiftUpdateData) => Promise<void>;
    deleteShift: (id: string) => Promise<void>;

    // Shift Templates
    fetchShiftTemplates: () => Promise<void>;
    createShiftTemplate: (data: ShiftTemplateFormData) => Promise<void>;
    updateShiftTemplate: (id: string, data: Partial<ShiftTemplateFormData>) => Promise<void>;
    deleteShiftTemplate: (id: string) => Promise<void>;

    // Timesheets
    fetchTimesheets: (filters?: TimesheetFilters) => Promise<void>;
    fetchTimesheetById: (id: string) => Promise<void>;
    createTimesheet: (data: TimesheetFormData) => Promise<void>;
    updateTimesheet: (id: string, data: TimesheetUpdateData) => Promise<void>;
    submitTimesheet: (id: string) => Promise<void>;
    approveTimesheet: (id: string) => Promise<void>;
    rejectTimesheet: (id: string, reason?: string) => Promise<void>;

    // Time Clock
    fetchClockEvents: (staffProfileId?: string, limit?: number) => Promise<void>;
    clockIn: (staffProfileId: string, location?: string) => Promise<void>;
    clockOut: (staffProfileId: string, location?: string) => Promise<void>;
    startBreak: (staffProfileId: string) => Promise<void>;
    endBreak: (staffProfileId: string) => Promise<void>;

    // Performance
    fetchPerformanceMetrics: (filters?: PerformanceFilters) => Promise<void>;
    createPerformanceMetric: (data: PerformanceMetricFormData) => Promise<void>;
    fetchStaffPerformance: (staffProfileId: string) => Promise<void>;

    // Availability
    fetchAvailabilityRecords: (staffProfileId?: string, startDate?: string, endDate?: string) => Promise<void>;
    createAvailability: (data: AvailabilityFormData) => Promise<void>;
    updateAvailability: (id: string, data: Partial<AvailabilityFormData>) => Promise<void>;
    deleteAvailability: (id: string) => Promise<void>;

    // Payroll
    fetchPayrollExports: () => Promise<void>;
    createPayrollExport: (data: PayrollExportFormData) => Promise<void>;

    // Dashboard & Analytics
    fetchDashboardData: () => Promise<void>;
    fetchStatistics: () => Promise<void>;

    // Selection
    selectStaffProfile: (profile: StaffProfile | null) => void;
    selectShift: (shift: Shift | null) => void;
    selectTimesheet: (timesheet: Timesheet | null) => void;
    clearSelections: () => void;

    // Filters
    setStaffProfileFilters: (filters: StaffProfileFilters) => void;
    setShiftFilters: (filters: ShiftFilters) => void;
    setTimesheetFilters: (filters: TimesheetFilters) => void;
    clearFilters: () => void;

    // Error handling
    clearError: () => void;

    // Bulk operations
    bulkCreateShifts: (shifts: ShiftFormData[]) => Promise<void>;
    bulkUpdateTimesheets: (updates: Array<{ id: string; data: TimesheetUpdateData }>) => Promise<void>;
  };
}

export const useWorkforceStore = create<WorkforceState>()(
  persist(
    (set, get) => ({
      // Initial state
      staffProfiles: [],
      selectedStaffProfile: null,
      shifts: [],
      selectedShift: null,
      shiftTemplates: [],
      timesheets: [],
      selectedTimesheet: null,
      clockEvents: [],
      performanceMetrics: [],
      availabilityRecords: [],
      payrollExports: [],
      dashboardData: null,
      statistics: null,
      loading: false,
      error: null,
      staffProfileFilters: {},
      shiftFilters: { start_date: '', end_date: '' },
      timesheetFilters: {},

      // Actions
      actions: {
        // ==================== STAFF PROFILES ====================
        fetchStaffProfiles: async (filters = {}) => {
          set({ loading: true, error: null });
          try {
            const mergedFilters = { ...get().staffProfileFilters, ...filters };
            const staffProfiles = await workforceApi.getStaffProfiles(mergedFilters);
            set({ 
              staffProfiles, 
              loading: false, 
              staffProfileFilters: mergedFilters 
            });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch staff profiles',
              loading: false
            });
            throw error;
          }
        },

        fetchStaffProfileById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const staffProfile = await workforceApi.getStaffProfileById(id);
            set({ selectedStaffProfile: staffProfile, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch staff profile details',
              loading: false
            });
            throw error;
          }
        },

        createStaffProfile: async (data: StaffProfileFormData) => {
          set({ loading: true, error: null });
          try {
            const newStaffProfile = await workforceApi.createStaffProfile(data);
            set(state => ({
              staffProfiles: [newStaffProfile, ...state.staffProfiles],
              loading: false
            }));
            return newStaffProfile;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create staff profile',
              loading: false
            });
            throw error;
          }
        },

        updateStaffProfile: async (id: string, data: StaffProfileUpdateData) => {
          set({ loading: true, error: null });
          try {
            const updatedProfile = await workforceApi.updateStaffProfile(id, data);
            set(state => ({
              staffProfiles: state.staffProfiles.map(profile =>
                profile.id === id ? updatedProfile : profile
              ),
              selectedStaffProfile: state.selectedStaffProfile?.id === id ? updatedProfile : state.selectedStaffProfile,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update staff profile',
              loading: false
            });
            throw error;
          }
        },

        deleteStaffProfile: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await workforceApi.deleteStaffProfile(id);
            set(state => ({
              staffProfiles: state.staffProfiles.filter(profile => profile.id !== id),
              selectedStaffProfile: state.selectedStaffProfile?.id === id ? null : state.selectedStaffProfile,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete staff profile',
              loading: false
            });
            throw error;
          }
        },

        // ==================== SHIFTS ====================
        fetchShifts: async (filters: ShiftFilters) => {
          set({ loading: true, error: null });
          try {
            const shifts = await workforceApi.getShifts(filters);
            set({ shifts, loading: false, shiftFilters: filters });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch shifts',
              loading: false
            });
            throw error;
          }
        },

        fetchShiftById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const shift = await workforceApi.getShiftById(id);
            set({ selectedShift: shift, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch shift details',
              loading: false
            });
            throw error;
          }
        },

        createShift: async (data: ShiftFormData) => {
          set({ loading: true, error: null });
          try {
            const newShift = await workforceApi.createShift(data);
            set(state => ({
              shifts: [newShift, ...state.shifts],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create shift',
              loading: false
            });
            throw error;
          }
        },

        updateShift: async (id: string, data: ShiftUpdateData) => {
          set({ loading: true, error: null });
          try {
            const updatedShift = await workforceApi.updateShift(id, data);
            set(state => ({
              shifts: state.shifts.map(shift =>
                shift.id === id ? updatedShift : shift
              ),
              selectedShift: state.selectedShift?.id === id ? updatedShift : state.selectedShift,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update shift',
              loading: false
            });
            throw error;
          }
        },

        deleteShift: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await workforceApi.deleteShift(id);
            set(state => ({
              shifts: state.shifts.filter(shift => shift.id !== id),
              selectedShift: state.selectedShift?.id === id ? null : state.selectedShift,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete shift',
              loading: false
            });
            throw error;
          }
        },

        // ==================== SHIFT TEMPLATES ====================
        fetchShiftTemplates: async () => {
          set({ loading: true, error: null });
          try {
            const shiftTemplates = await workforceApi.getShiftTemplates();
            set({ shiftTemplates, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch shift templates',
              loading: false
            });
            throw error;
          }
        },

        createShiftTemplate: async (data: ShiftTemplateFormData) => {
          set({ loading: true, error: null });
          try {
            const newTemplate = await workforceApi.createShiftTemplate(data);
            set(state => ({
              shiftTemplates: [newTemplate, ...state.shiftTemplates],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create shift template',
              loading: false
            });
            throw error;
          }
        },

        updateShiftTemplate: async (id: string, data: Partial<ShiftTemplateFormData>) => {
          set({ loading: true, error: null });
          try {
            const updatedTemplate = await workforceApi.updateShiftTemplate(id, data);
            set(state => ({
              shiftTemplates: state.shiftTemplates.map(template =>
                template.id === id ? updatedTemplate : template
              ),
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update shift template',
              loading: false
            });
            throw error;
          }
        },

        deleteShiftTemplate: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await workforceApi.deleteShiftTemplate(id);
            set(state => ({
              shiftTemplates: state.shiftTemplates.filter(template => template.id !== id),
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete shift template',
              loading: false
            });
            throw error;
          }
        },

        // ==================== TIMESHEETS ====================
        fetchTimesheets: async (filters = {}) => {
          set({ loading: true, error: null });
          try {
            const mergedFilters = { ...get().timesheetFilters, ...filters };
            const timesheets = await workforceApi.getTimesheets(mergedFilters);
            set({ 
              timesheets, 
              loading: false, 
              timesheetFilters: mergedFilters 
            });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch timesheets',
              loading: false
            });
            throw error;
          }
        },

        fetchTimesheetById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const timesheet = await workforceApi.getTimesheetById(id);
            set({ selectedTimesheet: timesheet, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch timesheet details',
              loading: false
            });
            throw error;
          }
        },

        createTimesheet: async (data: TimesheetFormData) => {
          set({ loading: true, error: null });
          try {
            const newTimesheet = await workforceApi.createTimesheet(data);
            set(state => ({
              timesheets: [newTimesheet, ...state.timesheets],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create timesheet',
              loading: false
            });
            throw error;
          }
        },

        updateTimesheet: async (id: string, data: TimesheetUpdateData) => {
          set({ loading: true, error: null });
          try {
            const updatedTimesheet = await workforceApi.updateTimesheet(id, data);
            set(state => ({
              timesheets: state.timesheets.map(timesheet =>
                timesheet.id === id ? updatedTimesheet : timesheet
              ),
              selectedTimesheet: state.selectedTimesheet?.id === id ? updatedTimesheet : state.selectedTimesheet,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update timesheet',
              loading: false
            });
            throw error;
          }
        },

        submitTimesheet: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const submittedTimesheet = await workforceApi.submitTimesheet(id);
            set(state => ({
              timesheets: state.timesheets.map(timesheet =>
                timesheet.id === id ? submittedTimesheet : timesheet
              ),
              selectedTimesheet: state.selectedTimesheet?.id === id ? submittedTimesheet : state.selectedTimesheet,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to submit timesheet',
              loading: false
            });
            throw error;
          }
        },

        approveTimesheet: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const approvedTimesheet = await workforceApi.approveTimesheet(id);
            set(state => ({
              timesheets: state.timesheets.map(timesheet =>
                timesheet.id === id ? approvedTimesheet : timesheet
              ),
              selectedTimesheet: state.selectedTimesheet?.id === id ? approvedTimesheet : state.selectedTimesheet,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to approve timesheet',
              loading: false
            });
            throw error;
          }
        },

        rejectTimesheet: async (id: string, reason?: string) => {
          set({ loading: true, error: null });
          try {
            const rejectedTimesheet = await workforceApi.rejectTimesheet(id, reason);
            set(state => ({
              timesheets: state.timesheets.map(timesheet =>
                timesheet.id === id ? rejectedTimesheet : timesheet
              ),
              selectedTimesheet: state.selectedTimesheet?.id === id ? rejectedTimesheet : state.selectedTimesheet,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to reject timesheet',
              loading: false
            });
            throw error;
          }
        },

        // ==================== TIME CLOCK ====================
        fetchClockEvents: async (staffProfileId?: string, limit?: number) => {
          set({ loading: true, error: null });
          try {
            const clockEvents = await workforceApi.getClockEvents(staffProfileId, limit);
            set({ clockEvents, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch clock events',
              loading: false
            });
            throw error;
          }
        },

        clockIn: async (staffProfileId: string, location?: string) => {
          set({ loading: true, error: null });
          try {
            const clockEvent = await workforceApi.clockIn(staffProfileId, location);
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to clock in',
              loading: false
            });
            throw error;
          }
        },

        clockOut: async (staffProfileId: string, location?: string) => {
          set({ loading: true, error: null });
          try {
            const clockEvent = await workforceApi.clockOut(staffProfileId, location);
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to clock out',
              loading: false
            });
            throw error;
          }
        },

        startBreak: async (staffProfileId: string) => {
          set({ loading: true, error: null });
          try {
            const clockEvent = await workforceApi.startBreak(staffProfileId);
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to start break',
              loading: false
            });
            throw error;
          }
        },

        endBreak: async (staffProfileId: string) => {
          set({ loading: true, error: null });
          try {
            const clockEvent = await workforceApi.endBreak(staffProfileId);
            set(state => ({
              clockEvents: [clockEvent, ...state.clockEvents],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to end break',
              loading: false
            });
            throw error;
          }
        },

        // ==================== PERFORMANCE ====================
        fetchPerformanceMetrics: async (filters = {}) => {
          set({ loading: true, error: null });
          try {
            const performanceMetrics = await workforceApi.getPerformanceMetrics(filters);
            set({ performanceMetrics, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch performance metrics',
              loading: false
            });
            throw error;
          }
        },

        createPerformanceMetric: async (data: PerformanceMetricFormData) => {
          set({ loading: true, error: null });
          try {
            const newMetric = await workforceApi.createPerformanceMetric(data);
            set(state => ({
              performanceMetrics: [newMetric, ...state.performanceMetrics],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create performance metric',
              loading: false
            });
            throw error;
          }
        },

        fetchStaffPerformance: async (staffProfileId: string) => {
          set({ loading: true, error: null });
          try {
            const performanceMetrics = await workforceApi.getStaffPerformance(staffProfileId);
            set({ performanceMetrics, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch staff performance',
              loading: false
            });
            throw error;
          }
        },

        // ==================== AVAILABILITY ====================
        fetchAvailabilityRecords: async (staffProfileId?: string, startDate?: string, endDate?: string) => {
          set({ loading: true, error: null });
          try {
            const availabilityRecords = await workforceApi.getStaffAvailability(staffProfileId, startDate, endDate);
            set({ availabilityRecords, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch availability records',
              loading: false
            });
            throw error;
          }
        },

        createAvailability: async (data: AvailabilityFormData) => {
          set({ loading: true, error: null });
          try {
            const newAvailability = await workforceApi.createAvailability(data);
            set(state => ({
              availabilityRecords: [newAvailability, ...state.availabilityRecords],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create availability',
              loading: false
            });
            throw error;
          }
        },

        updateAvailability: async (id: string, data: Partial<AvailabilityFormData>) => {
          set({ loading: true, error: null });
          try {
            const updatedAvailability = await workforceApi.updateAvailability(id, data);
            set(state => ({
              availabilityRecords: state.availabilityRecords.map(record =>
                record.id === id ? updatedAvailability : record
              ),
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update availability',
              loading: false
            });
            throw error;
          }
        },

        deleteAvailability: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await workforceApi.deleteAvailability(id);
            set(state => ({
              availabilityRecords: state.availabilityRecords.filter(record => record.id !== id),
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete availability',
              loading: false
            });
            throw error;
          }
        },

        // ==================== PAYROLL ====================
        fetchPayrollExports: async () => {
          set({ loading: true, error: null });
          try {
            const payrollExports = await workforceApi.getPayrollExports();
            set({ payrollExports, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch payroll exports',
              loading: false
            });
            throw error;
          }
        },

        createPayrollExport: async (data: PayrollExportFormData) => {
          set({ loading: true, error: null });
          try {
            const newExport = await workforceApi.createPayrollExport(data);
            set(state => ({
              payrollExports: [newExport, ...state.payrollExports],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create payroll export',
              loading: false
            });
            throw error;
          }
        },

        // ==================== DASHBOARD & ANALYTICS ====================
        fetchDashboardData: async () => {
          set({ loading: true, error: null });
          try {
            const dashboardData = await workforceApi.getWorkforceDashboard();
            set({ dashboardData, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch dashboard data',
              loading: false
            });
            throw error;
          }
        },

        fetchStatistics: async () => {
          set({ loading: true, error: null });
          try {
            const statistics = await workforceApi.getWorkforceStatistics();
            set({ statistics, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch statistics',
              loading: false
            });
            throw error;
          }
        },

        // ==================== SELECTION ====================
        selectStaffProfile: (profile: StaffProfile | null) => {
          set({ selectedStaffProfile: profile });
        },

        selectShift: (shift: Shift | null) => {
          set({ selectedShift: shift });
        },

        selectTimesheet: (timesheet: Timesheet | null) => {
          set({ selectedTimesheet: timesheet });
        },

        clearSelections: () => {
          set({ 
            selectedStaffProfile: null,
            selectedShift: null,
            selectedTimesheet: null
          });
        },

        // ==================== FILTERS ====================
        setStaffProfileFilters: (filters: StaffProfileFilters) => {
          set(state => ({ 
            staffProfileFilters: { ...state.staffProfileFilters, ...filters } 
          }));
          get().actions.fetchStaffProfiles();
        },

        setShiftFilters: (filters: ShiftFilters) => {
          set({ shiftFilters: filters });
          get().actions.fetchShifts(filters);
        },

        setTimesheetFilters: (filters: TimesheetFilters) => {
          set(state => ({ 
            timesheetFilters: { ...state.timesheetFilters, ...filters } 
          }));
          get().actions.fetchTimesheets();
        },

        clearFilters: () => {
          set({ 
            staffProfileFilters: {},
            shiftFilters: { start_date: '', end_date: '' },
            timesheetFilters: {}
          });
          // Refresh data with cleared filters
          get().actions.fetchStaffProfiles();
          get().actions.fetchTimesheets();
        },

        // ==================== ERROR HANDLING ====================
        clearError: () => {
          set({ error: null });
        },

        // ==================== BULK OPERATIONS ====================
        bulkCreateShifts: async (shifts: ShiftFormData[]) => {
          set({ loading: true, error: null });
          try {
            const newShifts = await workforceApi.bulkCreateShifts(shifts);
            set(state => ({
              shifts: [...newShifts, ...state.shifts],
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to bulk create shifts',
              loading: false
            });
            throw error;
          }
        },

        bulkUpdateTimesheets: async (updates: Array<{ id: string; data: TimesheetUpdateData }>) => {
          set({ loading: true, error: null });
          try {
            const updatedTimesheets = await workforceApi.bulkUpdateTimesheets(updates);
            set(state => ({
              timesheets: state.timesheets.map(timesheet => {
                const update = updatedTimesheets.find(t => t.id === timesheet.id);
                return update || timesheet;
              }),
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to bulk update timesheets',
              loading: false
            });
            throw error;
          }
        },
      }
    }),
    {
      name: 'workforce-storage',
      partialize: (state) => ({
        staffProfiles: state.staffProfiles,
        shiftTemplates: state.shiftTemplates,
        staffProfileFilters: state.staffProfileFilters,
        shiftFilters: state.shiftFilters,
        timesheetFilters: state.timesheetFilters
      }),
    }
  )
);
