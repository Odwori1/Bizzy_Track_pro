'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDepartment } from '@/hooks/useDepartment';
import { JobDepartmentAssignment, Department } from '@/types/department';

export default function CreateHandoffPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<JobDepartmentAssignment | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  const [formData, setFormData] = useState({
    to_department_id: '',
    handoff_notes: '',
    handoff_to: '',
    required_actions: '',
  });

  const { fetchJobAssignmentById, fetchDepartments, createHandoff } = useDepartment();

  // Load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load assignment
        const assignmentData = await fetchJobAssignmentById(assignmentId);
        setAssignment(assignmentData);
        
        // Load departments (excluding current department)
        const allDepartments = await fetchDepartments();
        const filteredDepartments = allDepartments.filter(
          dept => dept.id !== assignmentData.department_id
        );
        setDepartments(filteredDepartments);
        
        // Set default to department
        if (filteredDepartments.length > 0) {
          setFormData(prev => ({
            ...prev,
            to_department_id: filteredDepartments[0].id
          }));
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    if (assignmentId) {
      loadData();
    }
  }, [assignmentId, fetchJobAssignmentById, fetchDepartments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!assignment) return;
    
    setSubmitting(true);
    setError(null);
    
    try {
      const handoffData = {
        job_id: assignment.job_id,
        from_department_id: assignment.department_id,
        to_department_id: formData.to_department_id,
        handoff_notes: formData.handoff_notes,
        handoff_to: formData.handoff_to || undefined,
        required_actions: formData.required_actions 
          ? JSON.parse(formData.required_actions)
          : undefined,
      };
      
      await createHandoff(handoffData);
      
      // Navigate back to workflow details
      router.push(`/dashboard/coordination/workflow/${assignmentId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create handoff');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading handoff details...</div>
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">
            {error || 'Assignment not found'}
          </div>
          <div className="mt-4">
            <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
              <Button variant="secondary" size="sm">
                Back to Workflow
              </Button>
            </Link>
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
              <Link href={`/dashboard/coordination/workflow/${assignmentId}`}>
                <Button variant="ghost" size="sm">
                  ← Back
                </Button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Create Department Handoff</h1>
            </div>
            <p className="text-gray-600 mt-1">
              Transfer work from {assignment.department_name} to another department
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
            {/* Assignment Summary */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Current Assignment</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-600">Job</div>
                  <div className="font-medium">{assignment.job_number}: {assignment.job_title}</div>
                </div>
                <div>
                  <div className="text-gray-600">Current Department</div>
                  <div className="font-medium">{assignment.department_name}</div>
                </div>
                <div>
                  <div className="text-gray-600">Status</div>
                  <div className="font-medium capitalize">{assignment.status.replace('_', ' ')}</div>
                </div>
                <div>
                  <div className="text-gray-600">Assigned To</div>
                  <div className="font-medium">{assignment.assigned_to_name || 'Unassigned'}</div>
                </div>
              </div>
            </div>

            {/* To Department */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer To Department *
              </label>
              <select
                value={formData.to_department_id}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  to_department_id: e.target.value
                }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a department...</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code}) - {dept.department_type}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Select the department that will take over this work
              </p>
            </div>

            {/* Handoff To (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Handoff To (Optional)
              </label>
              <input
                type="text"
                value={formData.handoff_to}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  handoff_to: e.target.value
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Staff member name or ID"
              />
              <p className="mt-1 text-sm text-gray-500">
                Specific staff member to receive the handoff (leave blank for department)
              </p>
            </div>

            {/* Handoff Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Handoff Notes *
              </label>
              <textarea
                value={formData.handoff_notes}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  handoff_notes: e.target.value
                }))}
                required
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe what work has been completed and what needs to be done next..."
              />
              <p className="mt-1 text-sm text-gray-500">
                Provide clear instructions for the receiving department
              </p>
            </div>

            {/* Required Actions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Required Actions (Optional)
              </label>
              <textarea
                value={formData.required_actions}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  required_actions: e.target.value
                }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='{"priority": "high", "deadline": "2024-01-15", "checkpoints": ["Review design", "Test functionality"]}'
              />
              <p className="mt-1 text-sm text-gray-500">
                JSON format for specific actions, deadlines, or requirements
              </p>
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
              >
                Create Handoff
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
