/**
 * DEPARTMENT COORDINATION CUSTOM HOOK
 * Follows EXACT patterns from useStaff.ts and other hooks
 */

import { useState, useCallback, useEffect } from 'react';
import { departmentApi } from '@/lib/api/department';
import { useDepartmentStore, useDepartmentActions } from '@/store/departmentStore';
import {
  Department,
  JobDepartmentAssignment,
  DepartmentWorkflowHandoff,
  DepartmentBillingEntry,
  ConsolidatedBill,
  DepartmentFormData,
  JobAssignmentFormData,
  WorkflowHandoffFormData,
  DepartmentFilters,
  JobAssignmentFilters
} from '@/types/department';

export function useDepartment() {
  const store = useDepartmentStore();
  const actions = useDepartmentActions();

  // Department Management
  const fetchDepartments = useCallback(async (filters?: DepartmentFilters) => {
    return actions.fetchDepartments(filters);
  }, [actions]);

  const fetchDepartmentById = useCallback(async (id: string) => {
    return actions.fetchDepartmentById(id);
  }, [actions]);

  const createDepartment = useCallback(async (data: DepartmentFormData) => {
    return actions.createDepartment(data);
  }, [actions]);

  const updateDepartment = useCallback(async (id: string, data: Partial<DepartmentFormData>) => {
    return actions.updateDepartment(id, data);
  }, [actions]);

  const deleteDepartment = useCallback(async (id: string) => {
    return actions.deleteDepartment(id);
  }, [actions]);

  // Job Assignments
  const fetchJobAssignments = useCallback(async (filters?: JobAssignmentFilters) => {
    return actions.fetchJobAssignments(filters);
  }, [actions]);

  const fetchJobAssignmentById = useCallback(async (id: string) => {
    return actions.fetchJobAssignmentById(id);
  }, [actions]);

  const fetchAssignmentsByJob = useCallback(async (jobId: string) => {
    return actions.fetchAssignmentsByJob(jobId);
  }, [actions]);

  const createJobAssignment = useCallback(async (data: JobAssignmentFormData) => {
    return actions.createJobAssignment(data);
  }, [actions]);

  const updateJobAssignment = useCallback(async (id: string, data: Partial<JobAssignmentFormData>) => {
    return actions.updateJobAssignment(id, data);
  }, [actions]);

  // Workflow Handoffs
  const fetchPendingHandoffs = useCallback(async () => {
    return actions.fetchPendingHandoffs();
  }, [actions]);

  const fetchHandoffsByJob = useCallback(async (jobId: string) => {
    return actions.fetchHandoffsByJob(jobId);
  }, [actions]);

  const createHandoff = useCallback(async (data: WorkflowHandoffFormData) => {
    return actions.createHandoff(data);
  }, [actions]);

  const acceptHandoff = useCallback(async (handoffId: string, notes?: string) => {
    return actions.acceptHandoff(handoffId, notes);
  }, [actions]);

  const rejectHandoff = useCallback(async (handoffId: string, reason: string) => {
    return actions.rejectHandoff(handoffId, reason);
  }, [actions]);

  // Billing
  const fetchBillingEntries = useCallback(async () => {
    return actions.fetchBillingEntries();
  }, [actions]);

  const fetchConsolidatedBilling = useCallback(async () => {
    return actions.fetchConsolidatedBilling();
  }, [actions]);

  // Performance
  const fetchPerformanceMetrics = useCallback(async () => {
    return actions.fetchPerformanceMetrics();
  }, [actions]);

  return {
    // State
    departments: store.departments,
    selectedDepartment: store.selectedDepartment,
    jobAssignments: store.jobAssignments,
    selectedAssignment: store.selectedAssignment,
    pendingHandoffs: store.pendingHandoffs,
    billingEntries: store.billingEntries,
    consolidatedBills: store.consolidatedBills,
    performanceMetrics: store.performanceMetrics,
    loading: store.loading,
    error: store.error,

    // Department Actions
    fetchDepartments,
    fetchDepartmentById,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    selectDepartment: actions.selectDepartment,

    // Job Assignment Actions
    fetchJobAssignments,
    fetchJobAssignmentById,
    fetchAssignmentsByJob,
    createJobAssignment,
    updateJobAssignment,
    deleteJobAssignment: actions.deleteJobAssignment,
    selectAssignment: actions.selectAssignment,

    // Workflow Actions
    fetchPendingHandoffs,
    fetchHandoffsByJob,
    createHandoff,
    acceptHandoff,
    rejectHandoff,

    // Billing Actions
    fetchBillingEntries,
    fetchConsolidatedBilling,
    generateConsolidatedBill: actions.generateConsolidatedBill,

    // Performance Actions
    fetchPerformanceMetrics,

    // UI Actions
    setLoading: actions.setLoading,
    setError: actions.setError,
    clearError: actions.clearError,
    setDepartmentFilters: actions.setDepartmentFilters,
    setAssignmentFilters: actions.setAssignmentFilters,
  };
}

// Specialized hooks for specific use cases
export function useDepartmentList(filters?: DepartmentFilters) {
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { departments, fetchDepartments, loading, error } = useDepartment();

  const loadDepartments = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      await fetchDepartments(filters);
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLocalLoading(false);
    }
  }, [fetchDepartments, filters]);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  return {
    departments,
    loading: localLoading || loading,
    error: localError || error,
    refetch: loadDepartments,
  };
}

export function useJobAssignmentsList(filters?: JobAssignmentFilters) {
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { jobAssignments, fetchJobAssignments, loading, error } = useDepartment();

  const loadAssignments = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      await fetchJobAssignments(filters);
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLocalLoading(false);
    }
  }, [fetchJobAssignments, filters]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  return {
    jobAssignments,
    loading: localLoading || loading,
    error: localError || error,
    refetch: loadAssignments,
  };
}

export function usePendingHandoffsList() {
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { pendingHandoffs, fetchPendingHandoffs, loading, error } = useDepartment();

  const loadHandoffs = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      await fetchPendingHandoffs();
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLocalLoading(false);
    }
  }, [fetchPendingHandoffs]);

  useEffect(() => {
    loadHandoffs();
  }, [loadHandoffs]);

  return {
    pendingHandoffs,
    loading: localLoading || loading,
    error: localError || error,
    refetch: loadHandoffs,
  };
}

export function useDepartmentPerformance() {
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { performanceMetrics, fetchPerformanceMetrics, loading, error } = useDepartment();

  const loadPerformance = useCallback(async () => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      await fetchPerformanceMetrics();
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLocalLoading(false);
    }
  }, [fetchPerformanceMetrics]);

  useEffect(() => {
    loadPerformance();
  }, [loadPerformance]);

  return {
    performanceMetrics,
    loading: localLoading || loading,
    error: localError || error,
    refetch: loadPerformance,
  };
}
