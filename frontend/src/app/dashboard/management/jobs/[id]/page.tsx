'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useJob, useJobActions } from '@/hooks/useJobs';
import { Job, JobService } from '@/types/jobs';
import { apiClient } from '@/lib/api';
import { useCurrency } from '@/lib/currency'; // ✅ REPLACED CURRENCY HOOK

interface JobDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function JobDetailPage({ params }: JobDetailPageProps) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, loading, error, refetch } = useJob(jobId || undefined);
  const { updateJobStatus } = useJobActions();
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [invoiceCreating, setInvoiceCreating] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);

  const { format } = useCurrency(); // ✅ Correct currency hook

  // Unwrap the params promise
  useEffect(() => {
    const unwrapParams = async () => {
      const unwrappedParams = await params;
      setJobId(unwrappedParams.id);
    };

    unwrapParams();
  }, [params]);

  useEffect(() => {
    if (needsRefresh && jobId) {
      refetch();
      setNeedsRefresh(false);
    }
  }, [needsRefresh, jobId, refetch]);

  const handleStatusUpdate = async (newStatus: Job['status']) => {
    if (!job) return;

    setStatusUpdating(true);
    try {
      const result = await updateJobStatus(job.id, newStatus);
      if (result.success) {
        setNeedsRefresh(true);
      } else {
        alert(result.error || 'Failed to update status');
      }
    } catch (err) {
      alert('Error updating status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleCreateInvoice = async () => {
    if (!job) return;

    setInvoiceCreating(true);
    try {
      const invoiceData = {
        job_id: job.id,
        customer_id: job.customer_id,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        notes: `Invoice for job: ${job.title}`,
        terms: 'Payment due in 30 days',
        line_items:
          job.is_package_job && job.job_services
            ? job.job_services.map((service: JobService, index: number) => ({
                service_id: service.service_id,
                description: service.service_name || `Service ${index + 1}`,
                quantity: service.quantity,
                unit_price: parseFloat(service.unit_price || '0'),
                tax_rate: 0
              }))
            : [
                {
                  service_id: job.service_id,
                  description: job.service_name || `Service for ${job.title}`,
                  quantity: 1,
                  unit_price: parseFloat(job.service_base_price || '0'),
                  tax_rate: 0
                }
              ]
      };

      const result = await apiClient.post('/invoices', invoiceData);

      if (result) {
        router.push(`/dashboard/management/invoices/${result.id}`);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create invoice');
    } finally {
      setInvoiceCreating(false);
    }
  };

  const formatDate = (dateData: any) => {
    if (!dateData) return 'Not scheduled';
    return dateData.formatted || new Date(dateData.utc).toLocaleString();
  };

  const calculateTotalPrice = () => {
    if (job.is_package_job && job.job_services && job.job_services.length > 0) {
      return job.job_services.reduce((total: number, service: JobService) => {
        return total + parseFloat(service.unit_price || '0') * service.quantity;
      }, 0);
    } else {
      return parseFloat(job.service_base_price || '0');
    }
  };

  const renderServiceInfo = () => {
    if (job.is_package_job && job.job_services && job.job_services.length > 0) {
      const totalPrice = calculateTotalPrice();

      return (
        <div className="space-y-3">
          <div className="font-medium text-gray-900">Package: {job.package_name}</div>
          <div className="space-y-2">
            {job.job_services.map((service: JobService, index: number) => (
              <div
                key={service.id}
                className="flex justify-between items-start border-b pb-2 last:border-b-0"
              >
                <div>
                  <div className="font-medium text-sm">
                    {service.service_name || `Service ${index + 1}`}
                  </div>
                  <div className="text-xs text-gray-500">
                    Qty: {service.quantity} • {service.estimated_duration_minutes} min
                  </div>
                </div>
                <div className="text-sm font-medium text-right">
                  {format(parseFloat(service.unit_price || '0') * service.quantity)} {/* ✅ FIXED */}
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t">
            <div className="flex justify-between font-medium">
              <span>Total:</span>
              <span>{format(totalPrice)}</span> {/* ✅ FIXED */}
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div className="space-y-2">
          <div className="font-medium">{job.service_name || 'No service selected'}</div>
          <div className="text-sm text-gray-600">
            {format(parseFloat(job.service_base_price || '0'))} {/* ✅ FIXED */}
          </div>
        </div>
      );
    }
  };

  if (!jobId) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-500">Loading job details...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-500">Loading job details...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Not Found</h1>
            <p className="text-gray-600">Unable to load job details</p>
          </div>
          <Link href="/dashboard/management/jobs">
            <Button variant="secondary">Back to Jobs</Button>
          </Link>
        </div>
        <Card>
          <div className="p-6 text-center">
            <div className="text-red-600 mb-4">Error loading job: {error}</div>
            <Button variant="primary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-gray-600">Job #{job.job_number}</p>
        </div>

        <div className="flex space-x-4">
          <Link href="/dashboard/management/jobs">
            <Button variant="secondary">Back to Jobs</Button>
          </Link>

          <Button
            variant="primary"
            onClick={handleCreateInvoice}
            disabled={invoiceCreating || job.status !== 'completed'}
          >
            {invoiceCreating ? 'Creating Invoice...' : 'Create Invoice'}
          </Button>

          <Link href={`/dashboard/management/jobs/${job.id}/edit`}>
            <Button variant="primary">Edit Job</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT SIDE */}
        <div className="lg:col-span-2 space-y-6">
          {/* Job Information */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Job Information
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Status
                    </label>
                    <div
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        job.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : job.status === 'in-progress'
                          ? 'bg-blue-100 text-blue-800'
                          : job.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {job.status}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Priority
                    </label>
                    <div
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${
                        job.priority === 'high'
                          ? 'bg-red-100 text-red-800'
                          : job.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : job.priority === 'low'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {job.priority}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Scheduled
                    </label>
                    <div className="text-sm mt-1">
                      {formatDate(job.scheduled_date)}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Duration
                    </label>
                    <div className="text-sm mt-1">
                      {job.estimated_duration_minutes || 'Unknown'} minutes
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="text-sm font-medium text-gray-600">
                      Location
                    </label>
                    <div className="text-sm mt-1">
                      {job.location || 'Not specified'}
                    </div>
                  </div>
                </div>

                {job.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Description
                    </label>
                    <div className="text-sm text-gray-900 mt-1">
                      {job.description}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Job Timeline */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Job Timeline
              </h2>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="text-sm">
                    <span className="font-medium">Job Created</span>
                    <span className="text-gray-600 ml-2">
                      {formatDate(job.created_at)}
                    </span>
                  </div>
                </div>

                {job.started_at && (
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="text-sm">
                      <span className="font-medium">Started</span>
                      <span className="text-gray-600 ml-2">
                        {formatDate(job.started_at)}
                      </span>
                    </div>
                  </div>
                )}

                {job.completed_at && (
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <div className="text-sm">
                      <span className="font-medium">Completed</span>
                      <span className="text-gray-600 ml-2">
                        {formatDate(job.completed_at)}
                      </span>
                    </div>
                  </div>
                )}

                {!job.completed_at && job.status !== 'cancelled' && (
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                    <div className="text-sm text-gray-600">
                      {job.status === 'in-progress'
                        ? 'Completion - In Progress'
                        : 'Completion - Pending'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-6">
          {/* Customer Details */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Customer
              </h2>
              <div className="space-y-2">
                <div className="font-medium">
                  {job.customer_first_name} {job.customer_last_name}
                </div>
                <div className="text-sm text-gray-600">{job.customer_email}</div>
                <div className="text-sm text-gray-600">{job.customer_phone}</div>
              </div>
            </div>
          </Card>

          {/* Services */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {job.is_package_job ? 'Package Services' : 'Service'}
              </h2>
              {renderServiceInfo()}
            </div>
          </Card>

          {/* Update Status */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Update Status
              </h2>
              <div className="space-y-2">
                {job.status !== 'pending' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleStatusUpdate('pending')}
                    disabled={statusUpdating}
                  >
                    Mark as Pending
                  </Button>
                )}

                {job.status !== 'in-progress' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleStatusUpdate('in-progress')}
                    disabled={statusUpdating}
                  >
                    Mark as In Progress
                  </Button>
                )}

                {job.status !== 'completed' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleStatusUpdate('completed')}
                    disabled={statusUpdating}
                  >
                    Mark as Completed
                  </Button>
                )}

                {job.status !== 'cancelled' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => handleStatusUpdate('cancelled')}
                    disabled={statusUpdating}
                  >
                    Cancel Job
                  </Button>
                )}
              </div>

              {statusUpdating && (
                <div className="text-xs text-gray-500 mt-2">
                  Updating status...
                </div>
              )}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Quick Actions
              </h2>
              <div className="space-y-2">
                <Button variant="secondary" size="sm" className="w-full justify-start">
                  Assign Staff
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleCreateInvoice}
                  disabled={invoiceCreating || job.status !== 'completed'}
                >
                  {invoiceCreating ? 'Creating Invoice...' : 'Create Invoice'}
                </Button>

                {job.status !== 'completed' && (
                  <div className="text-xs text-gray-500 mt-1 text-center">
                    Complete this job to create an invoice
                  </div>
                )}
              </div>

              {invoiceCreating && (
                <div className="text-xs text-gray-500 mt-2">
                  Creating invoice...
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
