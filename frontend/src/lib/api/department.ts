/**
 * DEPARTMENT COORDINATION API SERVICE
 * Follows EXACT patterns from staff API
 */

import { apiClient } from '@/lib/api';  // CHANGED: Named import instead of default
import { cleanParams } from '@/lib/api-utils';
import {
  Department,
  DepartmentFormData,
  JobDepartmentAssignment,
  JobAssignmentFormData,
  DepartmentWorkflowHandoff,
  WorkflowHandoffFormData,
  DepartmentBillingEntry,
  ConsolidatedBill,
  DepartmentPerformanceMetrics,
  DepartmentFilters,
  JobAssignmentFilters,
  WorkflowFilters,
  DepartmentListResponse,
  DepartmentHierarchyResponse,
  JobAssignmentListResponse,
  WorkflowHandoffListResponse,
  DepartmentPerformanceResponse
} from '@/types/department';

// Utility function to clean UUID parameters
const cleanUuidParam = (id: string): string => {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid ID parameter');
  }
  return id.trim();
};

// Extract meaningful error message from API response
const extractErrorMessage = (error: any): string => {
  if (!error) return 'Unknown error occurred';

  // Check for server response data
  if (error.data?.error) {
    return error.data.error;
  }

  if (error.data?.message) {
    return error.data.message;
  }

  // Check for error message in the error object
  if (error.message) {
    return error.message;
  }

  // Check for status-based messages
  if (error.status === 500) {
    return 'Server error occurred. Please try again later.';
  }

  if (error.status === 401) {
    return 'Authentication required. Please log in again.';
  }

  if (error.status === 403) {
    return 'You do not have permission to perform this action.';
  }

  if (error.status === 404) {
    return 'Resource not found.';
  }

  return 'An unexpected error occurred';
};

