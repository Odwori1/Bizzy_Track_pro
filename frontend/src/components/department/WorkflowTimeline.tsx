import React from 'react';
import { DepartmentWorkflowHandoff } from '@/types/department';
import { formatDate } from '@/lib/date-format';

interface WorkflowTimelineProps {
  handoffs: DepartmentWorkflowHandoff[];
  currentAssignmentId?: string;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  handoffs,
  currentAssignmentId,
}) => {
  // Sort handoffs by created_at
  const sortedHandoffs = [...handoffs].sort((a, b) => {
    const dateA = typeof a.created_at === 'string' ? a.created_at : a.created_at?.utc || '';
    const dateB = typeof b.created_at === 'string' ? b.created_at : b.created_at?.utc || '';
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  // Get status icon and color
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: (
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          ),
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200',
        };
      case 'accepted':
        return {
          icon: (
            <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ),
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
        };
      case 'rejected':
        return {
          icon: (
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          ),
          bgColor: 'bg-red-100',
          borderColor: 'border-red-200',
        };
      case 'pending':
        return {
          icon: (
            <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          ),
          bgColor: 'bg-yellow-100',
          borderColor: 'border-yellow-200',
        };
      default:
        return {
          icon: (
            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
            </svg>
          ),
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200',
        };
    }
  };

  // Format handoff date
  const formatHandoffDate = (handoff: DepartmentWorkflowHandoff) => {
    const dateStr = typeof handoff.handoff_at === 'string' 
      ? handoff.handoff_at 
      : handoff.handoff_at?.utc || '';
    return formatDate(dateStr);
  };

  // Format department color
  const getDepartmentColor = (handoff: DepartmentWorkflowHandoff, isFromDept: boolean) => {
    const color = isFromDept 
      ? (handoff as any).from_department_color || '#6b7280'
      : (handoff as any).to_department_color || '#6b7280';
    return color;
  };

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

      {sortedHandoffs.length === 0 ? (
        <div className="relative pl-12 py-8">
          <div className="text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2">No workflow history yet</p>
          </div>
        </div>
      ) : (
        sortedHandoffs.map((handoff, index) => {
          const statusConfig = getStatusConfig(handoff.handoff_status);
          const isLast = index === sortedHandoffs.length - 1;

          return (
            <div key={handoff.id} className="relative pl-12 py-6">
              {/* Timeline dot */}
              <div className={`absolute left-3 top-8 w-3 h-3 rounded-full border-2 border-white ${statusConfig.bgColor}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {statusConfig.icon}
                </div>
              </div>

              {/* Card */}
              <div className={`border rounded-lg p-4 ${statusConfig.borderColor} ${statusConfig.bgColor}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig.borderColor}`}>
                      {handoff.handoff_status.toUpperCase()}
                    </div>
                    <div className="text-sm text-gray-600">
                      {formatHandoffDate(handoff)}
                    </div>
                  </div>
                  {currentAssignmentId === handoff.id && (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                      CURRENT
                    </span>
                  )}
                </div>

                {/* Departments */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getDepartmentColor(handoff, true) }}
                    />
                    <div>
                      <div className="text-xs text-gray-500">From</div>
                      <div className="font-medium">{handoff.from_department_name}</div>
                    </div>
                  </div>

                  <div className="px-4">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getDepartmentColor(handoff, false) }}
                    />
                    <div>
                      <div className="text-xs text-gray-500">To</div>
                      <div className="font-medium">{handoff.to_department_name}</div>
                    </div>
                  </div>
                </div>

                {/* Handoff Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Handoff By</div>
                    <div className="font-medium">{handoff.handoff_by_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Handoff To</div>
                    <div className="font-medium">{handoff.handoff_to_name || 'Not assigned'}</div>
                  </div>
                </div>

                {/* Notes */}
                {handoff.handoff_notes && (
                  <div className="mt-3 p-2 bg-white/50 rounded">
                    <div className="text-xs text-gray-500 mb-1">Notes</div>
                    <div className="text-sm">{handoff.handoff_notes}</div>
                  </div>
                )}

                {/* Required Actions */}
                {handoff.required_actions && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Required Actions</div>
                    <div className="text-sm">
                      {typeof handoff.required_actions === 'object' 
                        ? JSON.stringify(handoff.required_actions, null, 2)
                        : handoff.required_actions}
                    </div>
                  </div>
                )}

                {/* Accepted/Completed Time */}
                {(handoff.accepted_at || handoff.completed_at) && (
                  <div className="mt-3 text-xs text-gray-500">
                    {handoff.accepted_at && (
                      <div>Accepted: {formatDate(handoff.accepted_at)}</div>
                    )}
                    {handoff.completed_at && (
                      <div>Completed: {formatDate(handoff.completed_at)}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Connector line (not for last item) */}
              {!isLast && (
                <div className="absolute left-4 top-full h-6 w-0.5 bg-gray-200"></div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
