'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useJobs } from '@/hooks/useJobs';
import { Job } from '@/types/jobs';
import { getJobStats, JobStats } from '@/lib/jobStats';

interface BoardColumn {
  title: string;
  status: Job['status'];
  count: number;
  jobs: Job[];
  color: string;
  limit: number;
}

export default function JobBoardPage() {
  const [stats, setStats] = useState<JobStats>({
    total: 0,
    pending: 0,
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0
  });

  const { jobs, loading, error, refetch } = useJobs();
  const [columnLimits, setColumnLimits] = useState({
    pending: 10,
    'in-progress': 10,
    completed: 10,
    cancelled: 10
  });

  // Load job statistics
  useEffect(() => {
    const loadStats = async () => {
      const jobStats = await getJobStats();
      setStats(jobStats);
    };
    loadStats();
  }, [jobs]);

  // Load more jobs for a specific column
  const loadMoreJobs = (status: Job['status']) => {
    setColumnLimits(prev => ({
      ...prev,
      [status]: prev[status] + 10
    }));
  };

  // Group jobs by status for the board
  const boardColumns: BoardColumn[] = [
    {
      title: 'Pending',
      status: 'pending',
      count: stats.pending,
      jobs: jobs.filter(job => job.status === 'pending').slice(0, columnLimits.pending),
      color: 'bg-yellow-50 border-yellow-200',
      limit: columnLimits.pending
    },
    {
      title: 'In Progress',
      status: 'in-progress',
      count: stats.inProgress,
      jobs: jobs.filter(job => job.status === 'in-progress').slice(0, columnLimits['in-progress']),
      color: 'bg-blue-50 border-blue-200',
      limit: columnLimits['in-progress']
    },
    {
      title: 'Completed',
      status: 'completed',
      count: stats.completed,
      jobs: jobs.filter(job => job.status === 'completed').slice(0, columnLimits.completed),
      color: 'bg-green-50 border-green-200',
      limit: columnLimits.completed
    },
    {
      title: 'Cancelled',
      status: 'cancelled',
      count: stats.cancelled,
      jobs: jobs.filter(job => job.status === 'cancelled').slice(0, columnLimits.cancelled),
      color: 'bg-gray-50 border-gray-200',
      limit: columnLimits.cancelled
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Board</h1>
          <p className="text-gray-600">Visual job tracking with Kanban - {stats.total} total jobs</p>
        </div>
        <div className="flex space-x-4">
          <Link href="/dashboard/management/jobs">
            <Button variant="secondary">
              List View
            </Button>
          </Link>
          <Link href="/dashboard/management/jobs/new">
            <Button variant="primary">
              Create New Job
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={refetch} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Board Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {boardColumns.map((column) => (
          <div key={column.status} className={`${column.color} rounded-lg p-4 border`}>
            <div className="font-semibold capitalize">{column.title}</div>
            <div className="text-2xl font-bold mt-1">{column.count}</div>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg">Loading job board...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {boardColumns.map((column) => (
            <Card key={column.status} className={`${column.color} flex flex-col max-h-screen`}>
              <div className="p-6 flex-shrink-0">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 capitalize">{column.title}</h3>
                  <span className="bg-white px-2 py-1 rounded-full text-xs font-medium">
                    {column.count} jobs
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="space-y-3">
                  {column.jobs.map((job) => (
                    <Link key={job.id} href={`/dashboard/management/jobs/${job.id}`}>
                      <div className="bg-white p-3 rounded-lg border shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="font-medium text-sm">{job.title}</div>
                        <div className="text-xs text-gray-600 mt-1">
                          {job.customer_first_name} {job.customer_last_name}
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            job.priority === 'high' ? 'bg-red-100 text-red-800' :
                            job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {job.priority}
                          </span>
                          <span className="text-xs text-gray-500">#{job.job_number}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                  {column.jobs.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-4">
                      No jobs in this column
                    </div>
                  )}
                  {column.jobs.length < column.count && (
                    <div className="text-center pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadMoreJobs(column.status)}
                        className="w-full"
                      >
                        Load More ({column.count - column.jobs.length} remaining)
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
