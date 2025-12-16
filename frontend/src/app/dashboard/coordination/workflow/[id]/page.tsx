'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WorkflowTimeline } from '@/components/department/WorkflowTimeline';
import { useDepartment } from '@/hooks/useDepartment';
import { JobDepartmentAssignment, DepartmentWorkflowHandoff } from '@/types/department';

export default function WorkflowDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<JobDepartmentAssignment | null>(null);
  const [handoffs, setHandoffs] = useState<DepartmentWorkflowHandoff[]>([]);

  const { fetchJobAssignmentById, fetchHandoffsByJob } = useDepartment();

  // Load assignment and handoff data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load assignment details
        const assignmentData = await fetchJobAssignmentById(assignmentId);
        setAssignment(assignmentData);

        // Load handoffs for this job
        if (assignmentData.job_id) {
          const handoffData = await fetchHandoffsByJob(assignmentData.job_id);
          setHandoffs(handoffData);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load workflow details');
      } finally {
        setLoading(false);
      }
    };

    if (assignmentId) {
      loadData();
    }
  }, [assignmentId, fetchJobAssignmentById, fetchHandoffsByJob]);

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!assignment) return;

    try {
      // await updateJobAssignment(assignmentId, { status: newStatus });
      // Refresh data
      // const updated = await fetchJobAssignmentById(assignmentId);
      // setAssignment(updated);
      alert(`Status would update to: ${newStatus}`);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  // Handle handoff creation
  const handleCreateHandoff = () => {
    router.push(`/dashboard/coordination/workflow/${assignmentId}/handoff`);
  };

  // Handle edit assignment
  const handleEditAssignment = () => {
    if (assignment) {
      router.push(`/dashboard/coordination/workflow/${assignmentId}/edit`);
    }
  };

  // Handle log time
  const handleLogTime = () => {
    if (assignment) {
      router.push(`/dashboard/coordination/workflow/${assignmentId}/log-time`);
    }
  };

  // Helper function to safely format hours
  const formatHours = (hours: any): string => {
    if (hours === null || hours === undefined) {
      return 'Not set';
    }
    
    // Convert to number if it's a string
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    
    // Check if it's a valid number
    if (isNaN(numHours)) {
      return 'Not set';
    }
    
    return `${numHours.toFixed(1)} hours`;
  };

  // Helper function to safely parse dates
  const formatDate = (date: any): string => {
    if (!date) return 'Not set';
    
    try {
      // Handle different date formats
      if (typeof date === 'string') {
        return new Date(date).toLocaleDateString();
      } else if (date instanceof Date) {
        return date.toLocaleDateString();
      } else if (date.utc) {
        return new Date(date.utc).toLocaleDateString();
      }
      return 'Not set';
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Not set';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-gray-500">Loading workflow details...</div>
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
            {error || 'Workflow not found'}
          </div>
          <div className="mt-4">
            <Link href="/dashboard/coordination/workflow">
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Link href="/dashboard/coordination/workflow">
              <Button variant="ghost" size="sm">
                ← Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              Workflow Details
            </h1>
          </div>
          <p className="text-gray-600 mt-1">
            {assignment.job_number}: {assignment.job_title}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Status Actions */}
          {assignment.status === 'assigned' && (
            <Button
              variant="primary"
              onClick={() => handleStatusUpdate('in_progress')}
            >
              Start Work
            </Button>
          )}

          {assignment.status === 'in_progress' && (
            <>
              <Button
                variant="outline"
                onClick={() => handleStatusUpdate('completed')}
              >
                Mark Complete
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateHandoff}
              >
                Create Handoff
              </Button>
            </>
          )}

          <Link href={`/dashboard/management/jobs/${assignment.job_id}`}>
            <Button variant="outline">
              View Job
            </Button>
          </Link>
        </div>
      </div>

      {/* Assignment Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Assignment Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Details</h3>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Job</div>
                    <div className="text-sm font-medium text-gray-900">
                      {assignment.job_number}: {assignment.job_title}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Department</div>
                    <div className="text-sm font-medium text-gray-900">
                      {assignment.department_name} ({assignment.department_code})
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Assigned To</div>
                    <div className="text-sm font-medium text-gray-900">
                      {assignment.assigned_to_name || 'Unassigned'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Assigned By</div>
                    <div className="text-sm font-medium text-gray-900">
                      {assignment.assigned_by_name}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Status</div>
                    <div className="text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        assignment.status === 'completed' ? 'bg-green-100 text-green-800' :
                        assignment.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {assignment.status?.replace('_', ' ') || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Priority</div>
                    <div className="text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        assignment.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                        assignment.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                        assignment.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {assignment.priority || 'Normal'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Assignment Type</div>
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {assignment.assignment_type || 'Standard'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">SLA Deadline</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(assignment.sla_deadline)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Time Tracking */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium text-gray-900 mb-3">Time Tracking</h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Estimated</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatHours(assignment.estimated_hours)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Actual</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatHours(assignment.actual_hours) || 'Not started'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Scheduled Start</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(assignment.scheduled_start)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Scheduled End</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDate(assignment.scheduled_end)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {assignment.notes && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium text-gray-900 mb-2">Notes</h4>
                  <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                    {assignment.notes}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Workflow Timeline */}
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Workflow Timeline</h3>
                <div className="text-sm text-gray-600">
                  {handoffs.length} handoff{handoffs.length !== 1 ? 's' : ''}
                </div>
              </div>

              <WorkflowTimeline
                handoffs={handoffs}
                currentAssignmentId={assignmentId}
              />
            </div>
          </Card>
        </div>

        {/* Right Column - Actions & History */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>

              <div className="space-y-3">
                {/* Update Status */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Update Status</div>
                  <div className="flex flex-wrap gap-2">
                    {assignment.status === 'assigned' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusUpdate('in_progress')}
                      >
                        Start Work
                      </Button>
                    )}
                    {assignment.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusUpdate('completed')}
                      >
                        Mark Complete
                      </Button>
                    )}
                    {assignment.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCreateHandoff}
                      >
                        Handoff
                      </Button>
                    )}
                  </div>
                </div>

                {/* Add Time */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Time Tracking</div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleLogTime}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Log Time
                  </Button>
                </div>

                {/* Update Assignment */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Assignment</div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={handleEditAssignment}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit Assignment
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Recent Activity */}
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>

              <div className="space-y-4">
                <div className="text-sm text-gray-700">
                  Assignment created
                </div>
                <div className="text-xs text-gray-500">
                  {formatDate(assignment.created_at)}
                </div>

                {assignment.actual_start && (
                  <>
                    <div className="pt-2 border-t">
                      <div className="text-sm text-gray-700">
                        Work started
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(assignment.actual_start)}
                      </div>
                    </div>
                  </>
                )}

                {handoffs.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-sm text-gray-700">
                      Last handoff
                    </div>
                    <div className="text-xs text-gray-500">
                      {handoffs.length} handoff{handoffs.length !== 1 ? 's' : ''} recorded
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
