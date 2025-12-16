/**
 * DEPARTMENT COORDINATION STORE
 * Follows EXACT patterns from staffStore.ts
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { departmentApi } from '@/lib/api/department';
import {
  Department,
  JobDepartmentAssignment,
  DepartmentWorkflowHandoff,
  DepartmentBillingEntry,
  ConsolidatedBill,
  DepartmentPerformanceMetrics,
  DepartmentFormData,
  JobAssignmentFormData,
  WorkflowHandoffFormData,
  DepartmentFilters,
  JobAssignmentFilters
} from '@/types/department';

interface DepartmentState {
  // Data
  departments: Department[];
  selectedDepartment: Department | null;
  jobAssignments: JobDepartmentAssignment[];
  selectedAssignment: JobDepartmentAssignment | null;
  workflowHandoffs: DepartmentWorkflowHandoff[];
  pendingHandoffs: DepartmentWorkflowHandoff[];
  billingEntries: DepartmentBillingEntry[];
  consolidatedBills: ConsolidatedBill[];
  performanceMetrics: DepartmentPerformanceMetrics[];

  // UI State
  loading: boolean;
  error: string | null;

  // Filters
  departmentFilters: DepartmentFilters;
  assignmentFilters: JobAssignmentFilters;

  // Actions
  actions: {
    // Department Management
    fetchDepartments: (filters?: DepartmentFilters) => Promise<void>;
    fetchDepartmentById: (id: string) => Promise<void>;
    createDepartment: (data: DepartmentFormData) => Promise<void>;
    updateDepartment: (id: string, data: Partial<DepartmentFormData>) => Promise<void>;
    deleteDepartment: (id: string) => Promise<void>;
    selectDepartment: (department: Department | null) => void;

    // Job Assignments
    fetchJobAssignments: (filters?: JobAssignmentFilters) => Promise<void>;
    fetchJobAssignmentById: (id: string) => Promise<JobDepartmentAssignment>;
    fetchAssignmentsByJob: (jobId: string) => Promise<void>;
    fetchAssignmentsByDepartment: (departmentId: string) => Promise<void>;
    createJobAssignment: (data: JobAssignmentFormData) => Promise<void>;
    updateJobAssignment: (id: string, data: Partial<JobAssignmentFormData>) => Promise<void>;
    deleteJobAssignment: (id: string) => Promise<void>;
    selectAssignment: (assignment: JobDepartmentAssignment | null) => void;

    // Workflow Handoffs
    fetchPendingHandoffs: () => Promise<void>;
    fetchHandoffsByJob: (jobId: string) => Promise<DepartmentWorkflowHandoff[]>;
    createHandoff: (data: WorkflowHandoffFormData) => Promise<void>;
    acceptHandoff: (handoffId: string, notes?: string) => Promise<void>;
    rejectHandoff: (handoffId: string, reason: string) => Promise<void>;

    // Billing
    fetchBillingEntries: () => Promise<void>;
    fetchConsolidatedBilling: () => Promise<void>;
    generateConsolidatedBill: (jobId: string) => Promise<void>;

    // Performance
    fetchPerformanceMetrics: () => Promise<void>;

    // UI Actions
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    clearError: () => void;
    setDepartmentFilters: (filters: DepartmentFilters) => void;
    setAssignmentFilters: (filters: JobAssignmentFilters) => void;
  };
}

export const useDepartmentStore = create<DepartmentState>()(
  persist(
    (set, get) => ({
      // Initial State
      departments: [],
      selectedDepartment: null,
      jobAssignments: [],
      selectedAssignment: null,
      workflowHandoffs: [],
      pendingHandoffs: [],
      billingEntries: [],
      consolidatedBills: [],
      performanceMetrics: [],

      loading: false,
      error: null,

      departmentFilters: {},
      assignmentFilters: {},

      // Actions
      actions: {
        // ==================== DEPARTMENT MANAGEMENT ====================

        fetchDepartments: async (filters?: DepartmentFilters) => {
          set({ loading: true, error: null });
          try {
            const departmentFilters = filters || get().departmentFilters;
            const departments = await departmentApi.getDepartments(departmentFilters);
            set({ departments, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch departments',
              loading: false
            });
            throw error;
          }
        },

        fetchDepartmentById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const department = await departmentApi.getDepartmentById(id);
            set({ selectedDepartment: department, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch department',
              loading: false
            });
            throw error;
          }
        },

        createDepartment: async (data: DepartmentFormData) => {
          set({ loading: true, error: null });
          try {
            const newDepartment = await departmentApi.createDepartment(data);
            set(state => ({
              departments: [...state.departments, newDepartment],
              loading: false
            }));
            return newDepartment;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create department',
              loading: false
            });
            throw error;
          }
        },

        updateDepartment: async (id: string, data: Partial<DepartmentFormData>) => {
          set({ loading: true, error: null });
          try {
            const updatedDepartment = await departmentApi.updateDepartment(id, data);
            set(state => ({
              departments: state.departments.map(dept =>
                dept.id === id ? updatedDepartment : dept
              ),
              selectedDepartment: state.selectedDepartment?.id === id
                ? updatedDepartment
                : state.selectedDepartment,
              loading: false
            }));
            return updatedDepartment;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update department',
              loading: false
            });
            throw error;
          }
        },

        deleteDepartment: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await departmentApi.deleteDepartment(id);
            set(state => ({
              departments: state.departments.filter(dept => dept.id !== id),
              selectedDepartment: state.selectedDepartment?.id === id
                ? null
                : state.selectedDepartment,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete department',
              loading: false
            });
            throw error;
          }
        },

        selectDepartment: (department: Department | null) => {
          set({ selectedDepartment: department });
        },

        // ==================== JOB ASSIGNMENTS ====================

        fetchJobAssignments: async (filters?: JobAssignmentFilters) => {
          set({ loading: true, error: null });
          try {
            const assignmentFilters = filters || get().assignmentFilters;
            const assignments = await departmentApi.getJobAssignments(assignmentFilters);
            set({ jobAssignments: assignments, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch job assignments',
              loading: false
            });
            throw error;
          }
        },

        fetchJobAssignmentById: async (id: string) => {
          set({ loading: true, error: null });
          try {
            const response = await departmentApi.getJobAssignmentById(id);
            set({ 
              loading: false, 
              selectedAssignment: response,
              error: null 
            });
            return response;
          } catch (error: any) {
            set({ 
              loading: false, 
              error: error.message || 'Failed to fetch assignment'
            });
            throw error;
          }
        },

        fetchAssignmentsByJob: async (jobId: string) => {
          set({ loading: true, error: null });
          try {
            const assignments = await departmentApi.getAssignmentsByJob(jobId);
            set({ jobAssignments: assignments, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch job assignments',
              loading: false
            });
            throw error;
          }
        },

        fetchAssignmentsByDepartment: async (departmentId: string) => {
          set({ loading: true, error: null });
          try {
            const assignments = await departmentApi.getAssignmentsByDepartment(departmentId);
            set({ jobAssignments: assignments, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch department assignments',
              loading: false
            });
            throw error;
          }
        },

        createJobAssignment: async (data: JobAssignmentFormData) => {
          set({ loading: true, error: null });
          try {
            const newAssignment = await departmentApi.createJobAssignment(data);
            set(state => ({
              jobAssignments: [...state.jobAssignments, newAssignment],
              loading: false
            }));
            return newAssignment;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create job assignment',
              loading: false
            });
            throw error;
          }
        },

        updateJobAssignment: async (id: string, data: Partial<JobAssignmentFormData>) => {
          set({ loading: true, error: null });
          try {
            const updatedAssignment = await departmentApi.updateJobAssignment(id, data);
            set(state => ({
              jobAssignments: state.jobAssignments.map(assignment =>
                assignment.id === id ? updatedAssignment : assignment
              ),
              selectedAssignment: state.selectedAssignment?.id === id
                ? updatedAssignment
                : state.selectedAssignment,
              loading: false
            }));
            return updatedAssignment;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to update job assignment',
              loading: false
            });
            throw error;
          }
        },

        deleteJobAssignment: async (id: string) => {
          set({ loading: true, error: null });
          try {
            await departmentApi.deleteJobAssignment(id);
            set(state => ({
              jobAssignments: state.jobAssignments.filter(assignment => assignment.id !== id),
              selectedAssignment: state.selectedAssignment?.id === id
                ? null
                : state.selectedAssignment,
              loading: false
            }));
          } catch (error: any) {
            set({
              error: error.message || 'Failed to delete job assignment',
              loading: false
            });
            throw error;
          }
        },

        selectAssignment: (assignment: JobDepartmentAssignment | null) => {
          set({ selectedAssignment: assignment });
        },

        // ==================== WORKFLOW HANDOFFS ====================

        fetchPendingHandoffs: async () => {
          set({ loading: true, error: null });
          try {
            const handoffs = await departmentApi.getPendingHandoffs();
            set({ pendingHandoffs: handoffs, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch pending handoffs',
              loading: false
            });
            throw error;
          }
        },

        fetchHandoffsByJob: async (jobId: string) => {
          set({ loading: true, error: null });
          try {
            const response = await departmentApi.getHandoffsByJob(jobId);
            set({ loading: false, error: null });
            return response;
          } catch (error: any) {
            set({ 
              loading: false, 
              error: error.message || 'Failed to fetch handoffs'
            });
            throw error;
          }
        },

        createHandoff: async (data: WorkflowHandoffFormData) => {
          set({ loading: true, error: null });
          try {
            const newHandoff = await departmentApi.createHandoff(data);
            set(state => ({
              workflowHandoffs: [...state.workflowHandoffs, newHandoff],
              pendingHandoffs: [...state.pendingHandoffs, newHandoff],
              loading: false
            }));
            return newHandoff;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to create handoff',
              loading: false
            });
            throw error;
          }
        },

        acceptHandoff: async (handoffId: string, notes?: string) => {
          set({ loading: true, error: null });
          try {
            const acceptedHandoff = await departmentApi.acceptHandoff(handoffId, notes);
            set(state => ({
              workflowHandoffs: state.workflowHandoffs.map(handoff =>
                handoff.id === handoffId ? acceptedHandoff : handoff
              ),
              pendingHandoffs: state.pendingHandoffs.filter(h => h.id !== handoffId),
              loading: false
            }));
            return acceptedHandoff;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to accept handoff',
              loading: false
            });
            throw error;
          }
        },

        rejectHandoff: async (handoffId: string, reason: string) => {
          set({ loading: true, error: null });
          try {
            const rejectedHandoff = await departmentApi.rejectHandoff(handoffId, reason);
            set(state => ({
              workflowHandoffs: state.workflowHandoffs.map(handoff =>
                handoff.id === handoffId ? rejectedHandoff : handoff
              ),
              pendingHandoffs: state.pendingHandoffs.filter(h => h.id !== handoffId),
              loading: false
            }));
            return rejectedHandoff;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to reject handoff',
              loading: false
            });
            throw error;
          }
        },

        // ==================== BILLING ====================

        fetchBillingEntries: async () => {
          set({ loading: true, error: null });
          try {
            const entries = await departmentApi.getBillingEntries();
            set({ billingEntries: entries, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch billing entries',
              loading: false
            });
            throw error;
          }
        },

        fetchConsolidatedBilling: async () => {
          set({ loading: true, error: null });
          try {
            const bills = await departmentApi.getConsolidatedBilling();
            set({ consolidatedBills: bills, loading: false });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch consolidated billing',
              loading: false
            });
            throw error;
          }
        },

        generateConsolidatedBill: async (jobId: string) => {
          set({ loading: true, error: null });
          try {
            const bill = await departmentApi.generateConsolidatedBill(jobId);
            set(state => ({
              consolidatedBills: [...state.consolidatedBills, bill],
              loading: false
            }));
            return bill;
          } catch (error: any) {
            set({
              error: error.message || 'Failed to generate consolidated bill',
              loading: false
            });
            throw error;
          }
        },

        // ==================== PERFORMANCE ====================

        fetchPerformanceMetrics: async () => {
          set({ loading: true, error: null });
          try {
            const response = await departmentApi.getPerformanceMetrics();
            set({
              performanceMetrics: response.departments,
              loading: false
            });
          } catch (error: any) {
            set({
              error: error.message || 'Failed to fetch performance metrics',
              loading: false
            });
            throw error;
          }
        },

        // ==================== UI ACTIONS ====================

        setLoading: (loading: boolean) => {
          set({ loading });
        },

        setError: (error: string | null) => {
          set({ error });
        },

        clearError: () => {
          set({ error: null });
        },

        setDepartmentFilters: (filters: DepartmentFilters) => {
          set({ departmentFilters: filters });
        },

        setAssignmentFilters: (filters: JobAssignmentFilters) => {
          set({ assignmentFilters: filters });
        },
      }
    }),
    {
      name: 'department-storage',
      partialize: (state) => ({
        departments: state.departments,
        departmentFilters: state.departmentFilters,
        assignmentFilters: state.assignmentFilters,
      })
    }
  )
);

// Convenience hooks for common patterns
export const useDepartmentActions = () => useDepartmentStore((state) => state.actions);
export const useDepartments = () => useDepartmentStore((state) => state.departments);
export const useSelectedDepartment = () => useDepartmentStore((state) => state.selectedDepartment);
export const useJobAssignments = () => useDepartmentStore((state) => state.jobAssignments);
export const usePendingHandoffs = () => useDepartmentStore((state) => state.pendingHandoffs);
export const useDepartmentLoading = () => useDepartmentStore((state) => state.loading);
export const useDepartmentError = () => useDepartmentStore((state) => state.error);
