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
import { StaffAvailability, AvailabilityFormData } from '@/types/workforce';

export default function AvailabilityPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchAvailability, createAvailability, fetchStaffProfiles, loading: workforceLoading } = useWorkforce();

  const [availabilityRecords, setAvailabilityRecords] = useState<StaffAvailability[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // New availability form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAvailability, setNewAvailability] = useState<AvailabilityFormData>({
    staff_profile_id: '',
    availability_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '17:00',
    is_available: true,
    reason: ''
  });
  const [creating, setCreating] = useState(false);

  // Filter state
  const [selectedStaff, setSelectedStaff] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadData();
  }, [authLoading, isAuthenticated, router, selectedStaff, selectedDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [availability, profiles] = await Promise.all([
        fetchAvailability(selectedStaff || undefined, selectedDate || undefined, selectedDate || undefined),
        fetchStaffProfiles()
      ]);

      setAvailabilityRecords(availability || []);
      setStaffProfiles(profiles || []);
    } catch (err: any) {
      console.error('Error loading availability data:', err);
      setError(err.message || 'Failed to load availability data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await createAvailability(newAvailability);
      
      // Reset form
      setNewAvailability({
        staff_profile_id: '',
        availability_date: new Date().toISOString().split('T')[0],
        start_time: '09:00',
        end_time: '17:00',
        is_available: true,
        reason: ''
      });
      setShowNewForm(false);
      loadData();
    } catch (err: any) {
      console.error('Error creating availability:', err);
      setError(err.message || 'Failed to create availability record');
    } finally {
      setCreating(false);
    }
  };

  // Safe date access helper
  const getDateFromRecord = (record: StaffAvailability) => {
    // Handle both DateTimeObject and string/Date formats
    if (record.availability_date && typeof record.availability_date === 'object') {
      return new Date(record.availability_date.local || record.availability_date.utc || '');
    }
    return new Date(record.availability_date as string || '');
  };

  const getDayAvailability = (dayIndex: number) => {
    return availabilityRecords.filter(record => {
      try {
        const date = getDateFromRecord(record);
        return date.getDay() === dayIndex;
      } catch (err) {
        console.error('Error parsing date:', record.availability_date, err);
        return false;
      }
    });
  };

  const getStaffName = (staffProfileId: string) => {
    const staff = staffProfiles.find(p => p.id === staffProfileId);
    return staff?.user_full_name || `Staff ${staffProfileId.slice(0, 6)}`;
  };

  const formatTime = (time: string) => {
    if (!time) return 'N/A';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const calculateCoverage = () => {
    const today = new Date();
    const dayIndex = today.getDay();
    const todayAvailability = getDayAvailability(dayIndex);
    
    const available = todayAvailability.filter(a => a.is_available);
    const unavailable = todayAvailability.filter(a => !a.is_available);
    
    return {
      available: available.length,
      unavailable: unavailable.length,
      total: todayAvailability.length
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
            <h1 className="text-3xl font-bold text-gray-900">Staff Availability</h1>
            <p className="text-gray-600 mt-1">
              Manage staff availability and time-off requests
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
              onClick={() => setShowNewForm(true)}
              disabled={showNewForm}
            >
              Add Availability
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Total Staff</div>
            <div className="text-2xl font-bold mt-1">{staffProfiles.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Available Today</div>
            <div className="text-2xl font-bold mt-1 text-green-600">
              {coverage.available}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Unavailable Today</div>
            <div className="text-2xl font-bold mt-1 text-amber-600">
              {coverage.unavailable}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-sm text-gray-600">Coverage Today</div>
            <div className="text-2xl font-bold mt-1">
              {coverage.total > 0 ? `${Math.round((coverage.available / coverage.total) * 100)}%` : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="staff_filter">Staff Member</Label>
              <select
                id="staff_filter"
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Staff</option>
                {staffProfiles.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.user_full_name} ({staff.employee_id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="date_filter">Date</Label>
              <Input
                id="date_filter"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedStaff('');
                  setSelectedDate('');
                }}
                className="w-full"
              >
                Clear Filters
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

      {/* New Availability Form */}
      {showNewForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Add Availability Record</CardTitle>
            <CardDescription>Record staff availability or time-off</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAvailability}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="staff_select">Staff Member *</Label>
                    <select
                      id="staff_select"
                      value={newAvailability.staff_profile_id}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, staff_profile_id: e.target.value }))}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select staff member...</option>
                      {staffProfiles.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.user_full_name} ({staff.employee_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="availability_date">Date *</Label>
                    <Input
                      id="availability_date"
                      type="date"
                      value={newAvailability.availability_date}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, availability_date: e.target.value }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="availability_status">Availability Status</Label>
                    <div className="mt-2 space-x-4">
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name="availability_status"
                          checked={newAvailability.is_available}
                          onChange={() => setNewAvailability(prev => ({ ...prev, is_available: true }))}
                          className="text-blue-600"
                        />
                        <span className="ml-2">Available</span>
                      </label>
                      <label className="inline-flex items-center">
                        <input
                          type="radio"
                          name="availability_status"
                          checked={!newAvailability.is_available}
                          onChange={() => setNewAvailability(prev => ({ ...prev, is_available: false }))}
                          className="text-blue-600"
                        />
                        <span className="ml-2">Unavailable</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Time Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="start_time">Start Time *</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={newAvailability.start_time}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, start_time: e.target.value }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="end_time">End Time *</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={newAvailability.end_time}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, end_time: e.target.value }))}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="reason">Reason (Optional)</Label>
                    <Textarea
                      id="reason"
                      value={newAvailability.reason || ''}
                      onChange={(e) => setNewAvailability(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Reason for availability or time-off"
                      rows={3}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Availability Preview */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700">Availability Preview</p>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Date</p>
                    <p className="font-medium">
                      {new Date(newAvailability.availability_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Time</p>
                    <p className="font-medium">
                      {formatTime(newAvailability.start_time)} - {formatTime(newAvailability.end_time)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Status</p>
                    <Badge className={newAvailability.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {newAvailability.is_available ? 'Available' : 'Unavailable'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Duration</p>
                    <p className="font-medium">
                      {(() => {
                        const start = new Date(`2000-01-01T${newAvailability.start_time}`);
                        const end = new Date(`2000-01-01T${newAvailability.end_time}`);
                        const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                        return `${duration} hours`;
                      })()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !newAvailability.staff_profile_id}
                >
                  {creating ? 'Creating...' : 'Add Availability'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Weekly Availability Calendar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Weekly Availability Overview</CardTitle>
          <CardDescription>Staff availability for the current week</CardDescription>
        </CardHeader>
        <CardContent>
          {availabilityRecords.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">📅</div>
              <h3 className="text-xl font-medium text-gray-900">No Availability Records</h3>
              <p className="text-gray-600 mt-2">
                Start by adding staff availability records
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowNewForm(true)}
              >
                Add First Record
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Day</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Available Staff</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Unavailable Staff</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {daysOfWeek.map((day, dayIndex) => {
                    const dayAvailability = getDayAvailability(dayIndex);
                    const available = dayAvailability.filter(a => a.is_available);
                    const unavailable = dayAvailability.filter(a => !a.is_available);
                    
                    return (
                      <tr key={day} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="font-medium">{day}</div>
                        </td>
                        <td className="py-3 px-4">
                          {available.length === 0 ? (
                            <span className="text-gray-500">None</span>
                          ) : (
                            <div className="space-y-1">
                              {available.slice(0, 3).map((record) => (
                                <div key={record.id} className="flex items-center">
                                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                  <span className="text-sm">{getStaffName(record.staff_profile_id)}</span>
                                  <span className="text-xs text-gray-500 ml-2">
                                    {formatTime(record.start_time)}-{formatTime(record.end_time)}
                                  </span>
                                </div>
                              ))}
                              {available.length > 3 && (
                                <div className="text-xs text-gray-500">
                                  +{available.length - 3} more
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {unavailable.length === 0 ? (
                            <span className="text-gray-500">None</span>
                          ) : (
                            <div className="space-y-1">
                              {unavailable.slice(0, 3).map((record) => (
                                <div key={record.id} className="flex items-center">
                                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                                  <span className="text-sm">{getStaffName(record.staff_profile_id)}</span>
                                  <span className="text-xs text-gray-500 ml-2">
                                    {record.reason ? `(${record.reason})` : ''}
                                  </span>
                                </div>
                              ))}
                              {unavailable.length > 3 && (
                                <div className="text-xs text-gray-500">
                                  +{unavailable.length - 3} more
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-green-500 rounded-full"
                                style={{ 
                                  width: `${dayAvailability.length > 0 
                                    ? (available.length / dayAvailability.length) * 100 
                                    : 0}%` 
                                }}
                              />
                            </div>
                            <span className="ml-2 text-sm font-medium">
                              {dayAvailability.length > 0 
                                ? `${Math.round((available.length / dayAvailability.length) * 100)}%` 
                                : 'N/A'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Availability Records */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Availability Records</CardTitle>
              <CardDescription>
                {availabilityRecords.length} record(s) found
              </CardDescription>
            </div>
            {loading && (
              <div className="text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {availabilityRecords.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-medium text-gray-900">No Records Found</h3>
              <p className="text-gray-600 mt-2">
                {selectedStaff || selectedDate 
                  ? 'No records match your filters'
                  : 'Add availability records to get started'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Staff</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Time</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {availabilityRecords.slice(0, 20).map((record) => (
                    <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium">{getStaffName(record.staff_profile_id)}</p>
                          <p className="text-xs text-gray-600">{record.employee_id}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">
                          {/* Safe date formatting */}
                          {(() => {
                            try {
                              const date = getDateFromRecord(record);
                              return date.toLocaleDateString('en-US', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              });
                            } catch (err) {
                              return 'Invalid date';
                            }
                          })()}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm">
                          {formatTime(record.start_time)} - {formatTime(record.end_time)}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={record.is_available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {record.is_available ? 'Available' : 'Unavailable'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-600">
                          {record.reason || 'No reason provided'}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Cards */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Time-off Requests</h3>
            <p className="text-sm text-gray-600 mb-4">
              Manage staff time-off requests and approvals
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => alert('Time-off requests coming soon')}
            >
              Manage Requests
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium mb-2">Schedule Conflicts</h3>
            <p className="text-sm text-gray-600 mb-4">
              View and resolve scheduling conflicts
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => alert('Conflict detection coming soon')}
            >
              Check Conflicts
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
