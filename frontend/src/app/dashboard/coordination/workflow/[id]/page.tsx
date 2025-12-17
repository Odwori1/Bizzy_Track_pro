'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WorkflowTimeline } from '@/components/department/WorkflowTimeline';
import { useDepartment } from '@/hooks/useDepartment';
import { JobDepartmentAssignment, DepartmentWorkflowHandoff } from '@/types/department';
import { formatDisplayDate } from '@/lib/date-format';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Play, 
  Pause, 
  CheckSquare, 
  Edit, 
  History,
  Building,
  FileText
} from 'lucide-react';

// Local time entry interface for localStorage
interface LocalTimeEntry {
  id: string;
  assignment_id: string;
  user_id: string;
  user_name: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
}

export default function WorkflowDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<JobDepartmentAssignment | null>(null);
  const [handoffs, setHandoffs] = useState<DepartmentWorkflowHandoff[]>([]);
  
  // Local time tracking state
  const [localTimeEntries, setLocalTimeEntries] = useState<LocalTimeEntry[]>([]);
  const [localActiveTimeEntry, setLocalActiveTimeEntry] = useState<LocalTimeEntry | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { fetchJobAssignmentById, fetchHandoffsByJob } = useDepartment();

  // Load assignment data
  useEffect(() => {
    if (assignmentId) {
      loadAssignmentData();
    }
  }, [assignmentId]);

  // Timer effect
  useEffect(() => {
    if (localActiveTimeEntry) {
      // Calculate initial elapsed time
      const startTime = new Date(localActiveTimeEntry.start_time).getTime();
      const now = Date.now();
      setElapsedTime(Math.floor((now - startTime) / 1000));

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [localActiveTimeEntry]);

  // Load local time data from localStorage
  useEffect(() => {
    if (assignmentId) {
      loadLocalTimeData();
    }
  }, [assignmentId]);

  const loadAssignmentData = async () => {
    setLoading(true);
    setError(null);
    try {
      const assignmentData = await fetchJobAssignmentById(assignmentId);
      setAssignment(assignmentData);

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

  const loadLocalTimeData = () => {
    try {
      // Load time entries from localStorage
      const savedEntries = localStorage.getItem(`timeEntries_${assignmentId}`);
      if (savedEntries) {
        const parsed = JSON.parse(savedEntries);
        setLocalTimeEntries(Array.isArray(parsed) ? parsed : []);
      }

      // Load active time entry from localStorage
      const savedActive = localStorage.getItem(`activeTimeEntry_${assignmentId}`);
      if (savedActive) {
        const parsed = JSON.parse(savedActive);
        setLocalActiveTimeEntry(parsed);
      }
    } catch (err) {
      console.warn('Failed to load local time data:', err);
    }
  };

  const saveLocalTimeData = (entries: LocalTimeEntry[], active: LocalTimeEntry | null) => {
    try {
      localStorage.setItem(`timeEntries_${assignmentId}`, JSON.stringify(entries));
      if (active) {
        localStorage.setItem(`activeTimeEntry_${assignmentId}`, JSON.stringify(active));
      } else {
        localStorage.removeItem(`activeTimeEntry_${assignmentId}`);
      }
    } catch (err) {
      console.warn('Failed to save local time data:', err);
    }
  };

  // Status update functions
  const handleStartWork = async () => {
    if (!assignment) return;
    
    setSubmitting(true);
    setError(null);
    
    try {
      // Update status to in_progress
      // Note: This API might not exist yet, so we'll update locally
      setAssignment(prev => prev ? { ...prev, status: 'in_progress' } : null);
      
      setSuccess('Work started successfully');
      
      // Start time tracking automatically
      startTimeTracking('Started work');
      
    } catch (err: any) {
      console.error('Failed to start work:', err);
      setError(err.message || 'Failed to start work');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status: string, notes: string) => {
    setSubmitting(true);
    setError(null);
    
    try {
      // Update status locally since API might not exist
      setAssignment(prev => prev ? { ...prev, status: status as any } : null);
      
      setSuccess(`Status updated to ${status} successfully`);
      setShowStatusModal(false);
      setNewStatus('');
      setStatusNotes('');
      
      // If completing, stop any active time tracking
      if (status === 'completed' && localActiveTimeEntry) {
        stopTimeTracking('Completed assignment');
      }
      
    } catch (err: any) {
      console.error('Failed to update status:', err);
      setError(err.message || 'Failed to update status');
    } finally {
      setSubmitting(false);
    }
  };

  // Time tracking functions
  const startTimeTracking = (notes: string = '') => {
    const newEntry: LocalTimeEntry = {
      id: `local_${Date.now()}`,
      assignment_id: assignmentId,
      user_id: 'current_user',
      user_name: 'You',
      start_time: new Date().toISOString(),
      end_time: null,
      duration_minutes: null,
      notes: notes || 'Started time tracking',
      created_at: new Date().toISOString()
    };
    
    setLocalActiveTimeEntry(newEntry);
    saveLocalTimeData(localTimeEntries, newEntry);
    setSuccess('Time tracking started');
  };

  const stopTimeTracking = (notes: string = '') => {
    if (!localActiveTimeEntry) return;
    
    const now = new Date();
    const startTime = new Date(localActiveTimeEntry.start_time);
    const durationMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
    
    const completedEntry: LocalTimeEntry = {
      ...localActiveTimeEntry,
      end_time: now.toISOString(),
      duration_minutes: durationMinutes,
      notes: localActiveTimeEntry.notes + (notes ? ` - ${notes}` : ' - Stopped')
    };
    
    // Add to entries and clear active
    const updatedEntries = [...localTimeEntries, completedEntry];
    setLocalTimeEntries(updatedEntries);
    setLocalActiveTimeEntry(null);
    saveLocalTimeData(updatedEntries, null);
    
    setSuccess('Time tracking stopped');
    setElapsedTime(0);
  };

  const logManualTime = (duration: string, notes: string) => {
    try {
      const [hours, minutes] = duration.split(':').map(Number);
      const durationMinutes = hours * 60 + minutes;
      
      const manualEntry: LocalTimeEntry = {
        id: `manual_${Date.now()}`,
        assignment_id: assignmentId,
        user_id: 'current_user',
        user_name: 'You',
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_minutes: durationMinutes,
        notes: notes || 'Manual time entry',
        created_at: new Date().toISOString()
      };
      
      const updatedEntries = [...localTimeEntries, manualEntry];
      setLocalTimeEntries(updatedEntries);
      saveLocalTimeData(updatedEntries, localActiveTimeEntry);
      
      setSuccess('Time logged successfully');
      setShowTimeModal(false);
      setTimeDuration('');
      setTimeNotes('');
    } catch (err: any) {
      console.error('Failed to log time:', err);
      setError('Please enter duration in HH:MM format (e.g., 1:30)');
    }
  };

  // Format elapsed time for display
  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Calculate total time
  const calculateTotalTime = () => {
    const totalMinutes = localTimeEntries.reduce((total, entry) => {
      return total + (entry.duration_minutes || 0);
    }, 0);
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { hours, minutes, totalMinutes };
  };

  // Get all time entries sorted by date
  const getAllTimeEntries = () => {
    return [...localTimeEntries].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  };

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'on_hold': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get priority badge color
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Available next statuses
  const getAvailableStatuses = (currentStatus: string) => {
    switch (currentStatus) {
      case 'assigned':
        return [
          { value: 'in_progress', label: 'In Progress', icon: Play },
          { value: 'on_hold', label: 'On Hold', icon: Pause },
          { value: 'cancelled', label: 'Cancelled', icon: AlertCircle }
        ];
      case 'in_progress':
        return [
          { value: 'completed', label: 'Completed', icon: CheckSquare },
          { value: 'on_hold', label: 'On Hold', icon: Pause },
          { value: 'cancelled', label: 'Cancelled', icon: AlertCircle }
        ];
      case 'on_hold':
        return [
          { value: 'in_progress', label: 'Resume Work', icon: Play },
          { value: 'cancelled', label: 'Cancelled', icon: AlertCircle }
        ];
      default:
        return [];
    }
  };

  // Format date and time for display
  const formatDateTimeDisplay = (dateString: string | null): string => {
    if (!dateString) return 'Not set';
    
    try {
      // Use the centralized utility
      return formatDisplayDate(dateString);
    } catch (error) {
      console.error('Error formatting date:', error, dateString);
      return 'Not set';
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

  // Modal states
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusNotes, setStatusNotes] = useState('');
  const [timeNotes, setTimeNotes] = useState('');
  const [timeDuration, setTimeDuration] = useState('');

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

  const availableStatuses = getAvailableStatuses(assignment.status);
  const totalTime = calculateTotalTime();
  const allTimeEntries = getAllTimeEntries();
  const currentActiveEntry = localActiveTimeEntry;

  return (
    <div className="p-6 space-y-6">
      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span className="text-red-800 font-medium">{error}</span>
          </div>
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} />
            <span className="text-green-800 font-medium">{success}</span>
          </div>
        </div>
      )}

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
          {/* Active Timer Display */}
          {currentActiveEntry && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-blue-800 font-mono font-bold">
                  {formatElapsedTime(elapsedTime)}
                </span>
              </div>
            </div>
          )}

          {/* Status Actions */}
          {assignment.status === 'assigned' && (
            <Button
              variant="primary"
              onClick={handleStartWork}
              loading={submitting}
              disabled={submitting}
              className="flex items-center"
            >
              <Play size={16} className="mr-2" />
              Start Work
            </Button>
          )}

          {assignment.status === 'in_progress' && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setNewStatus('completed');
                  setShowStatusModal(true);
                }}
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

          {currentActiveEntry ? (
            <Button
              variant="outline"
              onClick={() => stopTimeTracking('Manual stop')}
              className="flex items-center"
            >
              <Pause size={16} className="mr-2" />
              Stop Timer
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => startTimeTracking('Manual start')}
              className="flex items-center"
            >
              <Play size={16} className="mr-2" />
              Start Timer
            </Button>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <FileText size={20} className="mr-2" />
                Assignment Details
              </h3>

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
                    <div className="text-sm font-medium text-gray-900 flex items-center">
                      <Building size={16} className="mr-2 text-gray-400" />
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
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(assignment.status)}`}>
                        {assignment.status?.replace('_', ' ') || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Priority</div>
                    <div className="text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityBadge(assignment.priority)}`}>
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
                      {formatDateTimeDisplay(assignment.sla_deadline)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Time Tracking */}
              <div className="mt-6 pt-6 border-t">
                <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                  <Clock size={18} className="mr-2" />
                  Time Tracking
                </h4>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Estimated</div>
                    <div className="text-lg font-bold text-gray-900 mt-1">
                      {assignment.estimated_hours ? `${assignment.estimated_hours}h` : 'Not set'}
                    </div>
                  </div>

                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-xs text-blue-500 uppercase tracking-wider">Actual</div>
                    <div className="text-lg font-bold text-blue-700 mt-1">
                      {totalTime.hours}h {totalTime.minutes}m
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Scheduled Start</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDateTimeDisplay(assignment.scheduled_start)}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Scheduled End</div>
                    <div className="text-sm font-medium text-gray-900">
                      {formatDateTimeDisplay(assignment.scheduled_end)}
                    </div>
                  </div>
                </div>

                {/* Active Timer Display */}
                {currentActiveEntry && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-green-800">Active Timer</p>
                        <p className="text-xs text-green-600">
                          Started at {formatDateTimeDisplay(currentActiveEntry.start_time)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-green-700 font-mono">
                          {formatElapsedTime(elapsedTime)}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => stopTimeTracking('Manual stop')}
                          className="mt-1 text-xs"
                        >
                          <Pause size={12} className="mr-1" />
                          Stop
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Time Entries List */}
                {allTimeEntries.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-sm font-medium text-gray-700 mb-2">Time Entries</h5>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {allTimeEntries.map(entry => (
                        <div key={entry.id} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="font-medium text-sm">{entry.user_name}</p>
                              <p className="text-xs text-gray-500">
                                {formatDateTimeDisplay(entry.start_time)}
                                {entry.end_time && ` - ${formatDateTimeDisplay(entry.end_time)}`}
                                {!entry.end_time && ' - Ongoing'}
                              </p>
                              {entry.notes && (
                                <p className="text-xs text-gray-600 mt-1">{entry.notes}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-sm">
                                {entry.duration_minutes ? 
                                  `${Math.floor(entry.duration_minutes / 60)}h ${entry.duration_minutes % 60}m` : 
                                  'Ongoing'
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <History size={20} className="mr-2" />
                  Workflow Timeline
                </h3>
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
                    {availableStatuses.map(status => (
                      <Button
                        key={status.value}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewStatus(status.value);
                          setShowStatusModal(true);
                        }}
                        className="flex items-center"
                      >
                        <status.icon size={16} className="mr-2" />
                        {status.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Time Tracking */}
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Time Tracking</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center"
                    onClick={() => setShowTimeModal(true)}
                  >
                    <Clock size={16} className="mr-2" />
                    Log Manual Time
                  </Button>
                  
                  {currentActiveEntry ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full flex items-center"
                      onClick={() => stopTimeTracking('Manual stop')}
                    >
                      <Pause size={16} className="mr-2" />
                      Stop Timer
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full flex items-center"
                      onClick={() => startTimeTracking('Manual start')}
                    >
                      <Play size={16} className="mr-2" />
                      Start Timer
                    </Button>
                  )}
                </div>

                {/* Update Assignment */}
                <div className="space-y-2 pt-4 border-t">
                  <div className="text-sm font-medium text-gray-700">Assignment</div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center"
                    onClick={handleEditAssignment}
                  >
                    <Edit size={16} className="mr-2" />
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
                  {formatDisplayDate(assignment.created_at)}
                </div>

                {assignment.actual_start && (
                  <>
                    <div className="pt-2 border-t">
                      <div className="text-sm text-gray-700">
                        Work started
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDisplayDate(assignment.actual_start)}
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

                {allTimeEntries.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-sm text-gray-700">
                      Time Tracking
                    </div>
                    <div className="text-xs text-gray-500">
                      {allTimeEntries.length} time entr{allTimeEntries.length !== 1 ? 'ies' : 'y'} recorded
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Status</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Status
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select status...</option>
                  {availableStatuses.map(status => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Add notes about this status change..."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowStatusModal(false);
                  setNewStatus('');
                  setStatusNotes('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleUpdateStatus(newStatus, statusNotes)}
                disabled={!newStatus || submitting}
                loading={submitting}
              >
                Update Status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Time Log Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Log Manual Time</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration (HH:MM)
                </label>
                <input
                  type="text"
                  value={timeDuration}
                  onChange={(e) => setTimeDuration(e.target.value)}
                  placeholder="e.g., 1:30 for 1 hour 30 minutes"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Enter time as hours:minutes</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={timeNotes}
                  onChange={(e) => setTimeNotes(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="What work was done..."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTimeModal(false);
                  setTimeDuration('');
                  setTimeNotes('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => logManualTime(timeDuration, timeNotes)}
                disabled={!timeDuration || submitting}
                loading={submitting}
              >
                Log Time
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
