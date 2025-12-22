'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Shift } from '@/types/workforce';
import { formatDisplayDate } from '@/lib/date-format'; // ✅ Use centralized date utility

export default function ShiftsPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuthStore();
  const { fetchShifts, loading, error } = useWorkforce();
  
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadShifts();
  }, [authLoading, isAuthenticated, router]);

  const loadShifts = async () => {
    try {
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setDate(nextMonth.getDate() + 30);
      
      const shiftsData = await fetchShifts({
        start_date: today.toISOString().split('T')[0],
        end_date: nextMonth.toISOString().split('T')[0]
      });
      setShifts(shiftsData || []);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading Shifts...</div>
      </div>
    );
  }

  // Group shifts by status
  const scheduledShifts = shifts.filter(s => s.shift_status === 'scheduled');
  const inProgressShifts = shifts.filter(s => s.shift_status === 'in_progress');
  const completedShifts = shifts.filter(s => s.shift_status === 'completed');

  // Safe date formatting
  const safeFormatDate = (dateObj: any) => {
    if (!dateObj || typeof dateObj !== 'object') return 'N/A';
    return formatDisplayDate(dateObj.local || dateObj.utc || '');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift Management</h1>
          <p className="text-gray-600">
            Schedule, track, and manage staff shifts
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/workforce')}
          >
            ← Dashboard
          </Button>
          <Button
            onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
          >
            + Schedule Shift
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-600">❌</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Shifts</p>
                <p className="text-2xl font-bold mt-2">{shifts.length}</p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-blue-100 text-blue-600">
                📅
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Scheduled</p>
                <p className="text-2xl font-bold mt-2">{scheduledShifts.length}</p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-yellow-100 text-yellow-600">
                ⏰
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Progress</p>
                <p className="text-2xl font-bold mt-2">{inProgressShifts.length}</p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-orange-100 text-orange-600">
                🔄
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold mt-2">{completedShifts.length}</p>
              </div>
              <div className="text-2xl p-3 rounded-full bg-green-100 text-green-600">
                ✅
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Shifts List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduled Shifts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Scheduled</CardTitle>
                <CardDescription>Upcoming shifts</CardDescription>
              </div>
              <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                {scheduledShifts.length}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {scheduledShifts.length > 0 ? (
              <div className="space-y-3">
                {scheduledShifts.slice(0, 5).map((shift) => (
                  <div key={shift.id} className="border rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{shift.user_full_name || 'Unknown'}</p>
                        <p className="text-sm text-gray-600">
                          {safeFormatDate(shift.shift_date)} {/* ✅ Use safeFormatDate */}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/management/workforce/shifts`)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
                {scheduledShifts.length > 5 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {/* Filter to show only scheduled */}}
                  >
                    View all {scheduledShifts.length} scheduled shifts
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>No scheduled shifts</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* In Progress Shifts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>In Progress</CardTitle>
                <CardDescription>Active shifts</CardDescription>
              </div>
              <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                {inProgressShifts.length}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {inProgressShifts.length > 0 ? (
              <div className="space-y-3">
                {inProgressShifts.map((shift) => (
                  <div key={shift.id} className="border rounded-lg p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{shift.user_full_name || 'Unknown'}</p>
                        <p className="text-sm text-gray-600">
                          Started: {shift.actual_start_time || 'N/A'}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/management/workforce/shifts`)}
                      >
                        Track
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>No shifts in progress</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Shift Actions</CardTitle>
            <CardDescription>Manage shifts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button
                className="w-full justify-start"
                onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
              >
                <span className="mr-2">📅</span>
                Schedule New Shift
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push('/dashboard/management/workforce/shifts/templates')}
              >
                <span className="mr-2">📋</span>
                Manage Templates
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => router.push('/dashboard/management/workforce/shifts/roster')}
              >
                <span className="mr-2">👨‍💼</span>
                View Roster
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={loadShifts}
              >
                <span className="mr-2">🔄</span>
                Refresh Shifts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Shifts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Shifts</CardTitle>
              <CardDescription>Last 30 days of shift activity</CardDescription>
            </div>
            <Button
              onClick={loadShifts}
              variant="outline"
              size="sm"
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {shifts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {shifts.slice(0, 10).map((shift) => (
                    <tr key={shift.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{shift.user_full_name || 'Unknown'}</p>
                          <p className="text-sm text-gray-600">{shift.job_title || 'N/A'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {safeFormatDate(shift.shift_date)} {/* ✅ Use safeFormatDate */}
                      </td>
                      <td className="px-4 py-3">
                        {shift.department_name || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded ${
                          shift.shift_status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                          shift.shift_status === 'in_progress' ? 'bg-orange-100 text-orange-800' :
                          shift.shift_status === 'completed' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {shift.shift_status || 'unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {shift.actual_hours_worked || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No shifts found</p>
              <p className="text-sm mt-1">Schedule shifts to see them here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
