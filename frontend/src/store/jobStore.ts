import { create } from 'zustand';
import { Job, JobCreateRequest, JobUpdateRequest, JobFilters } from '@/types/jobs';
import { apiClient } from '@/lib/api';

interface JobState {
  jobs: Job[];
  selectedJob: Job | null;
  loading: boolean;
  error: string | null;
  filters: JobFilters;

  // Actions
  actions: {
    fetchJobs: (filters?: JobFilters) => Promise<void>;
    fetchJobById: (id: string) => Promise<void>;
    createJob: (jobData: JobCreateRequest) => Promise<Job>;
    updateJob: (id: string, jobData: JobUpdateRequest) => Promise<void>;
    updateJobStatus: (id: string, status: Job['status']) => Promise<void>;
    deleteJob: (id: string) => Promise<void>;
    setFilters: (filters: JobFilters) => void;
    clearError: () => void;
  };
}

export const useJobStore = create<JobState>()((set, get) => ({
  jobs: [],
  selectedJob: null,
  loading: false,
  error: null,
  filters: {},

  actions: {
    fetchJobs: async (filters = {}) => {
      set({ loading: true, error: null });
      try {
        // Convert filters to query params
        const params: Record<string, string> = {};
        if (filters.status) params.status = filters.status;
        if (filters.priority) params.priority = filters.priority;
        if (filters.customerId) params.assigned_to = filters.customerId;
        if (filters.is_package_job !== undefined) params.is_package_job = filters.is_package_job.toString();

        const jobs = await apiClient.get<Job[]>('/api/jobs', params);
        set({ jobs, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch jobs'
        });
      }
    },

    fetchJobById: async (id: string) => {
      set({ loading: true, error: null });
      try {
        const job = await apiClient.get<Job>(`/api/jobs/${id}`);
        set({ selectedJob: job, loading: false });
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch job'
        });
      }
    },

    createJob: async (jobData: JobCreateRequest) => {
      set({ loading: true, error: null });
      try {
        const newJob = await apiClient.post<Job>('/api/jobs', jobData);
        set(state => ({
          jobs: [...state.jobs, newJob],
          loading: false
        }));
        return newJob;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to create job'
        });
        throw error;
      }
    },

    updateJob: async (id: string, jobData: JobUpdateRequest) => {
      set({ loading: true, error: null });
      try {
        const updatedJob = await apiClient.put<Job>(`/api/jobs/${id}`, jobData);
        set(state => ({
          jobs: state.jobs.map(job => job.id === id ? updatedJob : job),
          selectedJob: state.selectedJob?.id === id ? updatedJob : state.selectedJob,
          loading: false
        }));
        return updatedJob;
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update job'
        });
        throw error;
      }
    },

    updateJobStatus: async (id: string, status: Job['status']) => {
      set({ loading: true, error: null });
      try {
        await apiClient.patch(`/api/jobs/${id}/status`, { status });
        set(state => ({
          jobs: state.jobs.map(job =>
            job.id === id ? { ...job, status } : job
          ),
          selectedJob: state.selectedJob?.id === id
            ? { ...state.selectedJob, status }
            : state.selectedJob,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to update job status'
        });
        throw error;
      }
    },

    deleteJob: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await apiClient.delete(`/api/jobs/${id}`);
        set(state => ({
          jobs: state.jobs.filter(job => job.id !== id),
          selectedJob: state.selectedJob?.id === id ? null : state.selectedJob,
          loading: false
        }));
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to delete job'
        });
        throw error;
      }
    },

    setFilters: (filters: JobFilters) => {
      set({ filters });
    },

    clearError: () => {
      set({ error: null });
    },
  },
}));
