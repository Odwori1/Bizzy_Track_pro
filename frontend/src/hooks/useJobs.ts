import { useEffect } from 'react';
import { useJobStore } from '@/store/jobStore';
import { JobCreateRequest, JobUpdateRequest, JobFilters } from '@/types/jobs';

export const useJobs = (filters?: JobFilters) => {
  const { jobs, loading, error, filters: currentFilters } = useJobStore();
  const { fetchJobs, setFilters } = useJobStore(state => state.actions);

  useEffect(() => {
    if (filters) {
      setFilters(filters);
    }
  }, [filters, setFilters]);

  useEffect(() => {
    fetchJobs(currentFilters);
  }, [currentFilters, fetchJobs]);

  return {
    jobs,
    loading,
    error,
    refetch: () => fetchJobs(currentFilters)
  };
};

export const useJob = (id?: string) => {
  const { selectedJob, loading, error } = useJobStore();
  const { fetchJobById } = useJobStore(state => state.actions);

  useEffect(() => {
    if (id) {
      fetchJobById(id);
    }
  }, [id, fetchJobById]);

  return {
    job: selectedJob,
    loading,
    error,
    refetch: () => id ? fetchJobById(id) : Promise.resolve()
  };
};

export const useJobActions = () => {
  const {
    createJob,
    updateJob,
    updateJobStatus,
    deleteJob,
    clearError
  } = useJobStore(state => state.actions);

  return {
    createJob: async (jobData: JobCreateRequest) => {
      try {
        const newJob = await createJob(jobData);
        return { success: true, data: newJob };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create job'
        };
      }
    },

    updateJob: async (id: string, jobData: JobUpdateRequest) => {
      try {
        await updateJob(id, jobData);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update job'
        };
      }
    },

    updateJobStatus: async (id: string, status: Job['status']) => {
      try {
        await updateJobStatus(id, status);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update job status'
        };
      }
    },

    deleteJob: async (id: string) => {
      try {
        await deleteJob(id);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete job'
        };
      }
    },

    clearError
  };
};
