/**
 * UNIFIED EMPLOYEES API SERVICE
 * Uses the new /api/employees endpoint (combines staff + workforce)
 * FOLLOWS SAME PATTERN AS workforce.ts
 */

import { apiClient } from '@/lib/api';
import {
  UnifiedEmployee,
  UnifiedEmployeeFormData,
  UnifiedEmployeeUpdateData,
  ClockEvent,
  ApiListResponse
} from '@/types/workforce';

class UnifiedEmployeesApiService {
  // ==================== UNIFIED EMPLOYEES ====================
  async getEmployees(filters?: any): Promise<UnifiedEmployee[]> {
    console.log('[Unified] Getting employees with filters:', filters);
    return apiClient.get<UnifiedEmployee[]>('/employees', filters);
  }

  async getEmployeeById(id: string): Promise<UnifiedEmployee> {
    console.log('[Unified] Getting employee with ID:', id);
    return apiClient.get<UnifiedEmployee>(`/employees/${id}`);
  }

  async getEmployeeByEmployeeId(employeeId: string): Promise<UnifiedEmployee> {
    console.log('[Unified] Getting employee with employee ID:', employeeId);
    return apiClient.get<UnifiedEmployee>(`/employees/${employeeId}`);
  }

  async getEmployeeWorkforceData(id: string): Promise<any> {
    console.log('[Unified] Getting workforce data for employee:', id);
    return apiClient.get<any>(`/employees/${id}/workforce`);
  }

  // ==================== TIME CLOCK (Unified) ====================
  async clockIn(employeeId: string, notes?: string): Promise<ClockEvent> {
    console.log('[Unified] Clock in for employee:', employeeId);
    return apiClient.post<ClockEvent>(`/employees/${employeeId}/clock-in`, { notes });
  }

  async clockOut(employeeId: string, notes?: string): Promise<ClockEvent> {
    console.log('[Unified] Clock out for employee:', employeeId);
    return apiClient.post<ClockEvent>(`/employees/${employeeId}/clock-out`, { notes });
  }

  async startBreak(employeeId: string): Promise<ClockEvent> {
    console.log('[Unified] Start break for employee:', employeeId);
    return apiClient.post<ClockEvent>(`/employees/${employeeId}/break-start`, {});
  }

  async endBreak(employeeId: string): Promise<ClockEvent> {
    console.log('[Unified] End break for employee:', employeeId);
    return apiClient.post<ClockEvent>(`/employees/${employeeId}/break-end`, {});
  }

  // ==================== CLOCK EVENTS ====================
  async getClockEvents(employeeId?: string, limit?: number): Promise<ClockEvent[]> {
    console.log('[Unified] Getting clock events from UNIFIED endpoint');

    const params: any = {};
    if (employeeId) {
      // Use the new unified endpoint that accepts employee_id (EMPxxx format)
      // This endpoint automatically maps EMPxxx to the correct staff_profile_id
      return apiClient.get<ClockEvent[]>(`/employees/${employeeId}/clock-events`, { limit });
    }
    
    // Get all clock events from unified endpoint
    const events = await apiClient.get<ClockEvent[]>('/employees/clock-events', { limit });
    
    console.log(`[Unified] Got ${events.length} events from unified endpoint`);
    return events;
  }

  // ==================== EMPLOYEE MANAGEMENT ====================
  async updateEmployee(id: string, data: UnifiedEmployeeUpdateData): Promise<UnifiedEmployee> {
    console.log('[Unified] Updating employee:', { id, data });
    return apiClient.put<UnifiedEmployee>(`/employees/${id}`, data);
  }

  async deleteEmployee(id: string): Promise<void> {
    console.log('[Unified] Deleting employee:', id);
    return apiClient.delete(`/employees/${id}`);
  }

  // ==================== STATISTICS ====================
  async getEmployeeStats(employeeId: string): Promise<any> {
    console.log('[Unified] Getting stats for employee:', employeeId);
    return apiClient.get<any>(`/employees/${employeeId}/stats`);
  }
}

export const unifiedEmployeesApi = new UnifiedEmployeesApiService();
