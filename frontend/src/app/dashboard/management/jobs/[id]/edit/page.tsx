'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { useJob, useJobActions } from '@/hooks/useJobs';
import { apiClient } from '@/lib/api';
import { JobUpdateRequest } from '@/types/jobs';
import { useCurrency } from '@/lib/currency'; // ✅ REPLACED currency hook

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Service {
  id: string;
  name: string;
  base_price: string;
  duration_minutes: number;
}

interface JobFormData {
  title: string;
  description: string;
  customer_id: string;
  service_id: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduled_date: string;
  estimated_duration_minutes: string;
  location: string;
}

interface EditJobPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditJobPage({ params }: EditJobPageProps) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const { job, loading: jobLoading, error: jobError, refetch } = useJob(jobId || undefined);
  const { updateJob } = useJobActions();

  const { format } = useCurrency(); // ✅ FIXED

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    description: '',
    customer_id: '',
    service_id: '',
    priority: 'medium',
    scheduled_date: '',
    estimated_duration_minutes: '',
    location: ''
  });

  useEffect(() => {
    const unwrapParams = async () => {
      const unwrapped = await params;
      setJobId(unwrapped.id);
    };
    unwrapParams();
  }, [params]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setDataLoading(true);

        const [customersData, servicesData] = await Promise.all([
          apiClient.get<Customer[]>('/api/customers'),
          apiClient.get<Service[]>('/api/services')
        ]);

        setCustomers(customersData);
        setServices(servicesData);
      } catch (err) {
        setError('Failed to load customers and services');
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (job) {
      setFormData({
        title: job.title || '',
        description: job.description || '',
        customer_id: job.customer_id || '',
        service_id: job.service_id || '',
        priority: job.priority || 'medium',
        scheduled_date: job.scheduled_date
          ? new Date(job.scheduled_date.utc).toISOString().slice(0, 16)
          : '',
        estimated_duration_minutes: job.estimated_duration_minutes
          ? job.estimated_duration_minutes.toString()
          : '',
        location: job.location || ''
      });
    }
  }, [job]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId) return;

    setLoading(true);
    setError(null);

    try {
      const jobData: JobUpdateRequest = {
        title: formData.title,
        description: formData.description || undefined,
        customer_id: formData.customer_id,
        service_id: formData.service_id,
        priority: formData.priority,
        scheduled_date: formData.scheduled_date || undefined,
        estimated_duration_minutes: formData.estimated_duration_minutes
          ? parseInt(formData.estimated_duration_minutes)
          : undefined,
        location: formData.location || undefined
      };

      const result = await updateJob(jobId, jobData);

      if (result.success) {
        router.push(`/dashboard/management/jobs/${jobId}`);
        router.refresh();
      } else {
        setError(result.error || 'Failed to update job');
      }
    } catch (err) {
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    const selected = services.find((s) => s.id === serviceId);

    setFormData({
      ...formData,
      service_id: serviceId,
      estimated_duration_minutes: selected
        ? selected.duration_minutes.toString()
        : formData.estimated_duration_minutes
    });
  };

  if (!jobId || jobLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-500">Loading job data...</div>
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Not Found</h1>
            <p className="text-gray-600">Unable to load job for editing</p>
          </div>
          <Link href="/dashboard/management/jobs">
            <Button variant="secondary">Back to Jobs</Button>
          </Link>
        </div>

        <Card>
          <div className="p-6 text-center">
            <div className="text-red-600 mb-4">Error loading job: {jobError}</div>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Job</h1>
          <p className="text-gray-600">Update job #{job.job_number}</p>
        </div>

        <Link href={`/dashboard/management/jobs/${jobId}`}>
          <Button variant="secondary" disabled={loading}>
            Back to Job Details
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md">
          {error}
        </div>
      )}

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-6">Job Details</h2>

          {dataLoading ? (
            <div className="text-center text-gray-500 py-8">Loading data...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="space-y-2">
                  <label className="block text-sm font-medium">Job Title *</label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium">Priority *</label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="form-select-input"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Customer */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Customer *</label>
                  <select
                    id="customer_id"
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    required
                    disabled={loading}
                    className="form-select-input"
                  >
                    <option value="">Select a customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Service */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Service *</label>
                  <select
                    id="service_id"
                    name="service_id"
                    value={formData.service_id}
                    onChange={handleServiceChange}
                    required
                    disabled={loading}
                    className="form-select-input"
                  >
                    <option value="">Select a service</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({format(parseFloat(s.base_price))}) {/* ✅ FIXED */}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scheduled Date */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Scheduled Date</label>
                  <Input
                    type="datetime-local"
                    id="scheduled_date"
                    name="scheduled_date"
                    value={formData.scheduled_date}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">
                    Estimated Duration (minutes) *
                  </label>
                  <Input
                    type="number"
                    id="estimated_duration_minutes"
                    name="estimated_duration_minutes"
                    value={formData.estimated_duration_minutes}
                    onChange={handleChange}
                    min="1"
                    required
                    disabled={loading}
                  />
                </div>

                {/* Location */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium">Location *</label>
                  <Input
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    required
                    disabled={loading}
                  />
                </div>

                {/* Description */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    className="form-textarea-input"
                    disabled={loading}
                  />
                </div>

              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Link href={`/dashboard/management/jobs/${jobId}`}>
                  <Button type="button" variant="secondary" disabled={loading}>
                    Cancel
                  </Button>
                </Link>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    loading || !formData.customer_id || !formData.service_id
                  }
                >
                  {loading ? 'Updating Job...' : 'Update Job'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
