import React from 'react';
import { DepartmentWorkflowHandoff } from '@/types/department';
import { formatDisplayDate } from '@/lib/date-format';

interface WorkflowTimelineProps {
  handoffs?: DepartmentWorkflowHandoff[];  // Make optional
  currentAssignmentId?: string;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  handoffs = [],  // Default value
  currentAssignmentId,
}) => {
  // SAFETY CHECK: Ensure handoffs is always an array
  const safeHandoffs = Array.isArray(handoffs) ? handoffs : [];
  
  // Sort handoffs by created_at - with safety checks
  const sortedHandoffs = [...safeHandoffs].sort((a, b) => {
    try {
      const getDate = (handoff: DepartmentWorkflowHandoff): string => {
        if (!handoff) return '';
        if (typeof handoff.created_at === 'string') return handoff.created_at;
        if (handoff.created_at?.utc) return handoff.created_at.utc;
        if (handoff.handoff_at) {
          if (typeof handoff.handoff_at === 'string') return handoff.handoff_at;
          if (handoff.handoff_at?.utc) return handoff.handoff_at.utc;
        }
        return '';
      };

      const dateA = getDate(a);
      const dateB = getDate(b);
      
      if (!dateA || !dateB) return 0;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    } catch (error) {
      console.error('Error sorting handoffs:', error);
      return 0;
    }
  });

  // Rest of the component remains the same with safety checks...
  // Get status icon and color
  const getStatusConfig = (status?: string) => {
    const safeStatus = status || 'unknown';
    
    switch (safeStatus.toLowerCase()) {
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
    try {
      const dateStr = handoff.handoff_at 
        ? (typeof handoff.handoff_at === 'string'
          ? handoff.handoff_at
          : handoff.handoff_at?.utc || '')
        : handoff.created_at
          ? (typeof handoff.created_at === 'string'
            ? handoff.created_at
            : handoff.created_at?.utc || '')
          : '';
      
      return formatDisplayDate(dateStr);
    } catch (error) {
      console.error('Error formatting handoff date:', error, handoff);
      return 'Date not available';
    }
  };

  // Format department color
  const getDepartmentColor = (handoff: DepartmentWorkflowHandoff, isFromDept: boolean) => {
    try {
      // Try to get color from the handoff object
      const color = isFromDept
        ? (handoff as any).from_department_color || '#6b7280'
        : (handoff as any).to_department_color || '#6b7280';
      return color;
    } catch (error) {
      return '#6b7280'; // Default gray
    }
  };

  // Safe string access
  const safeGet = (obj: any, key: string, defaultValue: string = '') => {
    try {
      const value = obj?.[key];
      return value ? String(value) : defaultValue;
    } catch (error) {
      return defaultValue;
    }
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
            <p className="text-sm text-gray-400 mt-1">Create a handoff to see timeline here</p>
          </div>
        </div>
      ) : (
        sortedHandoffs.map((handoff, index) => {
          const statusConfig = getStatusConfig(handoff.handoff_status || handoff.status);
          const isLast = index === sortedHandoffs.length - 1;

          return (
            <div key={handoff.id || `handoff-${index}`} className="relative pl-12 py-6">
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
                      {safeGet(handoff, 'handoff_status', safeGet(handoff, 'status', 'Unknown')).toUpperCase()}
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
                      <div className="font-medium">
                        {safeGet(handoff, 'from_department_name', 'Unknown Department')}
                      </div>
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
                      <div className="font-medium">
                        {safeGet(handoff, 'to_department_name', 'Unknown Department')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Handoff Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Handoff By</div>
                    <div className="font-medium">
                      {safeGet(handoff, 'handoff_by_name', safeGet(handoff, 'created_by_name', 'Unknown'))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Handoff To</div>
                    <div className="font-medium">
                      {safeGet(handoff, 'handoff_to_name', 'Not assigned')}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {handoff.handoff_notes && (
                  <div className="mt-3 p-2 bg-white/50 rounded">
                    <div className="text-xs text-gray-500 mb-1">Notes</div>
                    <div className="text-sm">{safeGet(handoff, 'handoff_notes')}</div>
                  </div>
                )}

                {/* Required Actions */}
                {handoff.required_actions && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Required Actions</div>
                    <div className="text-sm">
                      {typeof handoff.required_actions === 'object'
                        ? JSON.stringify(handoff.required_actions, null, 2)
                        : safeGet(handoff, 'required_actions')}
                    </div>
                  </div>
                )}

                {/* Accepted/Completed Time */}
                {(handoff.accepted_at || handoff.completed_at) && (
                  <div className="mt-3 text-xs text-gray-500">
                    {handoff.accepted_at && (
                      <div>Accepted: {formatDisplayDate(
                        typeof handoff.accepted_at === 'string' 
                          ? handoff.accepted_at 
                          : handoff.accepted_at?.utc || ''
                      )}</div>
                    )}
                    {handoff.completed_at && (
                      <div>Completed: {formatDisplayDate(
                        typeof handoff.completed_at === 'string' 
                          ? handoff.completed_at 
                          : handoff.completed_at?.utc || ''
                      )}</div>
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
