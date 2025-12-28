import { useState, useCallback } from 'react';
import { unifiedEmployeesApi } from '@/lib/api/unifiedEmployees';
import { UnifiedEmployee, UnifiedEmployeeUpdateData, ClockEvent } from '@/types/workforce';

export const useUnifiedEmployees = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ==================== EMPLOYEES ====================
  const fetchEmployees = useCallback(async (filters?: any): Promise<UnifiedEmployee[]> => {
    setLoading(true);
    setError(null);

    try {
      const employees = await unifiedEmployeesApi.getEmployees(filters);
      return employees;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch employees');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEmployeeById = useCallback(async (id: string): Promise<UnifiedEmployee> => {
    setLoading(true);
    setError(null);

    try {
      const employee = await unifiedEmployeesApi.getEmployeeById(id);
      return employee;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch employee');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== TIME CLOCK ====================
  const fetchClockEvents = useCallback(async (employeeId?: string, limit?: number): Promise<ClockEvent[]> => {
    setLoading(true);
    setError(null);

    try {
      const clockEvents = await unifiedEmployeesApi.getClockEvents(employeeId, limit);
      return clockEvents;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch clock events');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clockIn = useCallback(async (employeeId: string, notes?: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await unifiedEmployeesApi.clockIn(employeeId, notes);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to clock in');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clockOut = useCallback(async (employeeId: string, notes?: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await unifiedEmployeesApi.clockOut(employeeId, notes);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to clock out');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const startBreak = useCallback(async (employeeId: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await unifiedEmployeesApi.startBreak(employeeId);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to start break');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const endBreak = useCallback(async (employeeId: string) => {
    setLoading(true);
    setError(null);

    try {
      const clockEvent = await unifiedEmployeesApi.endBreak(employeeId);
      return clockEvent;
    } catch (err: any) {
      setError(err.message || 'Failed to end break');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== EMPLOYEE MANAGEMENT ====================
  const updateEmployee = useCallback(async (id: string, employeeData: UnifiedEmployeeUpdateData): Promise<UnifiedEmployee> => {
    setLoading(true);
    setError(null);

    try {
      const employee = await unifiedEmployeesApi.updateEmployee(id, employeeData);
      return employee;
    } catch (err: any) {
      setError(err.message || 'Failed to update employee');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteEmployee = useCallback(async (id: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await unifiedEmployeesApi.deleteEmployee(id);
    } catch (err: any) {
      setError(err.message || 'Failed to delete employee');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    
    // Employees
    fetchEmployees,
    fetchEmployeeById,
    updateEmployee,
    deleteEmployee,

    // Time Clock
    fetchClockEvents,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
  };
};
