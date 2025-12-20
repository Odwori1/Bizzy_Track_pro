'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useCurrency } from '@/lib/currency';
import { departmentApi } from '@/lib/api/department';
import { Department, DepartmentBillingFormData, JobDepartmentAssignment } from '@/types/department';

interface BillingEntryFormProps {
  departmentId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: Partial<DepartmentBillingFormData>;
}

interface Job {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  customer_first_name?: string;
  customer_last_name?: string;
  service_name?: string;
  service_base_price?: string;
  base_price?: string;
  final_price?: string;
  status: string;
  department_assignments?: JobDepartmentAssignment[];
}

export const BillingEntryForm: React.FC<BillingEntryFormProps> = ({
  departmentId,
  onSuccess,
  onCancel,
  initialData,
}) => {
  const { format } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [availableDepartments, setAvailableDepartments] = useState<Department[]>([]);

  const [formData, setFormData] = useState<DepartmentBillingFormData>({
    department_id: departmentId || initialData?.department_id || '',
    job_id: initialData?.job_id || '',
    description: initialData?.description || '',
    quantity: initialData?.quantity || 1,
    unit_price: initialData?.unit_price || 0,
    total_amount: initialData?.total_amount || 0,
    billing_type: initialData?.billing_type || 'service',
    cost_amount: initialData?.cost_amount,
    tax_rate: initialData?.tax_rate || 0,
    billing_date: initialData?.billing_date || new Date().toISOString().split('T')[0],
  });

  // Load departments and jobs
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingJobs(true);
        setError(null);

        // Load departments
        try {
          const depts = await departmentApi.getDepartments();
          setDepartments(depts);
          // Initially set available departments to all departments
          setAvailableDepartments(depts);
        } catch (deptError) {
          console.error('Failed to load departments:', deptError);
          // Continue even if departments fail to load
        }

        // Load jobs from the new /jobs/for-billing endpoint
        try {
          // Use the new department API method
          const jobsArray = await departmentApi.getJobsForBilling();
          
          // Transform the API response to our Job interface
          const transformedJobs: Job[] = jobsArray.map((job: any) => ({
            id: job.id,
            job_number: job.job_number || 'Unknown',
            title: job.title || 'No title',
            customer_name: job.customer_first_name && job.customer_last_name
              ? `${job.customer_first_name} ${job.customer_last_name}`
              : 'Customer',
            customer_first_name: job.customer_first_name,
            customer_last_name: job.customer_last_name,
            service_name: job.service_name,
            service_base_price: job.service_base_price,
            base_price: job.base_price,
            final_price: job.final_price,
            status: job.status || 'unknown',
          }));

          // Filter to show only in-progress and completed jobs
          const filteredJobs = transformedJobs.filter(job =>
            job.status === 'in-progress' ||
            job.status === 'completed' ||
            job.status === 'pending'
          );

          setJobs(filteredJobs);

          // If initial data has job_id, set the selected job
          if (initialData?.job_id) {
            const foundJob = filteredJobs.find(job => job.id === initialData.job_id);
            if (foundJob) {
              setSelectedJob(foundJob);
              // If we need department assignments for this job, fetch them
              fetchDepartmentAssignmentsForJob(foundJob.id);
            }
          }

        } catch (jobsError) {
          console.error('Failed to load jobs from /jobs/for-billing:', jobsError);
          
          // Fallback: Try to get jobs from department assignments if main API fails
          try {
            const jobAssignments = await departmentApi.getJobAssignments({
              status: 'in_progress,completed'
            });

            // Create a map of unique jobs
            const uniqueJobs: Record<string, Job> = {};

            jobAssignments.forEach((assignment: JobDepartmentAssignment) => {
              if (!uniqueJobs[assignment.job_id]) {
                uniqueJobs[assignment.job_id] = {
                  id: assignment.job_id,
                  job_number: assignment.job_number || 'Unknown',
                  title: assignment.job_title || 'No title',
                  customer_name: 'Customer',
                  status: assignment.job_status || 'unknown',
                  department_assignments: []
                };
              }

              // Add department assignment to the job
              if (uniqueJobs[assignment.job_id].department_assignments) {
                uniqueJobs[assignment.job_id].department_assignments!.push(assignment);
              }
            });

            setJobs(Object.values(uniqueJobs));
          } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
            setError('Failed to load jobs. Please check your connection and try again.');
          }
        }

      } catch (error) {
        console.error('Failed to load data:', error);
        setError('Failed to load jobs and departments. Please try again.');
      } finally {
        setLoadingJobs(false);
      }
    };

    loadData();
  }, [initialData]);

  // Fetch department assignments for a specific job
  const fetchDepartmentAssignmentsForJob = async (jobId: string) => {
    try {
      const assignments = await departmentApi.getJobAssignments({
        job_id: jobId
      });

      // Update the selected job with department assignments
      setSelectedJob(prev => prev ? {
        ...prev,
        department_assignments: assignments
      } : null);

      // Update available departments based on assignments
      if (assignments.length > 0) {
        const assignedDeptIds = assignments.map(assignment => assignment.department_id);
        const availableDepts = departments.filter(dept => assignedDeptIds.includes(dept.id));
        setAvailableDepartments(availableDepts);

        // If only one department is assigned, auto-select it
        if (availableDepts.length === 1 && !formData.department_id) {
          setFormData(prev => ({
            ...prev,
            department_id: availableDepts[0].id
          }));
        }
      } else {
        // If no assignments, show all departments
        setAvailableDepartments(departments);
      }
    } catch (error) {
      console.error('Failed to fetch department assignments:', error);
      // If we can't get assignments, show all departments
      setAvailableDepartments(departments);
    }
  };

  // Calculate total when quantity or unit price changes
  useEffect(() => {
    const total = (formData.quantity || 1) * (formData.unit_price || 0);
    setFormData(prev => ({
      ...prev,
      total_amount: total
    }));
  }, [formData.quantity, formData.unit_price]);

  const handleJobChange = async (jobId: string) => {
    const selected = jobs.find(job => job.id === jobId);
    setSelectedJob(selected || null);

    setFormData(prev => ({
      ...prev,
      job_id: jobId,
      description: selected ? `Work for ${selected.job_number}: ${selected.title}` : prev.description
    }));

    if (selected) {
      // Fetch department assignments for the selected job
      await fetchDepartmentAssignmentsForJob(selected.id);
    } else {
      // Reset to all departments if no job selected
      setAvailableDepartments(departments);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: value === '' ? 0 : parseFloat(value)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.department_id) {
        throw new Error('Please select a department');
      }
      if (!formData.job_id) {
        throw new Error('Please select a job');
      }
      if (!formData.description.trim()) {
        throw new Error('Please enter a description');
      }
      if (formData.unit_price <= 0) {
        throw new Error('Unit price must be greater than 0');
      }

      // Calculate total if not provided
      const totalAmount = formData.total_amount || (formData.quantity || 1) * formData.unit_price;

      // Create billing entry
      await departmentApi.allocateCharge({
        department_id: formData.department_id,
        job_id: formData.job_id,
        description: formData.description,
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        total_amount: totalAmount,
        billing_type: formData.billing_type as any,
        cost_amount: formData.cost_amount,
        tax_rate: formData.tax_rate,
      });

      // Success
      if (onSuccess) {
        onSuccess();
      }

      // Show success message
      alert('Billing entry created successfully!');

      // Reset form
      setFormData({
        department_id: departmentId || '',
        job_id: '',
        description: '',
        quantity: 1,
        unit_price: 0,
        total_amount: 0,
        billing_type: 'service',
        billing_date: new Date().toISOString().split('T')[0],
      });
      setSelectedJob(null);
      setAvailableDepartments(departments);

    } catch (error: any) {
      console.error('Failed to create billing entry:', error);
      setError(error.message || 'Failed to create billing entry');
    } finally {
      setLoading(false);
    }
  };

  // Get suggested unit price based on job and department
  const getSuggestedUnitPrice = () => {
    if (!selectedJob || !formData.department_id) return 0;

    // Try to use the job's service price if available
    const servicePrice = parseFloat(selectedJob.service_base_price || selectedJob.base_price || '0');
    if (servicePrice > 0) {
      // For hourly work, suggest an hourly rate
      if (formData.billing_type === 'hourly') {
        return 150; // Default hourly rate
      }
      // For fixed fee, suggest a portion of the service price
      return servicePrice * 0.3; // 30% of service price
    }

    return 150; // Default hourly rate
  };

  // Auto-fill unit price when department is selected
  useEffect(() => {
    if (formData.department_id && selectedJob && formData.unit_price === 0) {
      const suggestedPrice = getSuggestedUnitPrice();
      setFormData(prev => ({
        ...prev,
        unit_price: suggestedPrice
      }));
    }
  }, [formData.department_id, selectedJob, formData.billing_type]);

  // Calculate the job's service price for display
  const getJobServicePrice = () => {
    if (!selectedJob) return 0;
    return parseFloat(
      selectedJob.service_base_price ||
      selectedJob.base_price ||
      selectedJob.final_price ||
      '0'
    );
  };

  const servicePrice = getJobServicePrice();

  return (
    <Card>
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {initialData ? 'Edit Billing Entry' : 'Create Billing Entry'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {loadingJobs ? (
          <div className="text-center py-8">
            <div className="text-gray-500">Loading jobs and departments...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Job Selection - Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Job *
              </label>
              <select
                name="job_id"
                value={formData.job_id}
                onChange={(e) => handleJobChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loadingJobs}
              >
                <option value="">Select a job</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>
                    {job.job_number}: {job.title} ({job.customer_name})
                  </option>
                ))}
              </select>
              {jobs.length === 0 && !loadingJobs && (
                <p className="mt-1 text-xs text-yellow-600">
                  No jobs found. Please create a job first or check your connection.
                </p>
              )}
            </div>

            {/* Job Details Card (Shows when job is selected) */}
            {selectedJob && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <h4 className="font-medium text-blue-900 mb-2">Selected Job Details</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Job Number:</span>
                    <span className="ml-2 font-medium">{selectedJob.job_number}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Customer:</span>
                    <span className="ml-2 font-medium">{selectedJob.customer_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                      selectedJob.status === 'completed' ? 'bg-green-100 text-green-800' :
                      selectedJob.status === 'in-progress' ? 'bg-yellow-100 text-yellow-800' :
                      selectedJob.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedJob.status}
                    </span>
                  </div>
                  {selectedJob.service_name && (
                    <div>
                      <span className="text-gray-600">Service:</span>
                      <span className="ml-2 font-medium">{selectedJob.service_name}</span>
                    </div>
                  )}
                  {servicePrice > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Service Price:</span>
                      <span className="ml-2 font-bold text-blue-700">{format(servicePrice)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Department Selection - Filtered by selected job */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Department *
              </label>
              <select
                name="department_id"
                value={formData.department_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={!!departmentId}
              >
                <option value="">Select a department</option>
                {availableDepartments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
              {availableDepartments.length === 0 && selectedJob && (
                <p className="mt-1 text-xs text-yellow-600">
                  No departments assigned to this job. Showing all departments.
                </p>
              )}
            </div>

            {/* Description with auto-suggestion */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={selectedJob ? `Describe work for ${selectedJob.job_number}...` : 'Describe the work performed...'}
                required
              />
              {selectedJob && (
                <p className="mt-1 text-xs text-gray-500">
                  Suggested: Work for {selectedJob.job_number}: {selectedJob.title}
                </p>
              )}
            </div>

            {/* Billing Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing Type
              </label>
              <select
                name="billing_type"
                value={formData.billing_type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="service">Service</option>
                <option value="hourly">Hourly</option>
                <option value="fixed_fee">Fixed Fee</option>
                <option value="material">Material</option>
                <option value="labor">Labor</option>
              </select>
            </div>

            {/* Quantity and Unit Price with suggestions */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {formData.billing_type === 'hourly' && (
                  <p className="mt-1 text-xs text-gray-500">Hours worked</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Price *
                  {formData.department_id && selectedJob && (
                    <span className="ml-2 text-xs text-green-600">
                      (Suggested: {format(getSuggestedUnitPrice())})
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  name="unit_price"
                  value={formData.unit_price}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                {formData.billing_type === 'hourly' && (
                  <p className="mt-1 text-xs text-gray-500">Hourly rate</p>
                )}
              </div>
            </div>

            {/* Total Amount (Calculated) */}
            <div className="bg-gray-50 p-4 rounded">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Total Amount:</span>
                <span className="text-lg font-bold text-gray-900">
                  {format(formData.total_amount)}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Calculated: {formData.quantity} × {format(formData.unit_price)} = {format(formData.total_amount)}
              </div>
              {servicePrice > 0 && formData.total_amount > 0 && (
                <div className="mt-2 text-xs">
                  <span className="text-gray-600">Service Price: {format(servicePrice)}</span>
                  <span className={`ml-2 font-medium ${
                    (servicePrice - formData.total_amount) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    | Remaining: {format(servicePrice - formData.total_amount)}
                  </span>
                </div>
              )}
            </div>

            {/* Cost Amount (Optional - for internal tracking) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Internal Cost (Optional)
              </label>
              <input
                type="number"
                name="cost_amount"
                value={formData.cost_amount || ''}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="Actual cost to the department"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                For internal profit calculation. Customer doesn't see this.
                {formData.cost_amount && formData.total_amount > 0 && (
                  <span className={`ml-2 font-medium ${
                    (formData.total_amount - (formData.cost_amount || 0)) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    Profit: {format(formData.total_amount - (formData.cost_amount || 0))}
                  </span>
                )}
              </p>
            </div>

            {/* Billing Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing Date
              </label>
              <input
                type="date"
                name="billing_date"
                value={formData.billing_date}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Creating...' : initialData ? 'Update Entry' : 'Create Billing Entry'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
};
