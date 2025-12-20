'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useDepartmentStore, useDepartmentActions } from '@/store/departmentStore';
import { useAuth } from '@/hooks/useAuth';
import { AlertCircle, CheckCircle, Building, RefreshCw, Clock, Users, Filter, AlertTriangle } from 'lucide-react';

// Status badge component
const StatusBadge = ({ status }: { status: string }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'assigned':
        return { label: 'Assigned', color: 'bg-blue-100 text-blue-800' };
      case 'in_progress':
        return { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' };
      case 'completed':
        return { label: 'Completed', color: 'bg-green-100 text-green-800' };
      case 'blocked':
        return { label: 'Blocked', color: 'bg-red-100 text-red-800' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800' };
    }
  };

  const config = getStatusConfig(status);
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
};

export default function CreateHandoffPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [assignment, setAssignment] = useState<any>(null);
  const [departments, setDepartments] = useState<any[]>([]);
  const [availableDepartments, setAvailableDepartments] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    to_department_id: '',
    handoff_notes: '',
    handoff_to: '',
    required_actions: '',
    deadline: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const { createHandoff, fetchJobAssignmentById, fetchDepartments } = useDepartmentActions();
  const { user } = useAuth();

  // Also get departments from store directly as fallback
  const storeDepartments = useDepartmentStore((state) => state.departments);

  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
  }, [assignmentId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Load the assignment
      const assignmentData = await fetchJobAssignmentById(assignmentId);
      setAssignment(assignmentData);

      // 2. Validate assignment can be handed off
      if (!['assigned', 'in_progress'].includes(assignmentData.status)) {
        setError(`Cannot create handoff: This assignment is ${assignmentData.status.replace('_', ' ')}. Only "assigned" or "in progress" assignments can be handed off.`);
        setLoading(false);
        return;
      }

      // 3. Load all departments - handle both store and API
      let departmentsData: any[] = [];

      try {
        // Try to get from API first
        await fetchDepartments();
        departmentsData = storeDepartments;
      } catch (err) {
        console.warn('Failed to fetch departments from API, using store data');
        departmentsData = storeDepartments || [];
      }

      // Ensure departmentsData is an array
      if (!Array.isArray(departmentsData)) {
        departmentsData = [];
      }

      // 4. Filter out inactive departments and current department
      const filteredDepartments = departmentsData.filter(dept => {
        if (!dept || typeof dept !== 'object') return false;

        const isCurrent = dept.id === assignmentData.department_id;
        const isActive = dept.is_active !== false; // Default to true if not specified

        return !isCurrent && isActive;
      });

      setDepartments(departmentsData);
      setAvailableDepartments(filteredDepartments);

      // Set default selected department if available
      if (filteredDepartments.length > 0 && !formData.to_department_id) {
        setFormData(prev => ({
          ...prev,
          to_department_id: filteredDepartments[0].id
        }));
      }

      // Pre-fill form with intelligent defaults
      if (assignmentData) {
        const baseNotes = `Handoff created on ${new Date().toLocaleDateString()}\n` +
          `Job: ${assignmentData.job_number || 'N/A'}: ${assignmentData.job_title || 'Untitled Job'}\n` +
          `From: ${assignmentData.department_name || 'Current Department'}\n` +
          `Current Status: ${assignmentData.status?.replace('_', ' ') || 'unknown'}\n` +
          `Priority: ${assignmentData.priority || 'medium'}\n` +
          `Assigned to: ${assignmentData.assigned_to_name || 'Not assigned'}\n` +
          `Estimated Hours: ${assignmentData.estimated_hours || 'Not specified'}`;

        const defaultDeadline = () => {
          const date = new Date();
          date.setDate(date.getDate() + 3); // Default 3 days from now
          return date.toISOString().slice(0, 16);
        };

        setFormData(prev => ({
          ...prev,
          handoff_notes: baseNotes,
          handoff_to: assignmentData.assigned_to_name || '',
          deadline: assignmentData.sla_deadline?.utc
            ? new Date(assignmentData.sla_deadline.utc).toISOString().slice(0, 16)
            : defaultDeadline(),
          required_actions: prev.required_actions || `Please complete the following:\n1. Review previous work\n2. Continue with next phase\n3. Update status when complete\n4. Provide completion notes`
        }));
      }

    } catch (err: any) {
      console.error('Error loading handoff data:', err);
      setError(err.message || 'Failed to load handoff data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.to_department_id) {
      newErrors.to_department_id = 'Please select a target department';
    }

    if (!formData.handoff_notes.trim()) {
      newErrors.handoff_notes = 'Please provide handoff notes';
    } else if (formData.handoff_notes.trim().length < 10) {
      newErrors.handoff_notes = 'Handoff notes should be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (!user) {
      setError('Missing user data');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // IMPORTANT: Refresh assignment data to ensure it's still eligible
      const refreshedAssignment = await fetchJobAssignmentById(assignmentId);

      // Final validation - ensure assignment is still eligible
      if (!['assigned', 'in_progress'].includes(refreshedAssignment.status)) {
        setError(`Cannot create handoff: Assignment is now ${refreshedAssignment.status.replace('_', ' ')}. It may have been handed off or completed by another user.`);
        setAssignment(refreshedAssignment); // Update UI
        setSubmitting(false);
        return;
      }

      // Update assignment with refreshed data
      setAssignment(refreshedAssignment);

      // Prepare handoff data according to backend expectations
      const handoffData: any = {
        job_id: refreshedAssignment.job_id,
        from_department_id: refreshedAssignment.department_id,
        to_department_id: formData.to_department_id,
        handoff_notes: formData.handoff_notes.trim(),
      };

      // Optional fields - only include if we have values
      if (formData.handoff_to.trim()) {
        handoffData.handoff_to = formData.handoff_to.trim();
      }

      if (formData.required_actions.trim()) {
        handoffData.required_actions = {
          steps: formData.required_actions.trim().split('\n').filter(step => step.trim()),
          deadline: formData.deadline || undefined
        };
      }

      // Create the handoff
      await createHandoff(handoffData);

      setSuccess('Handoff created successfully! Redirecting to workflow...');

      // Redirect after success
      setTimeout(() => {
        router.push(`/dashboard/coordination/workflow/${assignmentId}`);
      }, 1500);

    } catch (err: any) {
      console.error('Handoff creation error:', err);

      // Try to extract actual error from backend
      let errorMessage = 'Failed to create handoff.';

      if (err.message?.includes('Job is not currently assigned')) {
        errorMessage = 'Cannot create handoff: This assignment was completed or handed off by another user.';
      } else if (err.message?.includes('already assigned')) {
        errorMessage = 'Cannot create handoff: This job is already assigned to the target department.';
      } else if (err.message?.includes('Department not found')) {
        errorMessage = 'Cannot create handoff: The selected department is no longer available.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);

      // Reload data to get current state
      setTimeout(() => {
        loadData();
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error for this field if it exists
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleRetry = () => {
    loadData();
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-500">Loading handoff data...</div>
          <div className="text-sm text-gray-400 mt-2">Assignment ID: {assignmentId}</div>
        </div>
      </div>
    );
  }

  // No assignment found
  if (!assignment) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Assignment Not Found</h2>
            <p className="text-gray-600 mb-4">
              Assignment with ID "{assignmentId}" could not be found or you don't have access to it.
            </p>
            <Link href="/dashboard/coordination/workflow">
              <Button variant="secondary">
                ← Back to Workflow
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Assignment not eligible for handoff
  if (!['assigned', 'in_progress'].includes(assignment.status)) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Cannot Create Handoff</h2>
            <div className="mb-4">
              <p className="text-gray-600 mb-2">
                This assignment is <StatusBadge status={assignment.status} /> and cannot be handed off.
              </p>
              <p className="text-sm text-gray-500">
                Only assignments with status "Assigned" or "In Progress" can be handed off.
              </p>
              {assignment.actual_end && (
                <p className="text-sm text-gray-500 mt-1">
                  Completed on: {new Date(assignment.actual_end.utc).toLocaleString()}
                </p>
              )}
            </div>
            <div className="space-x-3">
              <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
                <Button variant="secondary">
                  ← View Assignment
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={handleRetry}
                icon={RefreshCw}
              >
                Refresh Status
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // No departments available for handoff
  if (availableDepartments.length === 0) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <div className="text-center">
            <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">No Departments Available</h2>
            <p className="text-gray-600 mb-4">
              {departments.length === 0
                ? 'No departments found in the system. You need to create departments first.'
                : departments.length === 1
                  ? `Only one department (${assignment.department_name}) exists. You need at least 2 departments to perform a handoff.`
                  : 'No other active departments available. Check if other departments are marked as inactive.'
              }
            </p>
            <div className="space-x-3">
              <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
                <Button variant="secondary">
                  ← Back to Assignment
                </Button>
              </Link>
              <Link href="/dashboard/coordination/departments">
                <Button variant="primary">
                  Manage Departments
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={handleRetry}
                icon={RefreshCw}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-2 mb-4">
          <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
            <Button variant="ghost" size="sm">
              ← Back to Assignment
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Create Department Handoff</h1>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-gray-600">
            Transfer job <span className="font-semibold">{assignment.job_number}: {assignment.job_title}</span>
            {' '}from <span className="font-semibold">{assignment.department_name}</span>.
          </p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={14} />
            {availableDepartments.length} department{availableDepartments.length !== 1 ? 's' : ''} available
          </div>
        </div>
      </div>

      {/* Warning if assignment might be stale */}
      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-md p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-blue-800 font-medium">Real-time Status Check</div>
            <div className="text-blue-700 text-sm mt-1">
              Assignment status will be verified before creating handoff. If another user has already handed off this assignment, you'll see an error.
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-red-800 font-medium">Error</div>
              <div className="text-red-700 text-sm mt-1">{error}</div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRetry}
                  icon={RefreshCw}
                >
                  Refresh Data
                </Button>
                {error.includes('already handed off') && (
                  <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
                    <Button size="sm" variant="ghost">
                      View Updated Assignment
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-green-500" />
            <span className="text-green-800 font-medium">{success}</span>
          </div>
        </div>
      )}

      {/* Current Assignment Card */}
      <Card className="mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Building size={18} className="text-gray-400" />
              Current Assignment Details
            </h3>
            <StatusBadge status={assignment.status} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-600 mb-1">Job</div>
              <div className="font-medium">{assignment.job_number}: {assignment.job_title}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Current Department</div>
              <div className="font-medium">{assignment.department_name}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Assigned To</div>
              <div className="font-medium flex items-center gap-2">
                <Users size={14} className="text-gray-400" />
                {assignment.assigned_to_name || 'Unassigned'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-sm text-gray-600 mb-1">Priority</div>
              <div className="font-medium capitalize">{assignment.priority || 'medium'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Estimated Hours</div>
              <div className="font-medium">{assignment.estimated_hours || 'Not specified'}</div>
            </div>
          </div>

          {assignment.status === 'in_progress' && assignment.actual_start && (
            <div className="mb-4 text-sm text-gray-600 flex items-center gap-2">
              <Clock size={14} />
              Started: {new Date(assignment.actual_start.utc).toLocaleString()}
            </div>
          )}

          {assignment.notes && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-gray-600 mb-1">Current Notes:</div>
              <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded border">
                {assignment.notes}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Handoff Form */}
      <Card>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Target Department Selection - Updated to use simple select like in jobs/new/page.tsx */}
            <div className="space-y-2">
              <label htmlFor="to_department_id" className="block text-sm font-medium text-gray-700">
                Transfer To Department *
              </label>
              <select
                id="to_department_id"
                name="to_department_id"
                value={formData.to_department_id}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border ${errors.to_department_id ? 'border-red-500' : 'border-gray-300'} rounded-md`}
                required
                disabled={submitting || availableDepartments.length === 0}
              >
                <option value="">Select a target department</option>
                {availableDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} {department.code ? `(${department.code})` : ''}
                    {department.department_type ? ` - ${department.department_type}` : ''}
                  </option>
                ))}
              </select>
              {errors.to_department_id && (
                <p className="mt-1 text-sm text-red-600">{errors.to_department_id}</p>
              )}
            </div>

            {/* Handoff Notes */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="handoff_notes" className="block text-sm font-medium text-gray-700">
                  Handoff Notes *
                </label>
                <span className="text-xs text-gray-500">
                  {formData.handoff_notes.length} characters
                </span>
              </div>
              <Textarea
                id="handoff_notes"
                name="handoff_notes"
                value={formData.handoff_notes}
                onChange={handleInputChange}
                rows={6}
                placeholder="Describe what work has been completed, what needs to be done next, any special instructions..."
                className="w-full text-sm"
                disabled={submitting}
                required
              />
              {errors.handoff_notes && (
                <p className="mt-1 text-sm text-red-600">{errors.handoff_notes}</p>
              )}
              <div className="mt-1 text-xs text-gray-500">
                Include: Completed work, pending tasks, special requirements, deadlines, priority, estimated hours
              </div>
            </div>

            {/* Deadline */}
            <div className="space-y-2">
              <label htmlFor="deadline" className="block text-sm font-medium text-gray-700">
                Desired Completion (Optional)
              </label>
              <Input
                type="datetime-local"
                id="deadline"
                name="deadline"
                value={formData.deadline}
                onChange={handleInputChange}
                className="w-full"
                disabled={submitting}
              />
              <div className="mt-1 text-xs text-gray-500">
                This will be included in the required actions
              </div>
            </div>

            {/* Specific Requirements */}
            <div className="space-y-2">
              <label htmlFor="required_actions" className="block text-sm font-medium text-gray-700">
                Specific Requirements (Optional)
              </label>
              <Textarea
                id="required_actions"
                name="required_actions"
                value={formData.required_actions}
                onChange={handleInputChange}
                rows={3}
                placeholder="List specific requirements, one per line..."
                className="w-full"
                disabled={submitting}
              />
              <div className="mt-1 text-xs text-gray-500">
                Each line will become a checklist item for the receiving department
              </div>
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
                icon={submitting ? undefined : CheckCircle}
              >
                {submitting ? 'Creating Handoff...' : 'Create Handoff'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
