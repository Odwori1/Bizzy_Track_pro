'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { useJobActions } from '@/hooks/useJobs';
import { apiClient } from '@/lib/api';

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

export default function NewJobPage() {
  const router = useRouter();
  const { createJob } = useJobActions();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Fetch customers and services on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setDataLoading(true);
        
        // Fetch customers and services in parallel
        const [customersData, servicesData] = await Promise.all([
          apiClient.get<Customer[]>('/api/customers'),
          apiClient.get<Service[]>('/api/services')
        ]);

        setCustomers(customersData);
        setServices(servicesData);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load customers and services');
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Prepare the data for API (matching backend expectations)
      const jobData = {
        title: formData.title,
        description: formData.description || undefined,
        customer_id: formData.customer_id,
        service_id: formData.service_id,
        priority: formData.priority,
        scheduled_date: formData.scheduled_date || undefined,
        estimated_duration_minutes: formData.estimated_duration_minutes ? 
          parseInt(formData.estimated_duration_minutes) : undefined,
        location: formData.location
      };

      console.log('Submitting job creation:', jobData);

      const result = await createJob(jobData);

      if (result.success) {
        // Redirect to jobs list on success
        router.push('/dashboard/management/jobs');
        router.refresh();
      } else {
        setError(result.error || 'Failed to create job. Please try again.');
      }
    } catch (err) {
      console.error('Job creation error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Update estimated duration when service is selected
  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    const selectedService = services.find(s => s.id === serviceId);
    
    setFormData({
      ...formData,
      service_id: serviceId,
      estimated_duration_minutes: selectedService ? selectedService.duration_minutes.toString() : formData.estimated_duration_minutes
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Job</h1>
          <p className="text-gray-600">Add a new job to the system</p>
        </div>
        <Link href="/dashboard/management/jobs">
          <Button variant="secondary" disabled={loading}>
            Back to Jobs
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
        </div>
      )}

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Job Details</h2>
          
          {dataLoading ? (
            <div className="text-center py-8">
              <div className="text-gray-500">Loading customers and services...</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                    Job Title *
                  </label>
                  <Input
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Enter job title"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
                    Priority *
                  </label>
                  <select
                    id="priority"
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    required
                    disabled={loading}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="customer_id" className="block text-sm font-medium text-gray-700">
                    Customer *
                  </label>
                  <select
                    id="customer_id"
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    required
                    disabled={loading || customers.length === 0}
                  >
                    <option value="">Select a customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.first_name} {customer.last_name} ({customer.email})
                      </option>
                    ))}
                  </select>
                  {customers.length === 0 && !dataLoading && (
                    <p className="text-sm text-yellow-600">No customers found. Please create customers first.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="service_id" className="block text-sm font-medium text-gray-700">
                    Service *
                  </label>
                  <select
                    id="service_id"
                    name="service_id"
                    value={formData.service_id}
                    onChange={handleServiceChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    required
                    disabled={loading || services.length === 0}
                  >
                    <option value="">Select a service</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} (${service.base_price})
                      </option>
                    ))}
                  </select>
                  {services.length === 0 && !dataLoading && (
                    <p className="text-sm text-yellow-600">No services found. Please create services first.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="scheduled_date" className="block text-sm font-medium text-gray-700">
                    Scheduled Date
                  </label>
                  <Input
                    type="datetime-local"
                    id="scheduled_date"
                    name="scheduled_date"
                    value={formData.scheduled_date}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="estimated_duration_minutes" className="block text-sm font-medium text-gray-700">
                    Estimated Duration (minutes) *
                  </label>
                  <Input
                    type="number"
                    id="estimated_duration_minutes"
                    name="estimated_duration_minutes"
                    value={formData.estimated_duration_minutes}
                    onChange={handleChange}
                    placeholder="60"
                    required
                    disabled={loading}
                    min="1"
                  />
                  {formData.service_id && (
                    <p className="text-xs text-gray-500">
                      Default duration: {services.find(s => s.id === formData.service_id)?.duration_minutes} minutes
                    </p>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                    Location *
                  </label>
                  <Input
                    id="location"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="Enter location (e.g., Main Salon, Customer Site, etc.)"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    placeholder="Enter job description, special instructions, or customer requirements..."
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Link href="/dashboard/management/jobs">
                  <Button type="button" variant="secondary" disabled={loading}>
                    Cancel
                  </Button>
                </Link>
                <Button 
                  type="submit" 
                  variant="primary" 
                  disabled={loading || !formData.customer_id || !formData.service_id}
                >
                  {loading ? 'Creating Job...' : 'Create Job'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
