/**
 * COMPLETE WORKFORCE API SERVICE
 * All workforce-related API calls in one place
 */

import { apiClient } from '@/lib/api';
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
  WorkforceStatistics,
  ApiListResponse,
  ApiSingleResponse
} from '@/types/workforce';

class WorkforceApiService {
  // ==================== STAFF PROFILES ====================
  async getStaffProfiles(filters?: StaffProfileFilters): Promise<StaffProfile[]> {
    console.log('Getting staff profiles with filters:', filters);
    return apiClient.get<StaffProfile[]>('/workforce/staff-profiles', filters);
  }

  async getStaffProfileById(id: string): Promise<StaffProfile> {
    console.log('Getting staff profile with ID:', id);
    return apiClient.get<StaffProfile>(`/workforce/staff-profiles/${id}`);
  }

  async createStaffProfile(data: StaffProfileFormData): Promise<StaffProfile> {
    console.log('Creating staff profile:', data);
    return apiClient.post<StaffProfile>('/workforce/staff-profiles', data);
  }

  async updateStaffProfile(id: string, data: StaffProfileUpdateData): Promise<StaffProfile> {
    console.log('Updating staff profile:', { id, data });
    return apiClient.put<StaffProfile>(`/workforce/staff-profiles/${id}`, data);
  }

  async deleteStaffProfile(id: string): Promise<void> {
    console.log('Deleting staff profile:', id);
    return apiClient.delete(`/workforce/staff-profiles/${id}`);
  }

  // ==================== SHIFT MANAGEMENT ====================
  async getShifts(filters: ShiftFilters): Promise<Shift[]> {
    console.log('Getting shifts with filters:', filters);
    return apiClient.get<Shift[]>('/workforce/shifts', filters);
  }

  async getShiftById(id: string): Promise<Shift> {
    console.log('Getting shift with ID:', id);
    return apiClient.get<Shift>(`/workforce/shifts/${id}`);
  }

  async createShift(data: ShiftFormData): Promise<Shift> {
    console.log('Creating shift:', data);
    return apiClient.post<Shift>('/workforce/shifts', data);
  }

  async updateShift(id: string, data: ShiftUpdateData): Promise<Shift> {
    console.log('Updating shift:', { id, data });
    return apiClient.put<Shift>(`/workforce/shifts/${id}`, data);
  }

  async deleteShift(id: string): Promise<void> {
    console.log('Deleting shift:', id);
    return apiClient.delete(`/workforce/shifts/${id}`);
  }

  // ==================== SHIFT TEMPLATES ====================
  async getShiftTemplates(): Promise<ShiftTemplate[]> {
    console.log('Getting shift templates');
    return apiClient.get<ShiftTemplate[]>('/workforce/shift-templates');
  }

  async getShiftTemplateById(id: string): Promise<ShiftTemplate> {
    console.log('Getting shift template with ID:', id);
    return apiClient.get<ShiftTemplate>(`/workforce/shift-templates/${id}`);
  }

  async createShiftTemplate(data: ShiftTemplateFormData): Promise<ShiftTemplate> {
    console.log('Creating shift template:', data);
    return apiClient.post<ShiftTemplate>('/workforce/shift-templates', data);
  }

  async updateShiftTemplate(id: string, data: Partial<ShiftTemplateFormData>): Promise<ShiftTemplate> {
    console.log('Updating shift template:', { id, data });
    return apiClient.put<ShiftTemplate>(`/workforce/shift-templates/${id}`, data);
  }

  async deleteShiftTemplate(id: string): Promise<void> {
    console.log('Deleting shift template:', id);
    return apiClient.delete(`/workforce/shift-templates/${id}`);
  }

  // ==================== SHIFT ROSTERS ====================
  async createShiftRoster(shiftId: string, staffProfileId: string): Promise<any> {
    console.log('Creating shift roster:', { shiftId, staffProfileId });
    return apiClient.post('/workforce/shift-rosters', {
      shift_id: shiftId,
      staff_profile_id: staffProfileId
    });
  }

