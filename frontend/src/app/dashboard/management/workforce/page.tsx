'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { 
  StaffProfile, 
  Shift, 
  Timesheet, 
  PerformanceMetric
} from '@/types/workforce';
import { formatDisplayDate } from '@/lib/date-format'; // ✅ Use centralized date utility
import { formatCurrency } from '@/lib/currency'; // ✅ Use centralized currency utility

export default function WorkforceDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore(); // ✅ Get business for currency
  const {
    fetchStaffProfiles,
    fetchShifts,
    fetchTimesheets,
    fetchPerformanceMetrics,
    loading
  } = useWorkforce();

  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadDashboardData();
  }, [authLoading, isAuthenticated, router]);

  const loadDashboardData = async () => {
    const newErrors: string[] = [];
    
    try {
      // Fetch data for widgets
      try {
        const profiles = await fetchStaffProfiles({ limit: 5 });
        setStaffProfiles(profiles || []);
      } catch (err: any) {
        newErrors.push(`Staff Profiles: ${err.message}`);
      }

      try {
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const upcomingShifts = await fetchShifts({
          start_date: today.toISOString().split('T')[0],
          end_date: nextWeek.toISOString().split('T')[0],
          shift_status: 'scheduled'
        });
        setShifts(upcomingShifts?.slice(0, 5) || []);
      } catch (err: any) {
        newErrors.push(`Shifts: ${err.message}`);
      }

      try {
        const pendingTimesheets = await fetchTimesheets({ 
          status: 'submitted',
          limit: 5 
        });
        setTimesheets(pendingTimesheets || []);
      } catch (err: any) {
        newErrors.push(`Timesheets: ${err.message}`);
      }

      try {
        const recentPerformance = await fetchPerformanceMetrics({ limit: 5 });
        setPerformanceMetrics(recentPerformance || []);
      } catch (err: any) {
        newErrors.push(`Performance: ${err.message}`);
      }

    } catch (err: any) {
      newErrors.push(`Dashboard: ${err.message}`);
    } finally {
      setErrors(newErrors);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading Workforce Dashboard...</div>
      </div>
    );
  }

  const stats = [
    {
      title: 'Total Staff',
      value: staffProfiles.length,
      change: 'Active profiles',
      icon: '👥',
      color: 'blue',
      href: '/dashboard/management/workforce/staff/profiles'
    },
    {
      title: 'Active Shifts',
      value: shifts.length,
      change: 'Next 7 days',
      icon: '📅',
      color: 'green',
      href: '/dashboard/management/workforce/shifts'
    },
    {
      title: 'Pending Timesheets',
      value: timesheets.length,
      change: 'Need approval',
      icon: '⏰',
      color: 'orange',
      href: '/dashboard/management/workforce/timesheets/approval'
    },
    {
      title: 'Performance Metrics',
      value: performanceMetrics.length,
      change: 'Recent entries',
      icon: '📈',
      color: 'purple',
      href: '/dashboard/management/workforce/performance'
    }
  ];

  // Safe helper functions using centralized utilities
  const safeFormatDate = (dateObj: any) => {
    if (!dateObj || typeof dateObj !== 'object') return 'N/A';
    return formatDisplayDate(dateObj.local || dateObj.utc || '');
  };

  const safeCapitalize = (text: string | undefined) => {
    if (!text) return 'N/A';
    return text.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workforce Management</h1>
          <p className="text-gray-600">
            Monitor staff, shifts, timesheets, and performance in one place
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/staff')}
          >
            ← Back to Staff
          </Button>
          <Button
            onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
          >
            Schedule Shifts
          </Button>
          <Button
            variant="outline"
            onClick={loadDashboardData}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Error messages */}
      {errors.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-yellow-600">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Some data could not be loaded</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc pl-5 space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Link key={index} href={stat.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-bold mt-2">{stat.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
                  </div>
                  <div className={`text-2xl p-3 rounded-full bg-${stat.color}-100 text-${stat.color}-600`}>
                    {stat.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Shifts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Upcoming Shifts</CardTitle>
                <CardDescription>Next 7 days scheduled shifts</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/management/workforce/shifts')}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {shifts.length > 0 ? (
              <div className="space-y-3">
                {shifts.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{shift.user_full_name || 'Unknown Staff'}</p>
                      <p className="text-sm text-gray-600">
                        {safeFormatDate(shift.shift_date)} • {shift.department_name || 'No Department'}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      shift.shift_status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                      shift.shift_status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      shift.shift_status === 'completed' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {shift.shift_status || 'unknown'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No upcoming shifts scheduled</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
                >
                  Schedule a Shift
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Staff Performance */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Performance</CardTitle>
                <CardDescription>Latest performance metrics</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/management/workforce/performance')}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {performanceMetrics.length > 0 ? (
              <div className="space-y-3">
                {performanceMetrics.map((metric) => (
                  <div key={metric.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{metric.user_full_name || 'Unknown Staff'}</p>
                      <p className="text-sm text-gray-600 capitalize">
                        {safeCapitalize(metric.metric_type)}: {metric.metric_value || 'N/A'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {metric.metric_value >= metric.target_value ? (
                          <span className="text-green-600">✓ Met Target</span>
                        ) : (
                          <span className="text-red-600">Below Target</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        Target: {metric.target_value || 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No performance metrics recorded</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => router.push('/dashboard/management/workforce/performance')}
                >
                  Add Metrics
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Timesheets */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Pending Timesheets</CardTitle>
                <CardDescription>Require approval</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/dashboard/management/workforce/timesheets/approval')}
              >
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {timesheets.length > 0 ? (
              <div className="space-y-3">
                {timesheets.map((timesheet) => (
                  <div key={timesheet.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{timesheet.full_name || 'Unknown Staff'}</p>
                      <p className="text-sm text-gray-600">
                        Period: {timesheet.period_name || 'N/A'} • Total: {formatCurrency(timesheet.total_pay, business)} {/* ✅ Use formatCurrency */}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/dashboard/management/workforce/timesheets/approval`)}
                    >
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No pending timesheets</p>
                <p className="text-sm mt-1">All timesheets are approved</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common workforce tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center justify-center"
                onClick={() => router.push('/dashboard/management/workforce/timesheets/clock')}
              >
                <span className="text-2xl mb-2">🕐</span>
                <span>Clock In/Out</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center justify-center"
                onClick={() => router.push('/dashboard/management/workforce/shifts/schedule')}
              >
                <span className="text-2xl mb-2">📅</span>
                <span>Schedule Shift</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center justify-center"
                onClick={() => router.push('/dashboard/management/workforce/staff/profiles')}
              >
                <span className="text-2xl mb-2">👥</span>
                <span>Add Staff</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto py-3 flex flex-col items-center justify-center"
                onClick={() => router.push('/dashboard/management/workforce/payroll')}
              >
                <span className="text-2xl mb-2">💰</span>
                <span>Run Payroll</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
