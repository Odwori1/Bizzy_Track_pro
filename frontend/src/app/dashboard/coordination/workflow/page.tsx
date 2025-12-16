'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { WorkflowAssignmentCard } from '@/components/department/WorkflowAssignmentCard';
import { useDepartment } from '@/hooks/useDepartment';
import { JobDepartmentAssignment, DepartmentWorkflowHandoff } from '@/types/department';

export default function WorkflowPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'completed' | 'handoffs'>('pending');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showHandoffModal, setShowHandoffModal] = useState<string | null>(null);

  const {
    jobAssignments,
    pendingHandoffs,
    loading,
    error,
    fetchJobAssignments,
    fetchPendingHandoffs,
    updateJobAssignment,
    createHandoff,
    acceptHandoff,
    rejectHandoff,
  } = useDepartment();

  // Check URL for tab parameter
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['pending', 'in_progress', 'completed', 'handoffs'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  // Load data on mount and tab change
  useEffect(() => {
    if (activeTab === 'handoffs') {
      fetchPendingHandoffs();
    } else {
      const filters: any = {};
      if (activeTab === 'pending') filters.status = 'assigned';
      if (activeTab === 'in_progress') filters.status = 'in_progress';
      if (activeTab === 'completed') filters.status = 'completed';

      fetchJobAssignments(filters);
    }
  }, [activeTab, fetchJobAssignments, fetchPendingHandoffs]);

  // Filter assignments by status
  const filteredAssignments = jobAssignments.filter(assignment => {
    if (activeTab === 'pending') return assignment.status === 'assigned';
    if (activeTab === 'in_progress') return assignment.status === 'in_progress';
    if (activeTab === 'completed') return assignment.status === 'completed';
    return true;
  });

  // Handle status update
  const handleStatusUpdate = async (assignmentId: string, newStatus: string) => {
    try {
      await updateJobAssignment(assignmentId, { status: newStatus });
      // Refresh the list
      fetchJobAssignments({ status: activeTab === 'pending' ? 'assigned' : activeTab });
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  // Handle handoff creation
  const handleHandoff = (assignment: JobDepartmentAssignment) => {
    // Navigate to handoff creation page
    router.push(`/dashboard/coordination/workflow/${assignment.id}/handoff`);
  };

  // Handle handoff acceptance with improved error handling
  const handleAcceptHandoff = async (handoffId: string, handoff: DepartmentWorkflowHandoff) => {
    try {
      await acceptHandoff(handoffId, 'Handoff accepted');
      await fetchPendingHandoffs(); // Refresh pending handoffs
      
      // Show success message
      alert('Handoff accepted successfully! A new assignment has been created.');
      
      // Refresh assignments if on assignments tab
      if (activeTab !== 'handoffs') {
        fetchJobAssignments();
      }
    } catch (error: any) {
      console.error('Failed to accept handoff:', error);
      
      // Check for specific error messages
      const errorMessage = error.message || 'Failed to accept handoff';
      
      if (errorMessage.includes('already assigned') || 
          errorMessage.includes('Job already assigned')) {
        
        // Show helpful message with options
        const userChoice = confirm(
          `Cannot accept handoff: Job is already assigned to ${handoff.to_department_name}.\n\n` +
          `Job: ${handoff.job_number} - ${handoff.job_title}\n` +
          `Department: ${handoff.to_department_name}\n\n` +
          'What would you like to do?\n' +
          '• OK: View existing assignment\n' +
          '• Cancel: Reject this handoff'
        );
        
        if (userChoice) {
          // Navigate to assignments filtered by this job
          setSelectedJobId(handoff.job_id);
          setActiveTab('in_progress'); // Most likely where active assignment would be
        } else {
          // Ask if they want to reject the handoff
          const rejectChoice = confirm(
            'Would you like to reject this handoff since the job is already assigned?\n' +
            '(Click OK to reject, Cancel to leave it pending)'
          );
          
          if (rejectChoice) {
            await handleRejectHandoff(handoffId);
          }
        }
      } else {
        // Generic error
        alert(`Error: ${errorMessage}`);
      }
    }
  };

  // Handle handoff rejection
  const handleRejectHandoff = async (handoffId: string) => {
    const reason = prompt('Please enter rejection reason:');
    if (!reason) return;

    try {
      await rejectHandoff(handoffId, reason);
      await fetchPendingHandoffs(); // Refresh pending handoffs
      alert('Handoff rejected successfully.');
    } catch (error) {
      console.error('Failed to reject handoff:', error);
      alert('Failed to reject handoff. Please try again.');
    }
  };

  // Handle job selection for filtering
  const handleJobSelect = (jobId: string | null) => {
    setSelectedJobId(jobId);
  };

  // Add this function to check if job is already assigned to target department
  const isJobAlreadyAssigned = (handoff: DepartmentWorkflowHandoff): boolean => {
    // Check if there's already an assignment for this job to the target department
    const existingAssignment = jobAssignments.find(
      assignment => 
        assignment.job_id === handoff.job_id && 
        assignment.department_id === handoff.to_department_id &&
        assignment.status !== 'completed'
    );
    
    return !!existingAssignment;
  };

  // Get unique jobs for filter
  const uniqueJobs = Array.from(
    new Set(jobAssignments.map(a => a.job_id).filter(Boolean))
  ).map(jobId => {
    const assignment = jobAssignments.find(a => a.job_id === jobId);
    return {
      id: jobId!,
      number: assignment?.job_number || 'Unknown',
      title: assignment?.job_title || 'No title',
    };
  });

  // Format date for display
  const formatDate = (dateData: any): string => {
    if (!dateData) return 'N/A';
    if (dateData.formatted) return dateData.formatted;
    if (typeof dateData === 'string') return new Date(dateData).toLocaleString();
    return 'N/A';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Management</h1>
          <p className="text-gray-600 mt-1">
            Track and manage department assignments and handoffs
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {activeTab !== 'handoffs' && (
            <Link href="/dashboard/coordination/workflow/create">
              <Button variant="primary">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Assignment
              </Button>
            </Link>
          )}

          {activeTab !== 'handoffs' && pendingHandoffs.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setActiveTab('handoffs')}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {pendingHandoffs.length} Pending Handoffs
            </Button>
          )}

          {activeTab === 'handoffs' && (
            <Button
              variant="outline"
              onClick={() => setActiveTab('pending')}
            >
              ← Back to Assignments
            </Button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => activeTab === 'handoffs' ? fetchPendingHandoffs() : fetchJobAssignments()}
            className="mt-2"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Card>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pending
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {jobAssignments.filter(a => a.status === 'assigned').length}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('in_progress')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'in_progress' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                In Progress
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {jobAssignments.filter(a => a.status === 'in_progress').length}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('completed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'completed' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Completed
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {jobAssignments.filter(a => a.status === 'completed').length}
                </span>
              </div>
            </button>

            <button
              onClick={() => setActiveTab('handoffs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'handoffs' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            >
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Handoffs
                <span className="ml-2 bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                  {pendingHandoffs.length}
                </span>
              </div>
            </button>
          </nav>
        </div>
      </Card>

      {/* HANDOFFS VIEW */}
      {activeTab === 'handoffs' && (
        <div className="space-y-6">
          {/* Pending Handoffs Count */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Pending Handoffs</h2>
            <div className="text-sm text-gray-600">
              {pendingHandoffs.length} pending handoff{pendingHandoffs.length !== 1 ? 's' : ''}
            </div>
          </div>

          {loading && pendingHandoffs.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading handoffs...</div>
            </div>
          ) : pendingHandoffs.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No pending handoffs</h3>
                <p className="mt-1 text-gray-500">
                  All handoffs have been processed. Create new handoffs from in-progress assignments.
                </p>
                <div className="mt-6">
                  <Button
                    variant="primary"
                    onClick={() => setActiveTab('in_progress')}
                  >
                    View In-Progress Assignments
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {pendingHandoffs.map((handoff: DepartmentWorkflowHandoff) => {
                // Check if job is already assigned to target department
                const isAlreadyAssigned = jobAssignments.some(
                  assignment => 
                    assignment.job_id === handoff.job_id && 
                    assignment.department_id === handoff.to_department_id &&
                    assignment.status !== 'completed'
                );
                
                return (
                  <Card key={handoff.id} className="overflow-hidden">
                    <div className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                        {/* Handoff Info */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-gray-900">
                                Handoff: {handoff.from_department_name} → {handoff.to_department_name}
                              </h3>
                              <p className="text-sm text-gray-600 mt-1">
                                Job: {handoff.job_number} - {handoff.job_title}
                              </p>
                              {isAlreadyAssigned && (
                                <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  ⚠️ Already assigned to this department
                                </div>
                              )}
                            </div>
                            <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                              Pending
                            </span>
                          </div>

                          {/* Warning for already assigned jobs */}
                          {isAlreadyAssigned && (
                            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                              <div className="flex items-center">
                                <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-sm font-medium text-red-800">
                                  Cannot Accept: Assignment Already Exists
                                </span>
                              </div>
                              <p className="text-sm text-red-600 mt-1">
                                This job is already assigned to {handoff.to_department_name}. 
                                You need to either:
                              </p>
                              <ul className="text-sm text-red-600 mt-1 list-disc list-inside">
                                <li>Complete or cancel the existing assignment first</li>
                                <li>Reject this handoff</li>
                                <li>Change the assignment type on the existing assignment</li>
                              </ul>
                            </div>
                          )}

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-gray-500">From Department</div>
                              <div className="font-medium">{handoff.from_department_name}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">To Department</div>
                              <div className="font-medium">{handoff.to_department_name}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Handoff By</div>
                              <div className="font-medium">{handoff.handoff_by_name}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Handoff Time</div>
                              <div className="font-medium">{formatDate(handoff.handoff_at)}</div>
                            </div>
                          </div>

                          {/* Handoff Notes */}
                          {handoff.handoff_notes && (
                            <div className="mt-4">
                              <div className="text-sm text-gray-500">Notes</div>
                              <div className="mt-1 p-3 bg-gray-50 rounded border">
                                {handoff.handoff_notes}
                              </div>
                            </div>
                          )}

                          {/* Required Actions */}
                          {handoff.required_actions && Object.keys(handoff.required_actions).length > 0 && (
                            <div className="mt-4">
                              <div className="text-sm text-gray-500">Required Actions</div>
                              <div className="mt-1 p-3 bg-blue-50 rounded border border-blue-100">
                                <ul className="list-disc list-inside space-y-1">
                                  {Object.entries(handoff.required_actions).map(([key, value]) => (
                                    <li key={key} className="text-sm">
                                      <span className="font-medium">{key}:</span> {String(value)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col space-y-3 lg:w-48">
                          <Button
                            variant="primary"
                            onClick={() => handleAcceptHandoff(handoff.id, handoff)}
                            className="w-full"
                            disabled={isAlreadyAssigned}
                          >
                            {isAlreadyAssigned ? 'Cannot Accept' : 'Accept Handoff'}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleRejectHandoff(handoff.id)}
                            className="w-full"
                          >
                            Reject Handoff
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              // View assignments for this job
                              setSelectedJobId(handoff.job_id);
                              setActiveTab('in_progress');
                            }}
                            className="w-full"
                          >
                            View Job Assignments
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ASSIGNMENTS VIEW (Non-handoffs tabs) */}
      {activeTab !== 'handoffs' && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Job Filter */}
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">Filter by Job:</label>
                <select
                  value={selectedJobId || ''}
                  onChange={(e) => handleJobSelect(e.target.value || null)}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Jobs</option>
                  {uniqueJobs.map(job => (
                    <option key={job.id} value={job.id}>
                      {job.number} - {job.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              Showing {filteredAssignments.length} assignment{filteredAssignments.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Pending Handoffs Alert (only show on non-handoffs tabs) */}
          {activeTab !== 'handoffs' && pendingHandoffs.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-yellow-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <div className="font-medium text-yellow-800">
                    {pendingHandoffs.length} pending handoff{pendingHandoffs.length !== 1 ? 's' : ''} require attention
                  </div>
                  <div className="text-yellow-700 text-sm mt-1">
                    Department handoffs are waiting for acceptance
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('handoffs')}
                >
                  View Handoffs
                </Button>
              </div>
            </div>
          )}

          {/* Assignments Content */}
          {loading && filteredAssignments.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500">Loading assignments...</div>
            </div>
          ) : filteredAssignments.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">No assignments found</h3>
                <p className="mt-1 text-gray-500">
                  {activeTab === 'pending'
                    ? 'No pending assignments. Assign jobs to departments to get started.'
                    : `No ${activeTab} assignments.`}
                </p>
                <div className="mt-6">
                  <Link href="/dashboard/coordination/workflow/create">
                    <Button variant="primary">
                      Create Assignment
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {filteredAssignments
                .filter(assignment => !selectedJobId || assignment.job_id === selectedJobId)
                .map((assignment) => (
                  <WorkflowAssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onStatusUpdate={handleStatusUpdate}
                    onHandoff={handleHandoff}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