  // ==================== TIMESHEET MANAGEMENT ====================
  async getTimesheets(filters?: TimesheetFilters): Promise<Timesheet[]> {
    console.log('Getting timesheets with filters:', filters);
    return apiClient.get<Timesheet[]>('/workforce/timesheets', filters);
  }

  async getTimesheetById(id: string): Promise<Timesheet> {
    console.log('Getting timesheet with ID:', id);
    return apiClient.get<Timesheet>(`/workforce/timesheets/${id}`);
  }

  async createTimesheet(data: TimesheetFormData): Promise<Timesheet> {
    console.log('Creating timesheet:', data);
    return apiClient.post<Timesheet>('/workforce/timesheets', data);
  }

  async updateTimesheet(id: string, data: TimesheetUpdateData): Promise<Timesheet> {
    console.log('Updating timesheet:', { id, data });
    return apiClient.put<Timesheet>(`/workforce/timesheets/${id}`, data);
  }

  async submitTimesheet(id: string): Promise<Timesheet> {
    console.log('Submitting timesheet:', id);
    return apiClient.post<Timesheet>(`/workforce/timesheets/${id}/submit`);
  }

  async approveTimesheet(id: string): Promise<Timesheet> {
    console.log('Approving timesheet:', id);
    return apiClient.post<Timesheet>(`/workforce/timesheets/${id}/approve`);
  }

  async rejectTimesheet(id: string, reason?: string): Promise<Timesheet> {
    console.log('Rejecting timesheet:', { id, reason });
    return apiClient.post<Timesheet>(`/workforce/timesheets/${id}/reject`, { reason });
  }

  // ==================== TIME CLOCK ====================
  async getClockEvents(staffProfileId?: string, limit?: number): Promise<ClockEvent[]> {
    console.log('Getting clock events:', { staffProfileId, limit });
    const params: any = {};
    if (staffProfileId) params.staff_profile_id = staffProfileId;
    if (limit) params.limit = limit;
    
    return apiClient.get<ClockEvent[]>('/workforce/clock-events', params);
  }

  async createClockEvent(data: ClockEventFormData): Promise<ClockEvent> {
    console.log('Creating clock event:', data);
    return apiClient.post<ClockEvent>('/workforce/clock-events', data);
  }

  async clockIn(staffProfileId: string, location?: string): Promise<ClockEvent> {
    console.log('Clock in:', { staffProfileId, location });
    return this.createClockEvent({
      staff_profile_id: staffProfileId,
      event_type: 'clock_in',
      location_address: location
    });
  }

  async clockOut(staffProfileId: string, location?: string): Promise<ClockEvent> {
    console.log('Clock out:', { staffProfileId, location });
    return this.createClockEvent({
      staff_profile_id: staffProfileId,
      event_type: 'clock_out',
      location_address: location
    });
  }

  async startBreak(staffProfileId: string): Promise<ClockEvent> {
    console.log('Start break:', staffProfileId);
    return this.createClockEvent({
      staff_profile_id: staffProfileId,
      event_type: 'break_start'
    });
  }

  async endBreak(staffProfileId: string): Promise<ClockEvent> {
    console.log('End break:', staffProfileId);
    return this.createClockEvent({
      staff_profile_id: staffProfileId,
      event_type: 'break_end'
    });
  }

  // ==================== PERFORMANCE MANAGEMENT ====================
  async getPerformanceMetrics(filters?: PerformanceFilters): Promise<PerformanceMetric[]> {
    console.log('Getting performance metrics with filters:', filters);
    return apiClient.get<PerformanceMetric[]>('/workforce/performance', filters);
  }

  async createPerformanceMetric(data: PerformanceMetricFormData): Promise<PerformanceMetric> {
    console.log('Creating performance metric:', data);
    return apiClient.post<PerformanceMetric>('/workforce/performance', data);
  }