export const departmentApi = {
  // ==================== DEPARTMENT MANAGEMENT ====================

  /**
   * Get all departments with optional filters
   */
  async getDepartments(filters?: DepartmentFilters): Promise<Department[]> {
    const cleanedFilters = cleanParams(filters || {});
    return apiClient.get<Department[]>('/departments', cleanedFilters);
  },

  /**
   * Get department by ID
   */
  async getDepartmentById(id: string): Promise<Department> {
    const cleanedId = cleanUuidParam(id);
    return apiClient.get<Department>(`/departments/${cleanedId}`);
  },

  /**
   * Create a new department
   */
  async createDepartment(data: DepartmentFormData): Promise<Department> {
    const cleanedData = cleanParams(data);
    return apiClient.post<Department>('/departments', cleanedData);
  },

  /**
   * Update an existing department
   */
  async updateDepartment(id: string, data: Partial<DepartmentFormData>): Promise<Department> {
    const cleanedId = cleanUuidParam(id);
    const cleanedData = cleanParams(data);
    return apiClient.put<Department>(`/departments/${cleanedId}`, cleanedData);
  },

  /**
   * Delete a department
   */
  async deleteDepartment(id: string): Promise<{ success: boolean; message: string }> {
    const cleanedId = cleanUuidParam(id);
    return apiClient.delete(`/departments/${cleanedId}`);
  },

  /**
   * Get department hierarchy
   */
  async getDepartmentHierarchy(): Promise<DepartmentHierarchyResponse> {
    return apiClient.get<DepartmentHierarchyResponse>('/departments/hierarchy');
  },

  // ==================== JOB DEPARTMENT ASSIGNMENTS ====================

  /**
   * Get all job department assignments
   */
  async getJobAssignments(filters?: JobAssignmentFilters): Promise<JobDepartmentAssignment[]> {
    const cleanedFilters = cleanParams(filters || {});
    return apiClient.get<JobDepartmentAssignment[]>('/job-department-assignments', cleanedFilters);
  },

  /**
   * Get job assignment by ID
   */
  async getJobAssignmentById(id: string): Promise<JobDepartmentAssignment> {
    const cleanedId = cleanUuidParam(id);
    return apiClient.get<JobDepartmentAssignment>(`/job-department-assignments/${cleanedId}`);
  },

  /**
   * Get assignments for a specific job
   */
  async getAssignmentsByJob(jobId: string): Promise<JobDepartmentAssignment[]> {
    const cleanedJobId = cleanUuidParam(jobId);
    return apiClient.get<JobDepartmentAssignment[]>(`/job-department-assignments/job/${cleanedJobId}`);
  },

  /**
   * Get assignments for a specific department
   */
  async getAssignmentsByDepartment(departmentId: string): Promise<JobDepartmentAssignment[]> {
    const cleanedDeptId = cleanUuidParam(departmentId);
    return apiClient.get<JobDepartmentAssignment[]>(`/job-department-assignments/department/${cleanedDeptId}`);
  },

  /**
   * Create a new job department assignment
   */
  async createJobAssignment(data: JobAssignmentFormData): Promise<JobDepartmentAssignment> {
    const cleanedData = cleanParams(data);
    return apiClient.post<JobDepartmentAssignment>('/job-department-assignments', cleanedData);
  },

  /**
   * Update a job department assignment
   */
  async updateJobAssignment(id: string, data: Partial<JobAssignmentFormData>): Promise<JobDepartmentAssignment> {
    const cleanedId = cleanUuidParam(id);
    const cleanedData = cleanParams(data);
    return apiClient.put<JobDepartmentAssignment>(`/job-department-assignments/${cleanedId}`, cleanedData);
  },

  /**
   * Delete a job department assignment
   */
  async deleteJobAssignment(id: string): Promise<{ success: boolean; message: string }> {
    const cleanedId = cleanUuidParam(id);
    return apiClient.delete(`/job-department-assignments/${cleanedId}`);
  },

  // ==================== WORKFLOW HANDOFFS ====================

  /**
   * Get pending handoffs
   */
  async getPendingHandoffs(): Promise<DepartmentWorkflowHandoff[]> {
    return apiClient.get<DepartmentWorkflowHandoff[]>('/department-workflow/pending');
  },

  /**
   * Get handoffs for a specific job
   */
  async getHandoffsByJob(jobId: string): Promise<DepartmentWorkflowHandoff[]> {
    const cleanedJobId = cleanUuidParam(jobId);
    return apiClient.get<DepartmentWorkflowHandoff[]>(`/department-workflow/job/${cleanedJobId}`);
  },

  /**
   * Get handoffs for a specific department
   */
  async getHandoffsByDepartment(departmentId: string): Promise<DepartmentWorkflowHandoff[]> {
    const cleanedDeptId = cleanUuidParam(departmentId);
    return apiClient.get<DepartmentWorkflowHandoff[]>(`/department-workflow/department/${cleanedDeptId}`);
  },

  /**
   * Create a workflow handoff
   */
  async createHandoff(data: WorkflowHandoffFormData): Promise<DepartmentWorkflowHandoff> {
    const cleanedData = cleanParams(data);
    return apiClient.post<DepartmentWorkflowHandoff>('/department-workflow/handoff', cleanedData);
  },

  /**
   * Accept a handoff
   */
  async acceptHandoff(handoffId: string, notes?: string): Promise<DepartmentWorkflowHandoff> {
    const cleanedId = cleanUuidParam(handoffId);
    const data = notes ? { notes } : {};
    
    try {
      return await apiClient.put<DepartmentWorkflowHandoff>(`/department-workflow/${cleanedId}/accept`, data);
    } catch (error: any) {
      console.error('API Error accepting handoff:', error);
      
      // Extract meaningful error message
      let errorMessage = 'Failed to accept handoff';
      
      if (error.data?.error) {
        errorMessage = error.data.error;
      } else if (error.data?.message) {
        errorMessage = error.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Enhance specific backend error messages
      if (errorMessage.includes('already assigned') || 
          errorMessage.includes('Job already assigned')) {
        errorMessage = `Cannot accept handoff: Job is already assigned to this department with the same assignment type.`;
      }
      
      const enhancedError = new Error(errorMessage);
      Object.assign(enhancedError, {
        status: error.status,
        data: error.data,
        originalError: error
      });
      
      throw enhancedError;
    }
  },

  /**
   * Reject a handoff
   */
  async rejectHandoff(handoffId: string, rejectionReason: string): Promise<DepartmentWorkflowHandoff> {
    const cleanedId = cleanUuidParam(handoffId);
    return apiClient.put<DepartmentWorkflowHandoff>(`/department-workflow/${cleanedId}/reject`, {
      rejection_reason: rejectionReason
    });
  },

  // ==================== DEPARTMENT BILLING ====================

  /**
   * Get department billing entries
   */
  async getBillingEntries(): Promise<DepartmentBillingEntry[]> {
    return apiClient.get<DepartmentBillingEntry[]>('/department-billing');
  },

  /**
   * Get consolidated billing
   */
  async getConsolidatedBilling(): Promise<ConsolidatedBill[]> {
    return apiClient.get<ConsolidatedBill[]>('/department-billing/consolidated');
  },

  /**
   * Get billing for a specific department
   */
  async getBillingByDepartment(departmentId: string): Promise<DepartmentBillingEntry[]> {
    const cleanedDeptId = cleanUuidParam(departmentId);
    return apiClient.get<DepartmentBillingEntry[]>(`/department-billing/department/${cleanedDeptId}`);
  },

  /**
   * Generate a consolidated bill
   */
  async generateConsolidatedBill(jobId: string): Promise<ConsolidatedBill> {
    const cleanedJobId = cleanUuidParam(jobId);

    try {
      console.log('API: Generating consolidated bill for job:', cleanedJobId);
      const response = await apiClient.post<ConsolidatedBill>('/department-billing/generate-bill', {
        job_id: cleanedJobId
      });

      console.log('API Response for bill generation:', response);
      return response;

    } catch (error: any) {
      console.error('API Error generating consolidated bill:', error);

      // Improve error message for common scenarios
      const errorMessage = extractErrorMessage(error);

      // Create a new error with better message
      const enhancedError = new Error(errorMessage);

      // Preserve original error properties
      Object.assign(enhancedError, {
        status: error.status,
        data: error.data,
        originalError: error
      });

      throw enhancedError;
    }
  },

  /**
   * Allocate charge to department
   */
  async allocateCharge(data: {
    department_id: string;
    job_id: string;
    description: string;
    amount: number;
    quantity?: number;
    unit_price?: number;
    tax_rate?: number;
  }): Promise<DepartmentBillingEntry> {
    const cleanedData = cleanParams(data);
    return apiClient.post<DepartmentBillingEntry>('/department-billing/allocate-charge', cleanedData);
  },

  // ==================== DEPARTMENT PERFORMANCE ====================

  /**
   * Get department performance overview
   */
  async getDepartmentPerformance(): Promise<DepartmentPerformanceResponse> {
    return apiClient.get<DepartmentPerformanceResponse>('/department-performance');
  },

  /**
   * Get department metrics dashboard
   */
  async getPerformanceMetrics(): Promise<{
    departments: DepartmentPerformanceMetrics[];
    overall_metrics: any;
  }> {
    return apiClient.get('/department-performance/metrics');
  },

  /**
   * Get performance for a specific department
   */
  async getDepartmentPerformanceById(departmentId: string): Promise<DepartmentPerformanceMetrics> {
    const cleanedDeptId = cleanUuidParam(departmentId);
    return apiClient.get<DepartmentPerformanceMetrics>(`/department-performance/department/${cleanedDeptId}`);
  },

  // ==================== UTILITY METHODS ====================

  /**
   * Assign staff to department
   */
  async assignStaffToDepartment(staffId: string, departmentId: string): Promise<any> {
    const cleanedStaffId = cleanUuidParam(staffId);
    const cleanedDeptId = cleanUuidParam(departmentId);

    return apiClient.put(`/staff/${cleanedStaffId}`, {
      department_id: cleanedDeptId
    });
  },

  /**
   * Get staff by department
   */
  async getStaffByDepartment(departmentId: string): Promise<any[]> {
    const cleanedDeptId = cleanUuidParam(departmentId);
    return apiClient.get<any[]>(`/staff?department_id=${cleanedDeptId}`);
  },

  /**
   * Get jobs for department coordination
   */
  async getJobsForCoordination(filters?: any): Promise<any[]> {
    const cleanedFilters = cleanParams(filters || {});
    return apiClient.get<any[]>('/jobs', cleanedFilters);
  }
};

export default departmentApi;
