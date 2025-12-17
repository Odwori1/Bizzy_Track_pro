'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { useJobActions } from '@/hooks/useJobs';
import { apiClient } from '@/lib/api';
import { CheckCircle, AlertCircle, Building } from 'lucide-react';
import { useCurrency } from '@/lib/currency';

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

interface Department {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

interface PackageJobData {
  packageId: string;
  packageName: string;
  selectedServices: Array<{service_id: string; quantity: number}>;
  totalPrice: number;
  totalDuration: number;
  isCustomized: boolean;
}

interface JobFormData {
  title: string;
  description: string;
  customer_id: string;
  service_id: string;
  package_id: string;
  is_package_job: boolean;
  package_configuration: {
    deconstructed_from?: string;
    selected_services?: string[];
    total_price?: number;
    total_duration?: number;
  } | null;
  job_services: Array<{
    service_id: string;
    quantity: number;
    sequence_order: number;
  }>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduled_date: string;
  estimated_duration_minutes: string;
  location: string;
  department_id: string; // NEW: Department assignment field
}

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createJob } = useJobActions();
  const { format } = useCurrency();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]); // NEW: Departments state
  const [dataLoading, setDataLoading] = useState(true);
  const [packageJobData, setPackageJobData] = useState<PackageJobData | null>(null);

  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    description: '',
    customer_id: '',
    service_id: '',
    package_id: '',
    is_package_job: false,
    package_configuration: null,
    job_services: [],
    priority: 'medium',
    scheduled_date: '',
    estimated_duration_minutes: '',
    location: '',
    department_id: '' // NEW: Initialize department_id
  });

  useEffect(() => {
    const source = searchParams.get('source');

    if (source === 'package') {
      const storedData = sessionStorage.getItem('customizedPackage');
      if (storedData) {
        try {
          const packageData: PackageJobData = JSON.parse(storedData);
          setPackageJobData(packageData);

          setFormData(prev => ({
            ...prev,
            title: `${packageData.packageName} (Customized)`,
            description: `Customized package including selected services`,
            package_id: packageData.packageId,
            is_package_job: true,
            package_configuration: {
              deconstructed_from: packageData.packageId,
              selected_services: packageData.selectedServices.map(s => s.service_id),
              total_price: packageData.totalPrice,
              total_duration: packageData.totalDuration
            },
            job_services: packageData.selectedServices.map((service, index) => ({
              service_id: service.service_id,
              quantity: service.quantity || 1,
              sequence_order: index
            })),
            estimated_duration_minutes: packageData.totalDuration.toString()
          }));

          sessionStorage.removeItem('customizedPackage');
        } catch (err) {
          console.error('Failed to parse package data:', err);
        }
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setDataLoading(true);

        const [customersData, servicesData, departmentsData] = await Promise.all([
          apiClient.get<Customer[]>('/api/customers'),
          apiClient.get<Service[]>('/api/services'),
          apiClient.get<Department[]>('/departments?active=true') // NEW: Fetch active departments
        ]);

        setCustomers(customersData);
        setServices(servicesData);
        setDepartments(departmentsData.filter(dept => dept.is_active)); // NEW: Set departments
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
      let jobData: any;

      if (formData.is_package_job) {
        jobData = {
          title: formData.title,
          description: formData.description || undefined,
          customer_id: formData.customer_id,
          package_id: formData.package_id,
          is_package_job: true,
          package_configuration: formData.package_configuration,
          job_services: formData.job_services,
          priority: formData.priority,
          scheduled_date: formData.scheduled_date || undefined,
          estimated_duration_minutes: formData.estimated_duration_minutes ?
            parseInt(formData.estimated_duration_minutes) : undefined,
          location: formData.location
        };
      } else {
        jobData = {
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
      }

      console.log('Submitting job creation:', jobData);

      const result = await createJob(jobData);

      if (result.success) {
        const jobId = result.data?.id || result.data?._id;
        
        if (jobId && formData.department_id) {
          // NEW: Create department assignment if department is selected
          try {
            const assignmentData = {
              job_id: jobId,
              department_id: formData.department_id,
              assignment_type: 'primary',
              priority: formData.priority,
              assigned_to: null,
              estimated_completion_date: formData.scheduled_date 
                ? new Date(new Date(formData.scheduled_date).getTime() + 
                    parseInt(formData.estimated_duration_minutes || '60') * 60000).toISOString()
                : null,
              status: 'assigned',
              notes: `Auto-assigned from job creation. ${formData.description || ''}`,
            };

            console.log('Creating department assignment:', assignmentData);
            await apiClient.post('/job-department-assignments', assignmentData);
            console.log('Department assignment created successfully');
          } catch (assignError: any) {
            console.warn('Failed to create department assignment:', assignError);
            // Don't fail the entire job creation if department assignment fails
            // Job was still created successfully
          }
        }

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

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    const selectedService = services.find(s => s.id === serviceId);

    setFormData({
      ...formData,
      service_id: serviceId,
      estimated_duration_minutes: selectedService
        ? selectedService.duration_minutes.toString()
        : formData.estimated_duration_minutes
    });
  };

  const getServiceNames = () => {
    if (!packageJobData) return [];
    return packageJobData.selectedServices.map(selected => {
      const service = services.find(s => s.id === selected.service_id);
      return service ? service.name : 'Unknown Service';
    });
  };

  // Find selected department for display
  const selectedDepartment = departments.find(dept => dept.id === formData.department_id);

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

      {packageJobData && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-blue-600" size={20} />
            <div className="text-blue-800 font-medium">Package-Based Job</div>
          </div>
          <div className="text-blue-700 text-sm">
            <p>This job is created from package: <strong>{packageJobData.packageName}</strong></p>
            <p className="mt-1">Selected services: {getServiceNames().join(', ')}</p>
            <p>
              {format(packageJobData.totalPrice)} • {packageJobData.totalDuration} minutes
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-red-600" size={20} />
            <div className="text-red-800 text-sm font-medium">Error</div>
          </div>
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
                    disabled={loading || packageJobData !== null}
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
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
                </div>

                {!formData.is_package_job && (
                  <div className="space-y-2">
                    <label htmlFor="service_id" className="block text-sm font-medium text-gray-700">
                      Service *
                    </label>
                    <select
                      id="service_id"
                      name="service_id"
                      value={formData.service_id}
                      onChange={handleServiceChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      required
                      disabled={loading || services.length === 0}
                    >
                      <option value="">Select a service</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} ({format(parseFloat(service.base_price))})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
                    disabled={loading || packageJobData !== null}
                    min="1"
                  />

                  {formData.service_id && !formData.is_package_job && (
                    <p className="text-xs text-gray-500">
                      Default duration: {services.find(s => s.id === formData.service_id)?.duration_minutes} minutes
                    </p>
                  )}

                  {formData.is_package_job && packageJobData && (
                    <p className="text-xs text-blue-600">
                      Package duration: {packageJobData.totalDuration} minutes
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
                    placeholder="Enter location"
                    required
                    disabled={loading}
                  />
                </div>

                {/* NEW: Department Assignment Field */}
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="department_id" className="block text-sm font-medium text-gray-700">
                    Assign to Department (Week 9.2)
                  </label>
                  <div className="space-y-2">
                    <select
                      id="department_id"
                      name="department_id"
                      value={formData.department_id}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      disabled={loading || departments.length === 0}
                    >
                      <option value="">No Department (Assign Later)</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name} ({department.code})
                        </option>
                      ))}
                    </select>
                    
                    {selectedDepartment && (
                      <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-100 rounded text-sm text-green-700">
                        <Building size={16} />
                        <span>Job will be auto-assigned to: <strong>{selectedDepartment.name}</strong></span>
                      </div>
                    )}

                    {departments.length === 0 && (
                      <div className="text-xs text-gray-500">
                        No departments available. Create departments in{' '}
                        <a 
                          href="/dashboard/coordination/departments" 
                          className="text-blue-600 hover:underline"
                        >
                          Coordination → Departments
                        </a>
                      </div>
                    )}
                  </div>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Enter job description"
                    disabled={loading || packageJobData !== null}
                  />
                </div>
              </div>

              {/* Week 9.2 Integration Info */}
              {formData.department_id && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Building className="text-blue-500 mt-0.5" size={20} />
                    <div>
                      <h4 className="font-medium text-blue-800 mb-1">Week 9.2 Department Coordination</h4>
                      <p className="text-sm text-blue-700 mb-2">
                        This job will be integrated with the hospital-style workflow system:
                      </p>
                      <ul className="text-xs text-blue-600 space-y-1">
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                          <span>Auto-assigned to department workflow dashboard</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                          <span>Ready for department handoffs and coordination</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                          <span>Will appear in consolidated billing</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                          <span>Tracks department performance metrics</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Link href="/dashboard/management/jobs">
                  <Button type="button" variant="secondary" disabled={loading}>
                    Cancel
                  </Button>
                </Link>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={loading || !formData.customer_id || (!formData.service_id && !formData.is_package_job)}
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
