'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDisplayDate, formatTime } from '@/lib/date-format';
import { useAuthStore } from '@/store/authStore';
import { useUnifiedEmployeesStore } from '@/store/unifiedEmployeesStore';
import { UnifiedEmployee, ClockEvent } from '@/types/unifiedEmployees';

export default function TimeClockPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();

  // Use the unified store instead of hook
  const {
    employees,
    clockEvents,
    loading: storeLoading,
    error: storeError,
    actions
  } = useUnifiedEmployeesStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [clockNotes, setClockNotes] = useState<string>('');
  const [clockLocation, setClockLocation] = useState<string>('');

  // Get current user's employee record
  const currentUserEmployee = employees.find(emp => emp.id === user?.id);

  // DEBUG: Add this to see what data we're actually working with
  useEffect(() => {
    console.log('=== DEBUG: CLOCK PAGE DATA ===');
    console.log('1. Employees loaded:', employees.length);

    // Find EMP001 in employees
    const emp001 = employees.find(emp => emp.employee_id === 'EMP001');
    console.log('2. EMP001 in employees:', emp001);
    if (emp001) {
      console.log('   - ID:', emp001.id);
      console.log('   - Employee ID:', emp001.employee_id);
      console.log('   - Name:', emp001.full_name);
    }

    console.log('3. All clock events:', clockEvents.length);

    // Find all events with employee_id EMP001
    const emp001Events = clockEvents.filter(event => event.employee_id === 'EMP001');
    console.log('4. Events with employee_id EMP001:', emp001Events.length);
    if (emp001Events.length > 0) {
      console.log('   - Latest events:', emp001Events.slice(0, 3).map(e => ({
        type: e.event_type,
        time: e.event_time?.utc,
        id: e.id
      })));
    }

    // Check the selected employee
    if (selectedEmployeeId) {
      const selectedEmp = employees.find(emp => emp.id === selectedEmployeeId);
      console.log('5. Selected employee:', selectedEmp);
    }

    console.log('=== END DEBUG ===');
  }, [employees, clockEvents, selectedEmployeeId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (currentUserEmployee) {
      setSelectedEmployeeId(currentUserEmployee.id);
    }
  }, [currentUserEmployee]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Loading data from unified store...');

      // Fetch employees first
      await actions.fetchEmployees();

      // PERMISSION-AWARE CLOCK EVENTS LOADING
      // Owner/Manager: can see all events
      // Staff: can only see their own events
      if (user?.role === 'owner' || user?.role === 'manager') {
        // Load all clock events
        await actions.fetchClockEvents(undefined, 50);
      } else if (currentUserEmployee?.employee_id) {
        // Load only this user's events
        console.log('Staff user - loading only own events:', currentUserEmployee.employee_id);
        await actions.fetchClockEvents(currentUserEmployee.employee_id, 50);
      } else {
        console.warn('No employee record found for current user');
      }

      console.log('Loaded employees:', employees?.length || 0);
      console.log('Loaded events:', clockEvents?.length || 0);
    } catch (err: any) {
      console.error('Error loading data:', err);
      
      // Handle permission errors gracefully
      if (err.message.includes('403') || err.message.includes('Insufficient permissions')) {
        setError('You do not have permission to view all clock events. Showing only your events.');
        // Try to load just their own events
        if (currentUserEmployee?.employee_id) {
          try {
            await actions.fetchClockEvents(currentUserEmployee.employee_id, 50);
          } catch (retryErr) {
            console.error('Failed to load own events:', retryErr);
          }
        }
      } else {
        setError(err.message || 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  };

  // Test function for diagnostics
  const runDiagnostics = async () => {
    console.log('🔍 Running Clock System Diagnostics...');

    // Test 1: Direct API call
    try {
      const response = await fetch('http://localhost:8002/api/employees/clock-events?limit=5', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      console.log('API Direct Response:', data);
    } catch (error) {
      console.error('API Test Failed:', error);
    }

    // Test 2: Check store data structure
    console.log('Store Employees:', employees.map(e => ({
      id: e.id,
      employee_id: e.employee_id,
      full_name: e.full_name
    })));

    // Test 3: Check event matching
    const testEmployee = employees.find(emp => emp.employee_id === 'EMP001');
    if (testEmployee) {
      console.log('Testing EMP001 matching:');
      console.log('Employee object:', testEmployee);

      const matchedEvents = clockEvents.filter(event => {
        const matches = [
          event.employee_id === testEmployee.employee_id,
          event.staff_profile_id === testEmployee.employee_id,
          event.staff_profile_id === testEmployee.id
        ];
        console.log(`Event ${event.id}:`, {
          event_employee_id: event.employee_id,
          event_staff_profile_id: event.staff_profile_id,
          matches: matches
        });
        return matches.some(m => m);
      });

      console.log('Matched events count:', matchedEvents.length);
    }
  };

  // Find events for an employee by matching employee_id (EMPxxx format)
  const findEventsForEmployee = (employeeId: string) => {
    const employee = employees.find(emp => emp.id === employeeId);
    if (!employee) {
      console.log('Employee not found:', employeeId);
      return [];
    }

    console.log('Matching events for:', {
      employee_id: employee.employee_id,
      employee_uuid: employee.id,
      employee_db_id: employee.db_id // if exists
    });

    const matchedEvents = clockEvents.filter(event => {
      // SIMPLE: Just match by employee_id (EMPxxx format)
      const match = event.employee_id === employee.employee_id;

      if (match) {
        console.log('Matched event:', {
          event_id: event.id,
          event_employee_id: event.employee_id,
          event_staff_profile_id: event.staff_profile_id,
          event_type: event.event_type,
          event_time: event.event_time?.utc
        });
      }

      return match;
    });

    console.log(`Total matched events for ${employee.employee_id}:`, matchedEvents.length);
    return matchedEvents;
  };

  const getCurrentStatus = (employeeId: string) => {
    const employeeEvents = findEventsForEmployee(employeeId);
    if (employeeEvents.length === 0) {
      console.log(`No events found for employee ${employeeId}, returning 'out'`);
      return 'out';
    }

    // Process events in chronological order to track state
    const sortedEvents = [...employeeEvents].sort((a, b) => {
      const timeA = a.event_time ? new Date(a.event_time.utc).getTime() : 0;
      const timeB = b.event_time ? new Date(b.event_time.utc).getTime() : 0;
      return timeA - timeB; // Oldest first for state tracking
    });

    console.log(`Processing ${sortedEvents.length} events for status calculation:`);
    sortedEvents.forEach((event, i) => {
      console.log(`  ${i+1}. ${event.event_type} at ${event.event_time?.utc}`);
    });

    let currentState = 'out';

    for (const event of sortedEvents) {
      switch (event.event_type) {
        case 'clock_in':
          currentState = 'in';
          console.log(`  After ${event.event_type}: state = ${currentState}`);
          break;
        case 'clock_out':
          currentState = 'out';
          console.log(`  After ${event.event_type}: state = ${currentState}`);
          break;
        case 'break_start':
          if (currentState === 'in') {
            currentState = 'break';
            console.log(`  After ${event.event_type}: state = ${currentState}`);
          }
          break;
        case 'break_end':
          if (currentState === 'break') {
            currentState = 'in';
            console.log(`  After ${event.event_type}: state = ${currentState}`);
          }
          break;
      }
    }

    console.log(`Final state for employee ${employeeId}: ${currentState}`);
    return currentState;
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'in': 'bg-green-100 text-green-800 border-green-200',
      'out': 'bg-gray-100 text-gray-800 border-gray-200',
      'break': 'bg-yellow-100 text-yellow-800 border-yellow-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      'in': 'CLOCKED IN',
      'out': 'CLOCKED OUT',
      'break': 'ON BREAK'
    };
    return texts[status] || 'UNKNOWN';
  };

  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      'in': '🟢',
      'out': '⚫',
      'break': '🟡'
    };
    return icons[status] || '⚪';
  };

  const handleClockAction = async (action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') => {
    if (!selectedEmployeeId) {
      setError('Please select an employee');
      return;
    }

    setActionLoading(action);
    setError(null);

    try {
      let locationToSend = clockLocation.trim();
      let notesToSend = clockNotes.trim();

      if (locationToSend && notesToSend) {
        notesToSend = `[Location: ${locationToSend}] ${notesToSend}`;
      } else if (locationToSend && !notesToSend) {
        notesToSend = `Location: ${locationToSend}`;
      } else if (!notesToSend) {
        notesToSend = action === 'clock_in' ? 'Clocked in' :
                     action === 'clock_out' ? 'Clocked out' :
                     action.replace('_', ' ');
      }

      const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
      if (!selectedEmployee) {
        throw new Error('Selected employee not found');
      }

      // Use store actions instead of hook
      if (action === 'clock_in') {
        await actions.clockIn(selectedEmployee.employee_id, notesToSend);
      } else if (action === 'clock_out') {
        await actions.clockOut(selectedEmployee.employee_id, notesToSend);
      } else if (action === 'break_start') {
        await actions.startBreak(selectedEmployee.employee_id);
      } else if (action === 'break_end') {
        await actions.endBreak(selectedEmployee.employee_id);
      }

      setClockNotes('');
      setClockLocation('');
      await loadData();
    } catch (err: any) {
      console.error(`Error during ${action}:`, err);
      setError(err.message || `Failed to ${action.replace('_', ' ')}`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatEventType = (type: string) => {
    return type.replace('_', ' ').toUpperCase();
  };

  // Calculate shift duration for an employee
  const calculateShiftDuration = (employeeId: string) => {
    const employeeEvents = findEventsForEmployee(employeeId);
    if (employeeEvents.length < 2) return null;

    let lastClockIn = null;
    let totalMs = 0;

    const sortedEvents = [...employeeEvents].sort((a, b) => {
      const timeA = a.event_time ? new Date(a.event_time.utc).getTime() : 0;
      const timeB = b.event_time ? new Date(b.event_time.utc).getTime() : 0;
      return timeA - timeB;
    });

    for (const event of sortedEvents) {
      if (event.event_type === 'clock_in' && event.event_time) {
        lastClockIn = new Date(event.event_time.utc);
      } else if (event.event_type === 'clock_out' && lastClockIn && event.event_time) {
        const clockOutTime = new Date(event.event_time.utc);
        totalMs += (clockOutTime.getTime() - lastClockIn.getTime());
        lastClockIn = null;
      }
    }

    // If currently clocked in, add time from last clock_in to now
    if (lastClockIn) {
      totalMs += (new Date().getTime() - lastClockIn.getTime());
    }

    if (totalMs === 0) return null;

    const hours = Math.floor(totalMs / (1000 * 60 * 60));
    const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Get current shift start time
  const getCurrentShiftStart = (employeeId: string) => {
    const employeeEvents = findEventsForEmployee(employeeId);
    if (employeeEvents.length === 0) return null;

    // Sort by event_time descending to get most recent
    const sortedEvents = [...employeeEvents].sort((a, b) => {
      const timeA = a.event_time ? new Date(a.event_time.utc).getTime() : 0;
      const timeB = b.event_time ? new Date(b.event_time.utc).getTime() : 0;
      return timeB - timeA;
    });

    // Look for the most recent clock_in without a subsequent clock_out
    let foundClockIn = false;
    for (const event of sortedEvents) {
      if (event.event_type === 'clock_out') {
        // If we hit a clock_out first, there's no active shift
        break;
      } else if (event.event_type === 'clock_in' && event.event_time) {
        // Check if there's a clock_out after this clock_in
        const eventTime = new Date(event.event_time.utc).getTime();
        const hasClockOutAfter = sortedEvents.some(e =>
          e.event_type === 'clock_out' &&
          e.event_time &&
          new Date(e.event_time.utc).getTime() > eventTime
        );

        if (!hasClockOutAfter) {
          foundClockIn = true;
          return event.event_time.utc;
        }
      }
    }

    return null;
  };

  // Fix for event time display
  const getEventTimeForDisplay = (event: ClockEvent) => {
    if (!event.event_time) return null;

    try {
      if (typeof event.event_time === 'string') {
        return new Date(event.event_time);
      } else if (typeof event.event_time === 'object' && event.event_time.utc) {
        return new Date(event.event_time.utc);
      } else if (typeof event.event_time === 'object' && event.event_time.timestamp) {
        return new Date(event.event_time.timestamp);
      }
    } catch (error) {
      console.error('Error parsing event time:', error, event);
    }

    return null;
  };

  if (authLoading || loading || storeLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading time clock...</div>
      </div>
    );
  }

  const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
  const currentStatus = selectedEmployee ? getCurrentStatus(selectedEmployee.id) : 'out';
  const shiftDuration = selectedEmployee ? calculateShiftDuration(selectedEmployee.id) : null;
  const shiftStart = selectedEmployee ? getCurrentShiftStart(selectedEmployee.id) : null;

  const StatusIndicator = ({ status }: { status: string }) => {
    const statusConfig = {
      'in': {
        color: 'bg-green-500',
        text: 'Clocked In',
        description: 'Active and working',
        icon: '🟢'
      },
      'out': {
        color: 'bg-gray-400',
        text: 'Clocked Out',
        description: 'Not currently working',
        icon: '⚫'
      },
      'break': {
        color: 'bg-yellow-500',
        text: 'On Break',
        description: 'Taking a scheduled break',
        icon: '🟡'
      }
    };

    const config = statusConfig[status] || statusConfig.out;

    return (
      <div className="flex items-center space-x-3">
        <div className={`w-4 h-4 rounded-full ${config.color} animate-pulse`}></div>
        <div>
          <div className="font-semibold">{config.text}</div>
          <div className="text-sm text-gray-600">{config.description}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Time Clock</h1>
            <p className="text-gray-600 mt-1">
              Real-time staff attendance tracking
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/timesheets/clock-events')}
            >
              View Detailed History
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/timesheets')}
            >
              View Timesheets
            </Button>
            <Button
              variant="outline"
              onClick={loadData}
            >
              Refresh
            </Button>
            {/* Diagnostic button - temporary for debugging */}
            <Button
              variant="outline"
              onClick={runDiagnostics}
              className="border-orange-300 text-orange-600"
            >
              Run Diagnostics
            </Button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {(error || storeError) && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-red-800">{error || storeError}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Employee Selection & Actions */}
        <div className="lg:col-span-2 space-y-6">
          {/* Professional Status Display */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Current Status</span>
                {selectedEmployee && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-normal text-gray-600">
                      {getStatusIcon(currentStatus)}
                    </span>
                    <Badge className={getStatusBadge(currentStatus)}>
                      {getStatusText(currentStatus)}
                    </Badge>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEmployee ? (
                <div className="space-y-4">
                  <StatusIndicator status={currentStatus} />

                  {shiftStart && currentStatus !== 'out' && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div>
                        <div className="text-sm text-gray-600">Shift Started</div>
                        <div className="font-medium">
                          {formatTime(shiftStart)}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">Duration</div>
                        <div className="font-medium">
                          {shiftDuration || 'Calculating...'}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <div className="text-sm text-gray-600 mb-2">Employee Information</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500">Employee</div>
                        <div className="font-medium">{selectedEmployee.full_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">ID & Role</div>
                        <div className="font-medium">
                          {selectedEmployee.employee_id} • {selectedEmployee.job_title}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  Select an employee to view status
                </div>
              )}
            </CardContent>
          </Card>

          {/* Employee Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Employee</CardTitle>
              <CardDescription>Choose who is clocking in/out</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Label htmlFor="employee_select" className="block text-sm font-medium text-gray-700 mb-2">
                  Employee
                </Label>
                <select
                  id="employee_select"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select an employee...</option>
                  {employees.filter(emp => emp.is_active).map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name} ({employee.employee_id}) • {getStatusText(getCurrentStatus(employee.id))}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status summary */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold text-green-600">
                    {employees.filter(emp => getCurrentStatus(emp.id) === 'in').length}
                  </div>
                  <div className="text-xs text-gray-600">Clocked In</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold text-yellow-600">
                    {employees.filter(emp => getCurrentStatus(emp.id) === 'break').length}
                  </div>
                  <div className="text-xs text-gray-600">On Break</div>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <div className="text-lg font-bold text-gray-600">
                    {employees.filter(emp => getCurrentStatus(emp.id) === 'out').length}
                  </div>
                  <div className="text-xs text-gray-600">Clocked Out</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Clock Actions with Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Clock Actions</CardTitle>
              <CardDescription>
                {selectedEmployee ? `Actions for ${selectedEmployee.full_name}` : 'Select an employee first'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="details" className="mb-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Event Details</TabsTrigger>
                  <TabsTrigger value="location">Location Info</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="space-y-4">
                  <div>
                    <Label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                      Notes (Optional)
                    </Label>
                    <Input
                      id="notes"
                      value={clockNotes}
                      onChange={(e) => setClockNotes(e.target.value)}
                      placeholder="Add notes for this clock event..."
                      className="w-full"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="location" className="space-y-4">
                  <div>
                    <Label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                      Location (Optional but Recommended)
                    </Label>
                    <Input
                      id="location"
                      value={clockLocation}
                      onChange={(e) => setClockLocation(e.target.value)}
                      placeholder="e.g., Main Office, Site A, Remote Work, etc."
                      className="w-full"
                    />
                    <div className="mt-2 space-y-1 text-sm text-gray-500">
                      <p>📍 Location helps track where work is being done</p>
                      <p>📱 For field staff, describe the work site</p>
                      <p>🏢 For office staff, specify department or floor</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Dynamic Action Buttons */}
              <div className="space-y-4">
                {currentStatus === 'out' && (
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="font-medium text-green-800 mb-3">Ready to start work</p>
                    <Button
                      size="lg"
                      className="w-full h-16 text-lg bg-green-600 hover:bg-green-700"
                      onClick={() => handleClockAction('clock_in')}
                      disabled={actionLoading !== null}
                    >
                      <span className="text-2xl mr-3">🕐</span>
                      <span>Clock In to Start Shift</span>
                      {actionLoading === 'clock_in' && <span className="ml-2 text-sm">Processing...</span>}
                    </Button>
                  </div>
                )}

                {currentStatus === 'in' && (
                  <div className="space-y-3">
                    <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="font-medium text-blue-800 mb-2">Currently working</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-20 border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                          onClick={() => handleClockAction('break_start')}
                          disabled={actionLoading !== null}
                        >
                          <span className="text-2xl mb-1 block">☕</span>
                          <span>Start Break</span>
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-20 border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => handleClockAction('clock_out')}
                          disabled={actionLoading !== null}
                        >
                          <span className="text-2xl mb-1 block">🚪</span>
                          <span>Clock Out</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {currentStatus === 'break' && (
                  <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="font-medium text-yellow-800 mb-3">Currently on break</p>
                    <Button
                      size="lg"
                      className="w-full h-16 text-lg bg-blue-600 hover:bg-blue-700"
                      onClick={() => handleClockAction('break_end')}
                      disabled={actionLoading !== null}
                    >
                      <span className="text-2xl mr-3">↩️</span>
                      <span>End Break & Resume Work</span>
                      {actionLoading === 'break_end' && <span className="ml-2 text-sm">Processing...</span>}
                    </Button>
                    <div className="mt-3">
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full h-12 border-red-300 text-red-700 hover:bg-red-50"
                        onClick={() => handleClockAction('clock_out')}
                        disabled={actionLoading !== null}
                      >
                        <span className="mr-2">🚪</span>
                        <span>Clock Out (End Shift)</span>
                      </Button>
                    </div>
                  </div>
                )}

                {!selectedEmployee && (
                  <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-500">Please select an employee to see available actions</p>
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-gray-500">
                <p className="font-medium mb-1">Status Guide:</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-gray-100 rounded">
                    <div className="w-3 h-3 bg-gray-400 rounded-full mx-auto mb-1"></div>
                    <div>Clocked Out</div>
                  </div>
                  <div className="p-2 bg-gray-100 rounded">
                    <div className="w-3 h-3 bg-green-500 rounded-full mx-auto mb-1 animate-pulse"></div>
                    <div>Clocked In</div>
                  </div>
                  <div className="p-2 bg-gray-100 rounded">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full mx-auto mb-1 animate-pulse"></div>
                    <div>On Break</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Recent Activity & Stats */}
        <div className="space-y-6">
          {/* Current Employees Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Employees Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Active Employees</span>
                  <span className="font-medium">{employees.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Currently Working</span>
                  <span className="font-medium text-green-600">
                    {employees.filter(emp => getCurrentStatus(emp.id) === 'in').length}
                    <span className="ml-1 text-xs font-normal">
                      ({employees.length > 0 ? Math.round((employees.filter(emp => getCurrentStatus(emp.id) === 'in').length / employees.length) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">On Break</span>
                  <span className="font-medium text-yellow-600">
                    {employees.filter(emp => getCurrentStatus(emp.id) === 'break').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Available</span>
                  <span className="font-medium text-gray-600">
                    {employees.filter(emp => getCurrentStatus(emp.id) === 'out').length}
                  </span>
                </div>

                {/* Visual status bar */}
                <div className="pt-4 border-t">
                  <div className="text-sm text-gray-600 mb-2">Employee Distribution</div>
                  <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="bg-green-500 h-full"
                      style={{
                        width: `${employees.length > 0 ? (employees.filter(emp => getCurrentStatus(emp.id) === 'in').length / employees.length) * 100 : 0}%`
                      }}
                      title="Clocked In"
                    ></div>
                    <div
                      className="bg-yellow-500 h-full"
                      style={{
                        width: `${employees.length > 0 ? (employees.filter(emp => getCurrentStatus(emp.id) === 'break').length / employees.length) * 100 : 0}%`
                      }}
                      title="On Break"
                    ></div>
                    <div
                      className="bg-gray-400 h-full"
                      style={{
                        width: `${employees.length > 0 ? (employees.filter(emp => getCurrentStatus(emp.id) === 'out').length / employees.length) * 100 : 0}%`
                      }}
                      title="Clocked Out"
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Working</span>
                    <span>Break</span>
                    <span>Out</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Clock Events */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Last 10 clock events with times</CardDescription>
            </CardHeader>
            <CardContent>
              {clockEvents.length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  <p>No recent clock events</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {clockEvents.map((event) => {
                    // Find employee for this event
                    const employee = employees.find(emp =>
                      emp.employee_id === event.employee_id
                    );

                    const eventTime = getEventTimeForDisplay(event);
                    const timeAgo = eventTime ? Math.floor((new Date().getTime() - eventTime.getTime()) / (1000 * 60)) : 0;
                    const isToday = eventTime ? new Date().toDateString() === eventTime.toDateString() : false;

                    // Extract location from notes
                    const notes = event.notes || '';
                    const locationMatch = notes.match(/\[Location:\s*(.*?)\]/);
                    const location = locationMatch ? locationMatch[1] : (notes.startsWith('Location: ') ? notes.substring(10) : null);

                    return (
                      <div key={event.id} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="font-medium text-sm">{employee?.full_name || event.user_full_name || 'Unknown Employee'}</p>
                            <p className="text-xs text-gray-500">
                              {timeAgo === 0 ? 'Just now' :
                               timeAgo < 60 ? `${timeAgo} min ago` :
                               timeAgo < 120 ? '1 hour ago' :
                               `${Math.floor(timeAgo / 60)} hours ago`}
                            </p>
                          </div>
                          <Badge variant={
                            event.event_type === 'clock_in' ? 'default' :
                            event.event_type === 'clock_out' ? 'secondary' :
                            event.event_type === 'break_start' ? 'outline' : 'outline'
                          }>
                            {formatEventType(event.event_type)}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-600 mt-2">
                          <div className="flex justify-between">
                            <span>
                              {isToday ? 'Today' : eventTime ? formatDisplayDate(eventTime) : 'Unknown date'}
                            </span>
                            <span className="font-medium">
                              {eventTime ? formatTime(eventTime) : 'Unknown time'}
                            </span>
                          </div>
                          {location && (
                            <div className="mt-1 text-gray-500 flex items-center">
                              <span className="mr-1">📍</span>
                              <span className="truncate">{location}</span>
                            </div>
                          )}
                          {notes && !location && (
                            <div className="mt-1 text-gray-500 truncate" title={notes}>
                              📝 {notes.length > 40 ? notes.substring(0, 40) + '...' : notes}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push('/dashboard/management/workforce/timesheets/clock-events')}
                >
                  📋 View Detailed History
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push('/dashboard/management/workforce/timesheets')}
                >
                  📊 View All Timesheets
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push('/dashboard/management/workforce/shifts')}
                >
                  📅 View Today's Shifts
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => router.push('/dashboard/management/staff')}
                >
                  👥 View Staff Directory
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
