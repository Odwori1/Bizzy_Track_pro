'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useJobs } from '@/hooks/useJobs';
import { useJobActions } from '@/hooks/useJobs';
import { Job, JobFilters } from '@/types/jobs';
import { getJobStats, JobStats } from '@/lib/jobStats';
import { useCurrency } from '@/lib/currency';
import { posEngine } from '@/lib/pos-engine';

export default function JobsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<JobStats>({
    total: 0,
    pending: 0,
    scheduled: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0
  });
  const [filters, setFilters] = useState<JobFilters>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  const { jobs, loading, error, refetch } = useJobs(filters);
  const { deleteJob } = useJobActions();
  const { format } = useCurrency();

  // Load job statistics
  useEffect(() => {
    const loadStats = async () => {
      const jobStats = await getJobStats();
      setStats(jobStats);
    };
    loadStats();
  }, [jobs]); // Re-fetch stats when jobs change

  // Handle filter changes
  const handleStatusFilter = (status: string) => {
    if (status === 'all') {
      setFilters({});
    } else {
      setFilters({ ...filters, status: status as Job['status'] });
    }
  };

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Note: Backend doesn't support search yet, so we'll filter client-side for now
  };

  // Handle job deletion
  const handleDeleteJob = async (jobId: string) => {
    if (confirm('Are you sure you want to delete this job?')) {
      const result = await deleteJob(jobId);
      if (result.success) {
        refetch();
      } else {
        alert(result.error);
      }
    }
  };

  // Handle add job fee to cart
  const handleAddJobFeeToCart = async (job: Job) => {
    if (job.status !== 'completed') {
      alert('Only completed jobs can be added to cart for payment');
      return;
    }

    setAddingToCart(job.id);

    try {
      // Create universal sellable item for job fee
      const sellableItem = {
        id: job.id,
        type: 'job_fee' as const,
        sourceModule: 'jobs' as const,
        name: `Job Fee: ${job.title}`,
        description: job.service_name || 'Job service fee',
        unitPrice: parseFloat(job.total_amount || '0') || 0,
        quantity: 1,
        category: 'Job Fees',
        metadata: {
          job_id: job.id,
          job_stage: job.status,
          job_description: job.title,
          job_number: job.job_number
        },
        business_id: '' // Will be set by backend based on auth
      };

      // Add to universal cart using POS engine
      posEngine.addItem(sellableItem);

      // Show success feedback
      console.log(`✅ Added job fee for "${job.title}" to cart`);

    } catch (error: any) {
      console.error('❌ Failed to add job fee to cart:', error);
      alert(`Failed to add job fee to cart: ${error.message}`);
    } finally {
      setAddingToCart(null);
    }
  };

  // Handle department assignment
  const handleAssignToDepartment = (job: Job) => {
    // Navigate to workflow assignment creation
    router.push(`/dashboard/coordination/workflow/create?jobId=${job.id}`);
  };

  // Format date for display
  const formatDate = (dateData: any) => {
    if (!dateData) return 'Not scheduled';
    return dateData.formatted || new Date(dateData.utc).toLocaleString();
  };

  // Filter jobs client-side for search (until backend supports search)
  const filteredJobs = jobs.filter(job => {
    const searchLower = searchTerm.toLowerCase();

    return (
      (job.title?.toLowerCase() || '').includes(searchLower) ||
      (job.customer_first_name?.toLowerCase() || '').includes(searchLower) ||
      (job.customer_last_name?.toLowerCase() || '').includes(searchLower) ||
      (job.job_number?.toLowerCase() || '').includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Management</h1>
          <p className="text-gray-600">Manage and track all jobs</p>
        </div>
        <div className="flex space-x-3">
          <Link href="/dashboard/management/pos/cart">
            <Button variant="outline">
              View Cart
            </Button>
          </Link>
          <Link href="/dashboard/management/jobs/new">
            <Button variant="primary" size="lg">
              Create New Job
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-600">Total Jobs</h3>
            <div className="text-2xl font-bold mt-2">{stats.total}</div>
            <p className="text-sm text-gray-600">All time</p>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-600">In Progress</h3>
            <div className="text-2xl font-bold text-blue-600 mt-2">{stats.inProgress}</div>
            <p className="text-sm text-gray-600">Active jobs</p>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-600">Pending</h3>
            <div className="text-2xl font-bold text-yellow-600 mt-2">{stats.pending}</div>
            <p className="text-sm text-gray-600">Awaiting action</p>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h3 className="text-sm font-medium text-gray-600">Completed</h3>
            <div className="text-2xl font-bold text-green-600 mt-2">{stats.completed}</div>
            <p className="text-sm text-gray-600">Finished jobs</p>
          </div>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <Link href="/dashboard/management/jobs/board">
          <Button variant="secondary">
            📊 View Kanban Board
          </Button>
        </Link>
        <Link href="/dashboard/management/jobs/calendar">
          <Button variant="secondary">
            🗓️ View Calendar
          </Button>
        </Link>
      </div>

      {/* Jobs List */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {filters.status ? `${filters.status} Jobs` : 'All Jobs'}
              {loading && <span className="text-sm text-gray-500 ml-2">Loading...</span>}
            </h2>
            <div className="flex space-x-2">
              <select
                className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.status || 'all'}
                onChange={(e) => handleStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <form onSubmit={handleSearch} className="flex">
                <Input
                  type="text"
                  placeholder="Search jobs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-sm w-48"
                />
              </form>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <div className="text-red-800 text-sm">{error}</div>
              <Button variant="secondary" size="sm" onClick={refetch} className="mt-2">
                Retry
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {filteredJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4 flex-1">
                  <div className={`w-3 h-3 rounded-full ${
                    job.status === 'completed' ? 'bg-green-500' :
                    job.status === 'in-progress' ? 'bg-blue-500' :
                    job.status === 'pending' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`} />
                  <div className="flex-1">
                    <Link href={`/dashboard/management/jobs/${job.id}`}>
                      <div className="font-medium hover:text-blue-600 cursor-pointer">
                        {job.title}
                      </div>
                    </Link>
                    <div className="text-sm text-gray-600">
                      {job.customer_first_name} {job.customer_last_name} • {job.service_name}
                    </div>
                    <div className="flex space-x-2 mt-1">
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
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {formatDate(job.scheduled_date)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {job.estimated_duration_minutes || 'Unknown'} min
                  </div>
                  {job.total_amount && (
                    <div className="text-sm font-semibold text-green-600">
                      {format(job.total_amount)}
                    </div>
                  )}
                  <div className="flex space-x-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAssignToDepartment(job)}
                      title="Assign to Department"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Assign
                    </Button>
                    {job.status === 'completed' && job.total_amount && (
                      <Button
                        onClick={() => handleAddJobFeeToCart(job)}
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={addingToCart === job.id}
                      >
                        {addingToCart === job.id ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Adding...
                          </span>
                        ) : (
                          'Add to Cart'
                        )}
                      </Button>
                    )}
                    <Link href={`/dashboard/management/jobs/${job.id}`}>
                      <Button variant="secondary" size="sm">
                        View
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDeleteJob(job.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Show message if no jobs */}
            {!loading && filteredJobs.length === 0 && (
              <div className="text-center py-8">
                <div className="text-gray-500 text-lg mb-2">
                  {searchTerm ? 'No jobs match your search' : 'No jobs found'}
                </div>
                <p className="text-gray-600 mb-4">
                  {searchTerm ? 'Try adjusting your search terms' : 'Get started by creating your first job'}
                </p>
                {!searchTerm && (
                  <Link href="/dashboard/management/jobs/new">
                    <Button variant="primary">
                      Create Your First Job
                    </Button>
                  </Link>
                )}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div className="text-center py-8">
                <div className="text-gray-500 text-lg">Loading jobs...</div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