  async getStaffPerformance(staffProfileId: string): Promise<PerformanceMetric[]> {
    console.log('Getting staff performance:', staffProfileId);
    return this.getPerformanceMetrics({ staff_profile_id: staffProfileId });
  }

  // ==================== AVAILABILITY MANAGEMENT ====================
  async getStaffAvailability(staffProfileId?: string, startDate?: string, endDate?: string): Promise<StaffAvailability[]> {
    console.log('Getting staff availability:', { staffProfileId, startDate, endDate });
    const params: any = {};
    if (staffProfileId) params.staff_profile_id = staffProfileId;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    
    return apiClient.get<StaffAvailability[]>('/workforce/availability', params);
  }

  async createAvailability(data: AvailabilityFormData): Promise<StaffAvailability> {
    console.log('Creating availability:', data);
    return apiClient.post<StaffAvailability>('/workforce/availability', data);
  }

  async updateAvailability(id: string, data: Partial<AvailabilityFormData>): Promise<StaffAvailability> {
    console.log('Updating availability:', { id, data });
    return apiClient.put<StaffAvailability>(`/workforce/availability/${id}`, data);
  }

  async deleteAvailability(id: string): Promise<void> {
    console.log('Deleting availability:', id);
    return apiClient.delete(`/workforce/availability/${id}`);
  }

  // ==================== PAYROLL MANAGEMENT ====================
  async getPayrollExports(): Promise<PayrollExport[]> {
    console.log('Getting payroll exports');
    return apiClient.get<PayrollExport[]>('/workforce/payroll-exports');
  }

  async createPayrollExport(data: PayrollExportFormData): Promise<PayrollExport> {
    console.log('Creating payroll export:', data);
    return apiClient.post<PayrollExport>('/workforce/payroll-exports', data);
  }

  async downloadPayrollExport(id: string): Promise<Blob> {
    console.log('Downloading payroll export:', id);
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'}/api/workforce/payroll-exports/${id}/download`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    return response.blob();
  }

  // ==================== DASHBOARD & ANALYTICS ====================
  async getWorkforceDashboard(): Promise<WorkforceDashboardData> {
    console.log('Getting workforce dashboard');
    return apiClient.get<WorkforceDashboardData>('/workforce/dashboard');
  }

  async getWorkforceStatistics(): Promise<WorkforceStatistics> {
    console.log('Getting workforce statistics');
    return apiClient.get<WorkforceStatistics>('/workforce/statistics');
  }

  // ==================== BULK OPERATIONS ====================
  async bulkCreateShifts(shifts: ShiftFormData[]): Promise<Shift[]> {
    console.log('Bulk creating shifts:', shifts.length);
    return apiClient.post<Shift[]>('/workforce/shifts/bulk', { shifts });
  }

  async bulkUpdateTimesheets(updates: Array<{ id: string; data: TimesheetUpdateData }>): Promise<Timesheet[]> {
    console.log('Bulk updating timesheets:', updates.length);
    return apiClient.put<Timesheet[]>('/workforce/timesheets/bulk', { updates });
  }

  // ==================== EXPORT FUNCTIONALITY ====================
  async exportShiftsToCSV(filters: ShiftFilters): Promise<Blob> {
    console.log('Exporting shifts to CSV with filters:', filters);
    const queryString = new URLSearchParams(filters as any).toString();
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'}/api/workforce/shifts/export/csv?${queryString}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    return response.blob();
  }

  async exportTimesheetsToCSV(filters?: TimesheetFilters): Promise<Blob> {
    console.log('Exporting timesheets to CSV with filters:', filters);
    const queryString = new URLSearchParams(filters as any).toString();
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'}/api/workforce/timesheets/export/csv?${queryString}`,
      {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    return response.blob();
  }
}

export const workforceApi = new WorkforceApiService();
