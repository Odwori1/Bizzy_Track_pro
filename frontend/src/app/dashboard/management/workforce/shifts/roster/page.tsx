'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDisplayDate } from '@/lib/date-format';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Shift, StaffProfile } from '@/types/workforce';

export default function ShiftRosterPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchShifts, fetchStaffProfiles, loading: workforceLoading } = useWorkforce();

  const [todayShifts, setTodayShifts] = useState<Shift[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Current date and time
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
    
    // Update current time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, [authLoading, isAuthenticated, router]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [shifts, profiles] = await Promise.all([
        fetchShifts({
          start_date: today,
          end_date: today
        }),
        fetchStaffProfiles()
      ]);

      setTodayShifts(shifts || []);
      setStaffProfiles(profiles || []);
    } catch (err: any) {
      console.error('Error loading roster data:', err);
      setError(err.message || 'Failed to load roster data');
    } finally {
      setLoading(false);
    }
  };

  // Categorize shifts by status
  const getShiftsByStatus = () => {
    return {
      scheduled: todayShifts.filter(s => s.shift_status === 'scheduled'),
      inProgress: todayShifts.filter(s => s.shift_status === 'in_progress'),
      completed: todayShifts.filter(s => s.shift_status === 'completed'),
      cancelled: todayShifts.filter(s => s.shift_status === 'cancelled')
    };
  };

  const shiftsByStatus = getShiftsByStatus();

  // Get staff who haven't been scheduled today
  const getUnscheduledStaff = () => {
    const scheduledStaffIds = new Set(todayShifts.map(s => s.staff_profile_id));
    return staffProfiles.filter(staff => 
      staff.is_active && !scheduledStaffIds.has(staff.id)
    );
  };

  const unscheduledStaff = getUnscheduledStaff();

  // Format time for display
  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  // Get current shift status badge
  const getShiftStatusBadge = (shift: Shift) => {
    const now = currentTime;
    const shiftDate = new Date(shift.shift_date.local || shift.shift_date.utc);
    const isToday = shiftDate.toDateString() === now.toDateString();

    if (shift.shift_status === 'completed') {
      return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
    } else if (shift.shift_status === 'in_progress') {
      return <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>;
    } else if (shift.shift_status === 'cancelled') {
      return <Badge className="bg-gray-100 text-gray-800">Cancelled</Badge>;
    } else if (isToday) {
      // Check if scheduled shift should have started
      if (shift.actual_start_time) {
        return <Badge className="bg-blue-100 text-blue-800">Started Late</Badge>;
      }
      const startTime = new Date(`${shiftDate.toDateString()} ${shift.actual_start_time || '00:00'}`);
      if (now > startTime) {
        return <Badge className="bg-orange-100 text-orange-800">Started</Badge>;
      }
      return <Badge className="bg-blue-100 text-blue-800">Upcoming</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">Scheduled</Badge>;
  };

  // Calculate current coverage
  const calculateCoverage = () => {
    const activeShifts = todayShifts.filter(s => 
      s.shift_status === 'in_progress' || s.shift_status === 'scheduled'
    );
    
    return {
      totalActive: activeShifts.length,
      inProgress: shiftsByStatus.inProgress.length,
      upcoming: shiftsByStatus.scheduled.length,
      coveragePercent: staffProfiles.length > 0 
        ? Math.round((activeShifts.length / staffProfiles.length) * 100) 
        : 0
    };
  };

  const coverage = calculateCoverage();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Current Roster</h1>
            <p className="text-gray-600 mt-1">
              Real-time view of today's shifts and staff assignments
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Last updated: {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={loadData}
            >
              Refresh
            </Button>
            <Button
              onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
            >
              Schedule Shifts
            </Button>
          </div>
        </div>
      </div>

      {/* Coverage Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Staff Today</div>
            <div className="text-2xl font-bold mt-1">{todayShifts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Currently Working</div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">
              {coverage.inProgress}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Upcoming Shifts</div>
            <div className="text-2xl font-bold mt-1 text-blue-600">
              {coverage.upcoming}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Coverage Rate</div>
            <div className="text-2xl font-bold mt-1">
              {coverage.coveragePercent}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-red-800">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={loadData}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Roster Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Currently Working */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
              Currently Working
              <Badge className="ml-2">{shiftsByStatus.inProgress.length}</Badge>
            </CardTitle>
            <CardDescription>Staff currently clocked in and working</CardDescription>
          </CardHeader>
          <CardContent>
            {shiftsByStatus.inProgress.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No staff currently working</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shiftsByStatus.inProgress.map((shift) => (
                  <div key={shift.id} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{shift.user_full_name}</p>
                        <p className="text-sm text-gray-600">
                          {shift.department_name || 'No department'} • {shift.job_title}
                        </p>
                      </div>
                      <div className="text-right">
                        {getShiftStatusBadge(shift)}
                        <p className="text-xs text-gray-600 mt-1">
                          Started: {formatTime(shift.actual_start_time || '')}
                        </p>
                      </div>
                    </div>
                    {shift.notes && (
                      <p className="text-xs text-gray-500 mt-2">{shift.notes}</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => router.push(`/dashboard/management/workforce/shifts`)}
                    >
                      View Shift Details
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Shifts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              Upcoming Shifts
              <Badge className="ml-2">{shiftsByStatus.scheduled.length}</Badge>
            </CardTitle>
            <CardDescription>Shifts scheduled for later today</CardDescription>
          </CardHeader>
          <CardContent>
            {shiftsByStatus.scheduled.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No upcoming shifts scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {shiftsByStatus.scheduled.map((shift) => (
                  <div key={shift.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{shift.user_full_name}</p>
                        <p className="text-sm text-gray-600">
                          {shift.department_name || 'No department'} • {shift.job_title}
                        </p>
                      </div>
                      <div className="text-right">
                        {getShiftStatusBadge(shift)}
                        <p className="text-xs text-gray-600 mt-1">
                          Schedule: {formatTime(shift.actual_start_time || '')}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full"
                      onClick={() => router.push(`/dashboard/management/workforce/shifts`)}
                    >
                      View Details
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Staff */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              Available Staff
              <Badge className="ml-2">{unscheduledStaff.length}</Badge>
            </CardTitle>
            <CardDescription>Staff not scheduled for today</CardDescription>
          </CardHeader>
          <CardContent>
            {unscheduledStaff.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>All staff are scheduled for today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unscheduledStaff.slice(0, 5).map((staff) => (
                  <div key={staff.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{staff.user_full_name}</p>
                        <p className="text-sm text-gray-600">
                          {staff.department_name || 'No department'} • {staff.job_title}
                        </p>
                      </div>
                      <Badge className="bg-gray-100 text-gray-800">Available</Badge>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/dashboard/management/workforce/shifts/schedule?staff=${staff.id}`)}
                      >
                        Schedule Now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/management/workforce/staff/profiles/${staff.id}`)}
                      >
                        Profile
                      </Button>
                    </div>
                  </div>
                ))}
                {unscheduledStaff.length > 5 && (
                  <div className="text-center pt-2">
                    <Button
                      variant="link"
                      onClick={() => alert(`Showing 5 of ${unscheduledStaff.length} available staff`)}
                    >
                      +{unscheduledStaff.length - 5} more available
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Completed & Cancelled Shifts */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Completed Shifts */}
        <Card>
          <CardHeader>
            <CardTitle>Completed Shifts</CardTitle>
            <CardDescription>Shifts that have ended today</CardDescription>
          </CardHeader>
          <CardContent>
            {shiftsByStatus.completed.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No shifts completed yet today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shiftsByStatus.completed.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                    <div>
                      <p className="font-medium text-sm">{shift.user_full_name}</p>
                      <p className="text-xs text-gray-600">
                        {shift.department_name || 'No department'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600">
                        {formatTime(shift.actual_start_time || '')} - {formatTime(shift.actual_end_time || '')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cancelled Shifts */}
        <Card>
          <CardHeader>
            <CardTitle>Cancelled Shifts</CardTitle>
            <CardDescription>Shifts cancelled for today</CardDescription>
          </CardHeader>
          <CardContent>
            {shiftsByStatus.cancelled.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No shifts cancelled today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {shiftsByStatus.cancelled.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                    <div>
                      <p className="font-medium text-sm">{shift.user_full_name}</p>
                      <p className="text-xs text-gray-600">
                        {shift.department_name || 'No department'}
                      </p>
                    </div>
                    <Badge variant="outline">Cancelled</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push('/dashboard/management/workforce/shifts')}
        >
          View All Shifts
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
        >
          Schedule More Shifts
        </Button>
        <Button
          className="flex-1"
          onClick={() => router.push('/dashboard/management/workforce/timesheets/clock')}
        >
          Go to Time Clock
        </Button>
      </div>
    </div>
  );
}
