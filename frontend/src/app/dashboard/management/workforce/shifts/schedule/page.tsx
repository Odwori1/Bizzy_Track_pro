'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { formatDisplayDate } from '@/lib/date-format';
import { useAuthStore } from '@/store/authStore';
import { useWorkforce } from '@/hooks/useWorkforce';
import { Shift, ShiftFormData, ShiftTemplate } from '@/types/workforce';

export default function ShiftSchedulePage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchShiftTemplates, createShift, fetchStaffProfiles, fetchShifts, loading: workforceLoading } = useWorkforce();

  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [upcomingShifts, setUpcomingShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Schedule form state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newShift, setNewShift] = useState<ShiftFormData>({
    shift_date: new Date().toISOString().split('T')[0],
    staff_profile_id: '',
    shift_template_id: '',
    notes: ''
  });
  const [scheduling, setScheduling] = useState(false);

  // Date range for fetching shifts
  const [dateRange, setDateRange] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
  }, [authLoading, isAuthenticated, router, dateRange]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [templates, profiles, shifts] = await Promise.all([
        fetchShiftTemplates(),
        fetchStaffProfiles(),
        fetchShifts(dateRange)
      ]);

      setShiftTemplates(templates || []);
      setStaffProfiles(profiles || []);
      setUpcomingShifts(shifts || []);
    } catch (err: any) {
      console.error('Error loading schedule data:', err);
      setError(err.message || 'Failed to load schedule data');
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduling(true);
    setError(null);

    try {
      await createShift(newShift);
      
      // Reset form
      setNewShift({
        shift_date: new Date().toISOString().split('T')[0],
        staff_profile_id: '',
        shift_template_id: '',
        notes: ''
      });
      setShowScheduleForm(false);
      loadData();
    } catch (err: any) {
      console.error('Error scheduling shift:', err);
      setError(err.message || 'Failed to schedule shift');
    } finally {
      setScheduling(false);
    }
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = shiftTemplates.find(t => t.id === templateId);
    if (template) {
      setNewShift(prev => ({
        ...prev,
        shift_template_id: templateId,
        notes: template.description || ''
      }));
    }
  };

  const formatTime = (time: string) => {
    if (!time) return 'N/A';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getStaffName = (staffProfileId: string) => {
    const staff = staffProfiles.find(p => p.id === staffProfileId);
    return staff?.user_full_name || `Staff ${staffProfileId.slice(0, 6)}`;
  };

  // Group shifts by date for calendar view
  const groupShiftsByDate = () => {
    const groups: Record<string, Shift[]> = {};
    
    upcomingShifts.forEach(shift => {
      const date = shift.shift_date.local || shift.shift_date.utc;
      const dateStr = new Date(date).toISOString().split('T')[0];
      
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(shift);
    });
    
    return groups;
  };

  const shiftsByDate = groupShiftsByDate();
  const upcomingDates = Object.keys(shiftsByDate).sort();

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
            <h1 className="text-3xl font-bold text-gray-900">Shift Scheduling</h1>
            <p className="text-gray-600 mt-1">
              Schedule and manage staff shifts for upcoming days
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/shifts')}
            >
              View All Shifts
            </Button>
            <Button
              onClick={() => setShowScheduleForm(true)}
              disabled={showScheduleForm}
            >
              Schedule Shift
            </Button>
          </div>
        </div>
      </div>

      {/* Date Range Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Schedule View</CardTitle>
          <CardDescription>Select date range to view scheduled shifts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={dateRange.start_date}
                onChange={(e) => setDateRange(prev => ({ ...prev, start_date: e.target.value }))}
                className="w-full"
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={dateRange.end_date}
                onChange={(e) => setDateRange(prev => ({ ...prev, end_date: e.target.value }))}
                className="w-full"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const today = new Date().toISOString().split('T')[0];
                  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                  setDateRange({ start_date: today, end_date: nextWeek });
                }}
                className="w-full"
              >
                Reset to Next Week
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Schedule Form */}
      {showScheduleForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Schedule New Shift</CardTitle>
            <CardDescription>Assign a shift to a staff member</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleScheduleShift}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Shift Details */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="shift_date">Shift Date *</Label>
                    <Input
                      id="shift_date"
                      type="date"
                      value={newShift.shift_date}
                      onChange={(e) => setNewShift(prev => ({ ...prev, shift_date: e.target.value }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="staff_profile_id">Staff Member *</Label>
                    <select
                      id="staff_profile_id"
                      value={newShift.staff_profile_id}
                      onChange={(e) => setNewShift(prev => ({ ...prev, staff_profile_id: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select staff member...</option>
                      {staffProfiles.filter(p => p.is_active).map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.user_full_name} ({staff.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="shift_template">Shift Template (Optional)</Label>
                    <select
                      id="shift_template"
                      value={newShift.shift_template_id || ''}
                      onChange={(e) => handleApplyTemplate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No template</option>
                      {shiftTemplates.filter(t => t.is_active).map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} ({formatTime(template.default_start_time)}-{formatTime(template.default_end_time)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Additional Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newShift.notes || ''}
                      onChange={(e) => setNewShift(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Additional notes about this shift"
                      rows={4}
                      className="w-full"
                    />
                  </div>

                  {/* Selected Template Preview */}
                  {newShift.shift_template_id && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-800">Template Applied</p>
                      <p className="text-xs text-blue-600 mt-1">
                        {shiftTemplates.find(t => t.id === newShift.shift_template_id)?.description || 'No description'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowScheduleForm(false)}
                  disabled={scheduling}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={scheduling || !newShift.staff_profile_id}
                >
                  {scheduling ? 'Scheduling...' : 'Schedule Shift'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Calendar View */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Upcoming Shifts</CardTitle>
              <CardDescription>
                {upcomingShifts.length} shift(s) scheduled between {dateRange.start_date} and {dateRange.end_date}
              </CardDescription>
            </div>
            {loading && (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {upcomingShifts.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-xl font-medium text-gray-900">No Shifts Scheduled</h3>
              <p className="text-gray-600 mt-2">
                Schedule shifts for the selected date range
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowScheduleForm(true)}
              >
                Schedule First Shift
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {upcomingDates.map((date) => (
                <div key={date} className="border border-gray-200 rounded-lg">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <h3 className="font-medium text-gray-900">
                      {new Date(date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {shiftsByDate[date].length} shift(s) scheduled
                    </p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {shiftsByDate[date].map((shift) => (
                      <div key={shift.id} className="px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{getStaffName(shift.staff_profile_id)}</p>
                            <p className="text-sm text-gray-600">
                              {shift.department_name || 'No department'} • {shift.job_title}
                            </p>
                            {shift.notes && (
                              <p className="text-xs text-gray-500 mt-1">{shift.notes}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <Badge className={
                              shift.shift_status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                              shift.shift_status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                              shift.shift_status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-gray-100 text-gray-800'
                            }>
                              {shift.shift_status}
                            </Badge>
                            <p className="text-sm text-gray-600 mt-1">
                              {shift.shift_template_name || 'Custom shift'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Schedule Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Quick Schedule</h3>
            <p className="text-sm text-gray-600 mb-4">
              Schedule multiple shifts using templates
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/dashboard/management/workforce/shifts/templates')}
            >
              Use Templates
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Bulk Schedule</h3>
            <p className="text-sm text-gray-600 mb-4">
              Schedule shifts for multiple staff at once
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => alert('Bulk scheduling coming soon')}
            >
              Bulk Schedule
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">View Roster</h3>
            <p className="text-sm text-gray-600 mb-4">
              See who's working today and upcoming shifts
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/dashboard/management/workforce/shifts/roster')}
            >
              View Roster
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
