import { useState, useCallback } from 'react';
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
  StaffAvailability,
  AvailabilityFormData,
  PayrollExport,
  PayrollExportFormData
} from '@/types/workforce';
import { workforceApi } from '@/lib/api/workforce';

export const useWorkforce = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==================== STAFF PROFILES ====================
  const fetchStaffProfiles = useCallback(async (filters?: StaffProfileFilters): Promise<StaffProfile[]> => {
    setLoading(true);
    setError(null);

    try {
      const staffProfiles = await workforceApi.getStaffProfiles(filters);
      return staffProfiles;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch staff profiles');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createStaffProfile = useCallback(async (staffProfileData: StaffProfileFormData) => {
    setLoading(true);
    setError(null);

    try {
      const staffProfile = await workforceApi.createStaffProfile(staffProfileData);
      return staffProfile;
    } catch (err: any) {
      setError(err.message || 'Failed to create staff profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStaffProfile = useCallback(async (id: string, staffProfileData: StaffProfileUpdateData) => {
    setLoading(true);
    setError(null);

    try {
      const staffProfile = await workforceApi.updateStaffProfile(id, staffProfileData);
      return staffProfile;
    } catch (err: any) {
      setError(err.message || 'Failed to update staff profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteStaffProfile = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      await workforceApi.deleteStaffProfile(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete staff profile');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== SHIFTS ====================
  const fetchShifts = useCallback(async (filters: ShiftFilters): Promise<Shift[]> => {
    setLoading(true);
    setError(null);

    try {
      const shifts = await workforceApi.getShifts(filters);
      return shifts;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch shifts');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createShift = useCallback(async (shiftData: ShiftFormData) => {
    setLoading(true);
    setError(null);

    try {
      const shift = await workforceApi.createShift(shiftData);
      return shift;
    } catch (err: any) {
      setError(err.message || 'Failed to create shift');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateShift = useCallback(async (id: string, shiftData: ShiftUpdateData) => {
    setLoading(true);
    setError(null);

    try {
      const shift = await workforceApi.updateShift(id, shiftData);
      return shift;
    } catch (err: any) {
      setError(err.message || 'Failed to update shift');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteShift = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      await workforceApi.deleteShift(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete shift');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== SHIFT TEMPLATES ====================
  const fetchShiftTemplates = useCallback(async (): Promise<ShiftTemplate[]> => {
    setLoading(true);
    setError(null);

    try {
      const shiftTemplates = await workforceApi.getShiftTemplates();
      return shiftTemplates;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch shift templates');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createShiftTemplate = useCallback(async (templateData: ShiftTemplateFormData) => {
    setLoading(true);
    setError(null);

    try {
      const shiftTemplate = await workforceApi.createShiftTemplate(templateData);
      return shiftTemplate;
    } catch (err: any) {
      setError(err.message || 'Failed to create shift template');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== TIMESHEETS ====================
  const fetchTimesheets = useCallback(async (filters?: TimesheetFilters): Promise<Timesheet[]> => {
    setLoading(true);
    setError(null);

    try {
      const timesheets = await workforceApi.getTimesheets(filters);
      return timesheets;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch timesheets');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createTimesheet = useCallback(async (timesheetData: TimesheetFormData) => {
    setLoading(true);
    setError(null);

    try {
      const timesheet = await workforceApi.createTimesheet(timesheetData);
      return timesheet;
    } catch (err: any) {
      setError(err.message || 'Failed to create timesheet');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTimesheet = useCallback(async (id: string, timesheetData: TimesheetUpdateData) => {
    setLoading(true);
    setError(null);

    try {
      const timesheet = await workforceApi.updateTimesheet(id, timesheetData);
      return timesheet;
    } catch (err: any) {
      setError(err.message || 'Failed to update timesheet');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== TIME CLOCK ====================
  const fetchClockEvents = useCallback(async (staffProfileId?: string, limit?: number): Promise<ClockEvent[]> => {
    setLoading(true);
    setError(null);

    try {
      const clockEvents = await workforceApi.getClockEvents(staffProfileId, limit);
      return clockEvents;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch clock events');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clockIn = useCallback(async (staffProfileId: string, location?: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await workforceApi.clockIn(staffProfileId, location);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to clock in');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clockOut = useCallback(async (staffProfileId: string, location?: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await workforceApi.clockOut(staffProfileId, location);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to clock out');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== TIME CLOCK BREAK MANAGEMENT ====================
  const startBreak = useCallback(async (staffProfileId: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await workforceApi.startBreak(staffProfileId);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to start break');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const endBreak = useCallback(async (staffProfileId: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await workforceApi.endBreak(staffProfileId);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to end break');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== PERFORMANCE ====================
  const fetchPerformanceMetrics = useCallback(async (filters?: any): Promise<PerformanceMetric[]> => {
    setLoading(true);
    setError(null);

    try {
      const performanceMetrics = await workforceApi.getPerformanceMetrics(filters);
      return performanceMetrics;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch performance metrics');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPerformanceMetric = useCallback(async (metricData: PerformanceMetricFormData) => {
    setLoading(true);
    setError(null);

    try {
      const performanceMetric = await workforceApi.createPerformanceMetric(metricData);
      return performanceMetric;
    } catch (err: any) {
      setError(err.message || 'Failed to create performance metric');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== AVAILABILITY ====================
  const fetchAvailability = useCallback(async (staffProfileId?: string, startDate?: string, endDate?: string): Promise<StaffAvailability[]> => {
    setLoading(true);
    setError(null);

    try {
      const availability = await workforceApi.getStaffAvailability(staffProfileId, startDate, endDate);
      return availability;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch availability');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createAvailability = useCallback(async (availabilityData: AvailabilityFormData) => {
    setLoading(true);
    setError(null);

    try {
      const availability = await workforceApi.createAvailability(availabilityData);
      return availability;
    } catch (err: any) {
      setError(err.message || 'Failed to create availability');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== PAYROLL ====================
  const fetchPayrollExports = useCallback(async (): Promise<PayrollExport[]> => {
    setLoading(true);
    setError(null);

    try {
      const payrollExports = await workforceApi.getPayrollExports();
      return payrollExports;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payroll exports');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPayrollExport = useCallback(async (exportData: PayrollExportFormData) => {
    setLoading(true);
    setError(null);

    try {
      const payrollExport = await workforceApi.createPayrollExport(exportData);
      return payrollExport;
    } catch (err: any) {
      setError(err.message || 'Failed to create payroll export');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,

    // Staff Profiles
    fetchStaffProfiles,
    createStaffProfile,
    updateStaffProfile,
    deleteStaffProfile,

    // Shifts
    fetchShifts,
    createShift,
    updateShift,
    deleteShift,

    // Shift Templates
    fetchShiftTemplates,
    createShiftTemplate,

    // Timesheets
    fetchTimesheets,
    createTimesheet,
    updateTimesheet,

    // Time Clock
    fetchClockEvents,
    clockIn,
    clockOut,
    startBreak,
    endBreak,

    // Performance
    fetchPerformanceMetrics,
    createPerformanceMetric,

    // Availability
    fetchAvailability,
    createAvailability,

    // Payroll
    fetchPayrollExports,
    createPayrollExport,
  };
};
