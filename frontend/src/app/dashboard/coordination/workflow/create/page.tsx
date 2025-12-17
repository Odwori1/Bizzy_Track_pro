'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { apiClient } from '@/lib/api';
import { AlertCircle, AlertTriangle, ArrowRight, Users } from 'lucide-react';

interface Job {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  status: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department_id: string | null;
}

interface ExistingAssignment {
  id: string;
  department_id: string;
  department_name: string;
  status: string;
  assignment_type: string;
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAssignments, setExistingAssignments] = useState<ExistingAssignment[]>([]);
  const [primaryAssignment, setPrimaryAssignment] = useState<ExistingAssignment | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

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

  // Load data on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setDataError(null);

    try {
      console.log('Fetching data for workflow create page...');

      // Fetch departments
      try {
        const departmentsData = await apiClient.get<Department[]>('/departments');
        console.log('Departments loaded:', departmentsData?.length || 0);
        setDepartments(departmentsData || []);
      } catch (deptError) {
        console.error('Failed to fetch departments:', deptError);
        setDepartments([]);
      }

      // Fetch jobs
      try {
        const jobsData = await apiClient.get<any[]>('/jobs?limit=100');
        console.log('Jobs loaded:', jobsData?.length || 0);
        
        const formattedJobs = (jobsData || []).map((job: any) => ({
          id: job.id,
          job_number: job.job_number || `JOB-${job.id?.substring(0, 8) || '000'}`,
          title: job.title || 'Untitled Job',
          customer_name: `${job.customer_first_name || ''} ${job.customer_last_name || ''}`.trim() || 'Unknown Customer',
          status: job.status || 'pending'
        }));
        setJobs(formattedJobs);
      } catch (jobError) {
        console.error('Failed to fetch jobs:', jobError);
        setJobs([]);
      }

      // Fetch staff
      try {
        const staffData = await apiClient.get<any[]>('/staff');
        console.log('Staff loaded:', staffData?.length || 0);
        
        const formattedStaff = (staffData || []).map((staffMember: any) => ({
          id: staffMember.id,
          full_name: staffMember.full_name || `${staffMember.first_name || ''} ${staffMember.last_name || ''}`.trim() || 'Unknown Staff',
          email: staffMember.email || 'No email',
          role: staffMember.role || 'staff',
          department_id: staffMember.department_id || null
        }));
        setStaff(formattedStaff);
      } catch (staffError) {
        console.error('Failed to fetch staff:', staffError);
        setStaff([]);
      }

    } catch (err: any) {
      console.error('Error loading data:', err);
      setDataError(`Failed to load data: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Check for existing assignments when job is selected
  const checkExistingAssignments = async (jobId: string) => {
    if (!jobId) {
      setExistingAssignments([]);
      setPrimaryAssignment(null);
      return;
    }

    try {
      const assignments = await apiClient.get<any[]>(`/job-department-assignments/job/${jobId}`);
      
      const existing = (assignments || []).map(assign => ({
        id: assign.id,
        department_id: assign.department_id,
        department_name: assign.department?.name || assign.department_id || 'Unknown Department',
        status: assign.status || 'assigned',
        assignment_type: assign.assignment_type || 'primary'
      }));
      
      setExistingAssignments(existing);
      
      // Find primary assignment (if exists)
      const primary = existing.find(a => a.assignment_type === 'primary' && 
        !['completed', 'cancelled', 'rejected'].includes(a.status));
      setPrimaryAssignment(primary || null);
      
      console.log(`Found ${existing.length} existing assignments for job ${jobId}`);
      
    } catch (err) {
      console.warn('Failed to fetch existing assignments:', err);
      setExistingAssignments([]);
      setPrimaryAssignment(null);
    }
  };

  // Handle job change
  const handleJobChange = (jobId: string) => {
    const newFormData = { 
      ...formData, 
      job_id: jobId, 
      department_id: '',
      assignment_type: primaryAssignment ? 'collaboration' : 'primary'
    };
    
    setFormData(newFormData);
    
    // Check for existing assignments
    if (jobId) {
      checkExistingAssignments(jobId);
    }
  };

  // Filter active departments
  const activeDepartments = departments.filter(dept => dept.is_active);

  // Get available departments based on assignment type
  const getAvailableDepartments = () => {
    if (formData.assignment_type === 'primary') {
      // For primary assignments, exclude departments that already have active assignments
      const assignedDeptIds = existingAssignments
        .filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status))
        .map(a => a.department_id);
      
      return activeDepartments.filter(dept => !assignedDeptIds.includes(dept.id));
    } else {
      // For collaboration/review, allow any active department
      return activeDepartments;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Validation
    if (!formData.job_id) {
      setError('Please select a job');
      setSubmitting(false);
      return;
    }

    if (!formData.department_id) {
      setError('Please select a department');
      setSubmitting(false);
      return;
    }

    // Check if trying to create duplicate assignment
    const isDuplicate = existingAssignments.some(assign => 
      assign.department_id === formData.department_id && 
      !['completed', 'cancelled', 'rejected'].includes(assign.status)
    );

    if (isDuplicate) {
      setError('This department is already assigned to this job. Please select a different department.');
      setSubmitting(false);
      return;
    }

    try {
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

      console.log('Creating assignment:', assignmentData);

      await apiClient.post('/job-department-assignments', assignmentData);
      
      // Success - redirect
      router.push('/dashboard/coordination/workflow');
      
    } catch (err: any) {
      console.error('Error creating assignment:', err);
      setError(err.message || 'Failed to create assignment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const availableDepartments = getAvailableDepartments();
  const selectedJob = jobs.find(j => j.id === formData.job_id);

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
              {primaryAssignment 
                ? 'Add collaboration or review assignments' 
                : 'Assign a job to a department for processing'}
            </p>
          </div>
        </div>
      </div>

      {/* Data Error */}
      {dataError && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={18} />
            <div>
              <p className="font-medium">Data loading issue</p>
              <p className="text-sm mt-1">{dataError}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={fetchData}
              >
                Retry Loading Data
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 flex-shrink-0" size={18} />
            <p className="font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Primary Assignment Warning */}
      {primaryAssignment && (
        <div className="mb-6 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-md">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 flex-shrink-0" size={18} />
            <div className="flex-1">
              <p className="font-medium mb-2">Job has existing primary assignment</p>
              <div className="text-sm mb-3">
                <p>Primary assignment to: <strong>{primaryAssignment.department_name}</strong></p>
                <p>Status: <span className={`px-2 py-1 text-xs rounded-full ${
                  primaryAssignment.status === 'assigned' ? 'bg-yellow-100 text-yellow-800' :
                  primaryAssignment.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>{primaryAssignment.status}</span></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/dashboard/coordination/workflow`)}
                >
                  <ArrowRight size={14} className="mr-1" />
                  View Workflow Dashboard
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, assignment_type: 'collaboration' }));
                  }}
                >
                  <Users size={14} className="mr-1" />
                  Add Collaboration Assignment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Job Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Job *
                </label>
                <select
                  value={formData.job_id}
                  onChange={(e) => handleJobChange(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
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

              {/* Assignment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assignment Type *
                </label>
                <select
                  value={formData.assignment_type}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    assignment_type: e.target.value as 'primary' | 'collaboration' | 'review',
                    department_id: ''
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={submitting}
                >
                  <option value="primary">Primary</option>
                  <option value="collaboration">Collaboration</option>
                  <option value="review">Review</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {formData.assignment_type === 'primary' && 'Main department responsible'}
                  {formData.assignment_type === 'collaboration' && 'Additional department working together'}
                  {formData.assignment_type === 'review' && 'Department reviewing the work'}
                </p>
              </div>

              {/* Department Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department *
                </label>
                {availableDepartments.length === 0 ? (
                  <div className="p-3 border border-gray-300 rounded-md bg-gray-50">
                    <p className="text-sm text-gray-600">
                      {formData.assignment_type === 'primary' && existingAssignments.length > 0
                        ? 'This job already has department assignments. Use collaboration or review type.'
                        : 'No departments available. Create departments first.'
                      }
                    </p>
                  </div>
                ) : (
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, department_id: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={submitting || availableDepartments.length === 0}
                  >
                    <option value="">Select a department...</option>
                    {availableDepartments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name} ({dept.code})
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {availableDepartments.length} available department{availableDepartments.length !== 1 ? 's' : ''}
                </p>
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
                  disabled={submitting}
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
                  disabled={submitting}
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
                  disabled={submitting}
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
                  disabled={submitting}
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
                  disabled={submitting}
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
                  disabled={submitting}
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
                disabled={submitting}
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
