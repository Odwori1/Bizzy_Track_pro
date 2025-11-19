import { Job } from '@/types/jobs';
import { apiClient } from '@/lib/api';

export interface JobStats {
  total: number;
  pending: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
}

export const getJobStats = async (): Promise<JobStats> => {
  try {
    // Fetch all jobs to calculate stats
    const jobs = await apiClient.get<Job[]>('/api/jobs');
    
    const stats: JobStats = {
      total: jobs.length,
      pending: jobs.filter(job => job.status === 'pending').length,
      scheduled: jobs.filter(job => job.status === 'scheduled').length,
      inProgress: jobs.filter(job => job.status === 'in-progress').length,
      completed: jobs.filter(job => job.status === 'completed').length,
      cancelled: jobs.filter(job => job.status === 'cancelled').length
    };

    return stats;
  } catch (error) {
    console.error('Failed to fetch job stats:', error);
    // Return zero stats on error
    return {
      total: 0,
      pending: 0,
      scheduled: 0,
      inProgress: 0,
      completed: 0,
      cancelled: 0
    };
  }
};
