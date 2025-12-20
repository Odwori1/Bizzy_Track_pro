import React from 'react';
import { JobDepartmentAssignment } from '@/types/department';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { formatDate } from '@/lib/date-format';
import { useDepartmentWorkflow } from '@/hooks/useDepartmentWorkflow';

interface WorkflowAssignmentCardProps {
  assignment: JobDepartmentAssignment;
  showActions?: boolean;
  onStatusUpdate?: (id: string, status: string) => void;
  onHandoff?: (assignment: JobDepartmentAssignment) => void;
}

export const WorkflowAssignmentCard: React.FC<WorkflowAssignmentCardProps> = ({
  assignment,
  showActions = true,
  onStatusUpdate,
  onHandoff,
}) => {
  const { completeDepartmentWork, loading: workLoading } = useDepartmentWorkflow();

  // Status badge colors
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'blocked':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Priority badge colors
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Format duration
  const formatDuration = (minutes: number | string | null | undefined): string => {
    if (!minutes && minutes !== 0) return '0m'; // Handle null/undefined

    const numericMinutes = typeof minutes === 'string' ? parseFloat(minutes) : minutes;

    if (isNaN(numericMinutes)) return '0m';

    if (numericMinutes < 60) {
      return `${Math.round(numericMinutes)}m`;
    }

    const hours = numericMinutes / 60;
    const remainingMinutes = numericMinutes % 60;

    if (remainingMinutes === 0) {
      return `${Math.round(hours)}h`;
    }

    return `${Math.floor(hours)}h ${Math.round(remainingMinutes)}m`;
  };

  // Get status display name
  const getStatusDisplay = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Safe assignment with defaults
  const safeAssignment = {
    id: assignment?.id || '',
    job_id: assignment?.job_id || '',
    job_number: assignment?.job_number || 'Unknown',
    job_title: assignment?.job_title || 'No title',
    department_id: assignment?.department_id || '',
    department_name: assignment?.department_name || 'Unknown Department',
    department_code: assignment?.department_code || '',
    department_color: assignment?.department_color || '#6b7280',
    assigned_by_name: assignment?.assigned_by_name || 'Unknown',
    assigned_to_name: assignment?.assigned_to_name || 'Unassigned',
    assignment_type: assignment?.assignment_type || 'primary',
    status: assignment?.status || 'assigned',
    priority: assignment?.priority || 'medium',
    estimated_hours: assignment?.estimated_hours || null,
    actual_hours: assignment?.actual_hours || null,
    scheduled_start: assignment?.scheduled_start,
    scheduled_end: assignment?.scheduled_end,
    actual_start: assignment?.actual_start,
    actual_end: assignment?.actual_end,
    notes: assignment?.notes || '',
    sla_deadline: assignment?.sla_deadline,
    created_at: assignment?.created_at || '',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(safeAssignment.status)}`}>
              {getStatusDisplay(safeAssignment.status)}
            </span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityBadge(safeAssignment.priority)}`}>
              {safeAssignment.priority.toUpperCase()}
            </span>
            {safeAssignment.assignment_type !== 'primary' && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border-purple-200">
                {safeAssignment.assignment_type.toUpperCase()}
              </span>
            )}
          </div>

          <h3 className="text-lg font-semibold text-gray-900">
            {safeAssignment.job_number}: {safeAssignment.job_title}
          </h3>
        </div>

        {/* Department indicator */}
        <div className="flex items-center space-x-2">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: safeAssignment.department_color }}
          />
          <span className="text-sm font-medium text-gray-700">
            {safeAssignment.department_name}
          </span>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Assigned To</p>
          <p className="text-sm font-medium text-gray-900">
            {safeAssignment.assigned_to_name}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Estimated Time</p>
          <p className="text-sm font-medium text-gray-900">
            {formatDuration(safeAssignment.estimated_hours)}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Actual Time</p>
          <p className="text-sm font-medium text-gray-900">
            {safeAssignment.actual_hours ? formatDuration(safeAssignment.actual_hours) : 'Not started'}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">SLA Deadline</p>
          <p className="text-sm font-medium text-gray-900">
            {safeAssignment.sla_deadline ? formatDate(safeAssignment.sla_deadline) : 'Not set'}
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex items-center justify-between mb-6 text-sm text-gray-600">
        <div className="flex flex-col items-center">
          <div className="w-2 h-2 bg-blue-500 rounded-full mb-1"></div>
          <div>Scheduled Start</div>
          <div className="font-medium">
            {safeAssignment.scheduled_start ? formatDate(safeAssignment.scheduled_start) : 'Not set'}
          </div>
        </div>

        <div className="flex-1 h-0.5 bg-gray-200 mx-4"></div>

        <div className="flex flex-col items-center">
          <div className="w-2 h-2 bg-green-500 rounded-full mb-1"></div>
          <div>Actual Start</div>
          <div className="font-medium">
            {safeAssignment.actual_start ? formatDate(safeAssignment.actual_start) : 'Not started'}
          </div>
        </div>

        <div className="flex-1 h-0.5 bg-gray-200 mx-4"></div>

        <div className="flex flex-col items-center">
          <div className="w-2 h-2 bg-red-500 rounded-full mb-1"></div>
          <div>Actual End</div>
          <div className="font-medium">
            {safeAssignment.actual_end ? formatDate(safeAssignment.actual_end) : 'In progress'}
          </div>
        </div>
      </div>

      {/* Notes */}
      {safeAssignment.notes && (
        <div className="mb-6 p-3 bg-gray-50 rounded-md">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Notes</p>
          <p className="text-sm text-gray-700">{safeAssignment.notes}</p>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex justify-end space-x-2 pt-4 border-t">
          {onStatusUpdate && safeAssignment.status !== 'completed' && (
            <div className="flex space-x-2">
              {safeAssignment.status === 'assigned' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusUpdate(safeAssignment.id, 'in_progress')}
                >
                  Start Work
                </Button>
              )}
              {safeAssignment.status === 'in_progress' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    // Ask for work details
                    const hours = prompt('How many hours were worked?', '8');
                    const description = prompt('Brief description of work completed:', 
                      safeAssignment.notes || 'Completed department work');
                    
                    if (hours && description) {
                      const hourlyRate = prompt('Hourly rate for this work?', '150');
                      
                      if (hourlyRate) {
                        await completeDepartmentWork(
                          safeAssignment.id,
                          safeAssignment.department_id,
                          safeAssignment.job_id,
                          description,
                          parseFloat(hours),
                          parseFloat(hourlyRate)
                        );
                        
                        if (onStatusUpdate) {
                          onStatusUpdate(safeAssignment.id, 'completed');
                        }
                      }
                    }
                  }}
                  disabled={workLoading}
                >
                  {workLoading ? 'Completing...' : 'Mark Complete & Bill'}
                </Button>
              )}
              {safeAssignment.status === 'in_progress' && onHandoff && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onHandoff(safeAssignment)}
                >
                  Handoff
                </Button>
              )}
            </div>
          )}

          <Link href={`/dashboard/coordination/workflow/${safeAssignment.id}`}>
            <Button variant="ghost" size="sm">
              View Details
            </Button>
          </Link>
          <Link href={`/dashboard/management/jobs/${safeAssignment.job_id}`}>
            <Button variant="outline" size="sm">
              View Job
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
};
