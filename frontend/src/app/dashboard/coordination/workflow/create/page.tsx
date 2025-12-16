'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { departmentApi } from '@/lib/api/department'; // Use API directly
import { apiClient } from '@/lib/api';
import { Department } from '@/types/department';

interface Job {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  status: string;
}

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department_id: string | null;
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  const [formData, setFormData] = useState({
    job_id: '',
    department_id: '',
    assigned_to: '',
    assignment_type: 'primary' as 'primary' | 'collaboration' | 'review',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    estimated_hours: '',
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
    sla_deadline: '',
  });

  // Filter to show only active departments
  const activeDepartments = departments.filter(dept => dept.is_active);

  // Load data - FIXED VERSION (NO CIRCULAR LOOP)
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Loading data for workflow create page...');

      // 1. Fetch departments directly (NO HOOK, NO CIRCULAR DEPENDENCY)
      const departmentsData = await departmentApi.getDepartments({
        include_inactive: false,
        _t: Date.now() // Cache busting
      });
      console.log('Departments loaded:', departmentsData.length);
      setDepartments(departmentsData);

      // 2. Load jobs
      const jobsResponse = await apiClient.get('/jobs');
      const jobsData = Array.isArray(jobsResponse) ? jobsResponse : [];
      console.log('Jobs loaded:', jobsData.length);

      const formattedJobs = jobsData.map((job: any) => ({
        id: job.id,
        job_number: job.job_number || `JOB-${job.id.substring(0, 8)}`,
        title: job.title || 'Untitled Job',
        customer_name: `${job.customer_first_name || ''} ${job.customer_last_name || ''}`.trim() || 'Unknown Customer',
        status: job.status || 'pending'
      }));
      setJobs(formattedJobs);

      // 3. Load staff
      const staffResponse = await apiClient.get('/staff');
      const staffData = Array.isArray(staffResponse) ? staffResponse : [];
      console.log('Staff loaded:', staffData.length);

      const formattedStaff = staffData.map((staffMember: any) => ({
        id: staffMember.id,
        full_name: staffMember.full_name || `${staffMember.first_name || ''} ${staffMember.last_name || ''}`.trim() || 'Unknown Staff',
        email: staffMember.email || 'No email',
        role: staffMember.role || 'staff',
        department_id: staffMember.department_id || null
      }));
      setStaff(formattedStaff);

      // Set defaults if data is available
      if (departmentsData.length > 0 && !formData.department_id) {
        setFormData(prev => ({
          ...prev,
          department_id: departmentsData[0].id
        }));
        console.log('Set default department:', departmentsData[0].name);
      }

      if (formattedJobs.length > 0 && !formData.job_id) {
        setFormData(prev => ({
          ...prev,
          job_id: formattedJobs[0].id
        }));
        console.log('Set default job:', formattedJobs[0].job_number);
      }

    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(`Failed to load required data: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, []); // EMPTY DEPENDENCY ARRAY - prevents infinite re-runs

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      console.log('Creating assignment with:', formData);

      const assignmentData = {
        job_id: formData.job_id,
        department_id: formData.department_id,
        assigned_to: formData.assigned_to || null,
        assignment_type: formData.assignment_type,
        priority: formData.priority,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        scheduled_start: formData.scheduled_start || null,
        scheduled_end: formData.scheduled_end || null,
        notes: formData.notes || null,
        sla_deadline: formData.sla_deadline || null,
      };

      // Use direct API call instead of hook
      const response = await departmentApi.createJobAssignment(assignmentData);
      console.log('Assignment created:', response);

      router.push('/dashboard/coordination/workflow');
    } catch (err: any) {
      console.error('Error creating assignment:', err);
      setError(err.message || 'Failed to create assignment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading assignment form...</div>
          <div className="mt-2 text-sm text-gray-400">
            Fetching departments, jobs, and staff...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <Link href="/dashboard/coordination/workflow">
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Create Job Assignment</h1>
            </div>
            <p className="text-gray-600 mt-1">
              Assign a job to a department for processing
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <Card>
        <div className="p-6">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Job Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job *
                </label>
                <select
                  value={formData.job_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, job_id: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a job...</option>
                  {jobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.job_number}: {job.title} {job.customer_name ? `(${job.customer_name})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {jobs.length} job{jobs.length !== 1 ? 's' : ''} available
                </p>
              </div>

              {/* Department Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department *
                </label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, department_id: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a department...</option>
                  {activeDepartments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {activeDepartments.length} active department{activeDepartments.length !== 1 ? 's' : ''} available
                </p>
                {activeDepartments.length === 0 && (
                  <p className="mt-1 text-xs text-red-500">
                    No active departments found. Create departments first in Coordination → Departments.
                  </p>
                )}
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assigned To (Optional)
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {staff.map(person => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} ({person.email})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {staff.length} staff member{staff.length !== 1 ? 's' : ''} available
                </p>
              </div>

              {/* Assignment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assignment Type
                </label>
                <select
                  value={formData.assignment_type}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    assignment_type: e.target.value as 'primary' | 'collaboration' | 'review'
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="primary">Primary</option>
                  <option value="collaboration">Collaboration</option>
                  <option value="review">Review</option>
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    priority: e.target.value as 'low' | 'medium' | 'high' | 'urgent'
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Estimated Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Hours (Optional)
                </label>
                <input
                  type="number"
                  value={formData.estimated_hours}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimated_hours: e.target.value }))}
                  min="0"
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 8.0"
                />
              </div>

              {/* Scheduled Start */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scheduled Start (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_start}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_start: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Scheduled End */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scheduled End (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_end}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* SLA Deadline */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SLA Deadline (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.sla_deadline}
                  onChange={(e) => setFormData(prev => ({ ...prev, sla_deadline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Service Level Agreement deadline for this assignment
                </p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional instructions or information..."
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t">
              <Link href="/dashboard/coordination/workflow">
                <Button
                  type="button"
                  variant="outline"
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={!formData.job_id || !formData.department_id || submitting}
              >
                {submitting ? 'Creating...' : 'Create Assignment'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
