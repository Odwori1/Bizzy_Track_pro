'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { departmentApi } from '@/lib/api/department';
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

interface AssignmentFormData {
  assigned_to: string;
  assignment_type: 'primary' | 'collaboration' | 'review';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimated_hours: string;
  scheduled_start: string;
  scheduled_end: string;
  notes: string;
  sla_deadline: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'blocked';
}

export default function EditAssignmentPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignment, setAssignment] = useState<any>(null);

  const [formData, setFormData] = useState<AssignmentFormData>({
    assigned_to: '',
    assignment_type: 'primary',
    priority: 'medium',
    estimated_hours: '',
    scheduled_start: '',
    scheduled_end: '',
    notes: '',
    sla_deadline: '',
    status: 'assigned',
  });

  // Filter to show only active departments
  const activeDepartments = departments.filter(dept => dept.is_active);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Loading data for assignment edit page, ID:', assignmentId);

      // 1. Load the assignment
      const assignmentData = await departmentApi.getJobAssignmentById(assignmentId);
      console.log('Assignment loaded:', assignmentData);
      setAssignment(assignmentData);

      // Set form data from assignment
      setFormData({
        assigned_to: assignmentData.assigned_to || '',
        assignment_type: assignmentData.assignment_type || 'primary',
        priority: assignmentData.priority || 'medium',
        estimated_hours: assignmentData.estimated_hours?.toString() || '',
        scheduled_start: assignmentData.scheduled_start || '',
        scheduled_end: assignmentData.scheduled_end || '',
        notes: assignmentData.notes || '',
        sla_deadline: assignmentData.sla_deadline || '',
        status: assignmentData.status || 'assigned',
      });

      // 2. Fetch departments for dropdown
      const departmentsData = await departmentApi.getDepartments({
        include_inactive: false,
        _t: Date.now()
      });
      console.log('Departments loaded:', departmentsData.length);
      setDepartments(departmentsData);

      // 3. Load jobs
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

      // 4. Load staff
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

    } catch (err: any) {
      console.error('Error loading data:', err);
      setError(`Failed to load assignment data: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  // Load data on component mount
  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
  }, [loadData, assignmentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      console.log('Updating assignment with:', formData);

      const updateData = {
        assigned_to: formData.assigned_to || null,
        assignment_type: formData.assignment_type,
        priority: formData.priority,
        estimated_hours: formData.estimated_hours ? parseFloat(formData.estimated_hours) : null,
        scheduled_start: formData.scheduled_start || null,
        scheduled_end: formData.scheduled_end || null,
        notes: formData.notes || null,
        sla_deadline: formData.sla_deadline || null,
        status: formData.status,
      };

      // Update the assignment
      const response = await departmentApi.updateJobAssignment(assignmentId, updateData);
      console.log('Assignment updated:', response);

      // Navigate back to the assignment detail page
      router.push(`/dashboard/coordination/workflow/${assignmentId}`);
    } catch (err: any) {
      console.error('Error updating assignment:', err);
      setError(err.message || 'Failed to update assignment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading assignment data...</div>
          <div className="mt-2 text-sm text-gray-400">
            Loading assignment details...
          </div>
        </div>
      </div>
    );
  }

  if (error && !assignment) {
    return (
      <div className="p-6">
        <Card>
          <div className="p-6 text-center">
            <div className="text-red-600 mb-4">Error: {error}</div>
            <div className="space-x-3">
              <Button onClick={loadData}>Retry</Button>
              <Link href="/dashboard/coordination/workflow">
                <Button variant="outline">Back to Workflow</Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-6">
        <Card>
          <div className="p-6 text-center">
            <div className="text-red-600 mb-4">Assignment not found</div>
            <Link href="/dashboard/coordination/workflow">
              <Button variant="outline">Back to Workflow</Button>
            </Link>
          </div>
        </Card>
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
              <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
                <Button variant="ghost" size="sm">
                  ← Back to Assignment
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Edit Assignment</h1>
            </div>
            <p className="text-gray-600 mt-1">
              Update assignment details for {assignment.job_number || 'Unknown Job'}
            </p>
          </div>
        </div>
      </div>

      {/* Current Assignment Info */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Job:</span>
              <span className="ml-2 font-medium">
                {assignment.job_number}: {assignment.job_title || 'Untitled Job'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Department:</span>
              <span className="ml-2 font-medium">
                {assignment.department_name} ({assignment.department_code})
              </span>
            </div>
            <div>
              <span className="text-gray-500">Created:</span>
              <span className="ml-2 font-medium">
                {new Date(assignment.created_at).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Assigned By:</span>
              <span className="ml-2 font-medium">
                {assignment.assigned_by_name || 'Unknown'}
              </span>
            </div>
          </div>
        </div>
      </Card>

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
              {/* Assigned To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assigned To
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

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    status: e.target.value as 'assigned' | 'in_progress' | 'completed' | 'blocked'
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>

              {/* Estimated Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Hours
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

              {/* SLA Deadline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SLA Deadline
                </label>
                <input
                  type="datetime-local"
                  value={formData.sla_deadline}
                  onChange={(e) => setFormData(prev => ({ ...prev, sla_deadline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Scheduled Start */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scheduled Start
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
                  Scheduled End
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_end}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduled_end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Additional instructions or information..."
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t">
              <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
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
                disabled={submitting}
              >
                {submitting ? 'Updating...' : 'Update Assignment'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
