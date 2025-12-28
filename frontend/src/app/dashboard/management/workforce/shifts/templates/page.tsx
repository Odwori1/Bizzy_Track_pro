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
import { ShiftTemplate, ShiftTemplateFormData } from '@/types/workforce';

export default function ShiftTemplatesPage() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading, business } = useAuthStore();
  const { fetchShiftTemplates, createShiftTemplate, loading: workforceLoading } = useWorkforce();

  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Common shift patterns for quick selection
  const commonShifts = [
    { name: 'Morning', start: '08:00', end: '16:00', duration: '8h' },
    { name: 'Afternoon', start: '12:00', end: '20:00', duration: '8h' },
    { name: 'Evening', start: '16:00', end: '00:00', duration: '8h' },
    { name: 'Night', start: '22:00', end: '06:00', duration: '8h' },
    { name: 'Part-Time AM', start: '09:00', end: '13:00', duration: '4h' },
    { name: 'Part-Time PM', start: '14:00', end: '18:00', duration: '4h' },
  ];

  // New template form state
  const [showNewTemplateForm, setShowNewTemplateForm] = useState(false);
  const [newTemplate, setNewTemplate] = useState<ShiftTemplateFormData>({
    name: '',
    description: '',
    default_start_time: '08:00',
    default_end_time: '16:00',
    department_id: '',
    required_staff_count: 1,
    break_minutes: 30
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    loadShiftTemplates();
  }, [authLoading, isAuthenticated, router]);

  const loadShiftTemplates = async () => {
    setLoading(true);
    setError(null);

    try {
      const templates = await fetchShiftTemplates();
      setShiftTemplates(templates);
    } catch (err: any) {
      console.error('Error loading shift templates:', err);
      setError(err.message || 'Failed to load shift templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await createShiftTemplate(newTemplate);
      setShowNewTemplateForm(false);
      setNewTemplate({
        name: '',
        description: '',
        default_start_time: '08:00',
        default_end_time: '16:00',
        department_id: '',
        required_staff_count: 1,
        break_minutes: 30
      });
      loadShiftTemplates();
    } catch (err: any) {
      console.error('Error creating shift template:', err);
      setError(err.message || 'Failed to create shift template');
    } finally {
      setCreating(false);
    }
  };

  const handleNewTemplateChange = (field: keyof ShiftTemplateFormData, value: any) => {
    const updatedTemplate = {
      ...newTemplate,
      [field]: value
    };

    // If start time changes, auto-adjust end time for standard 8-hour shift
    if (field === 'default_start_time' && value) {
      const [startHour] = value.split(':').map(Number);
      let endHour = startHour + 8;
      if (endHour >= 24) endHour = 0; // Handle overnight
      updatedTemplate.default_end_time = `${endHour.toString().padStart(2, '0')}:00`;
    }

    setNewTemplate(updatedTemplate);
  };

  const applyCommonShift = (shift: typeof commonShifts[0]) => {
    setNewTemplate(prev => ({
      ...prev,
      default_start_time: shift.start,
      default_end_time: shift.end,
      name: prev.name || `${shift.name} Shift`,
      description: prev.description || `${shift.duration} ${shift.name.toLowerCase()} shift`
    }));
  };

  const formatTime = (timeString: string) => {
    if (!timeString) return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getDuration = (start: string, end: string) => {
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    let startTotal = startHour * 60 + startMinute;
    let endTotal = endHour * 60 + endMinute;

    // Handle overnight shifts (end time is next day)
    if (endTotal < startTotal) {
      endTotal += 24 * 60; // Add 24 hours
    }

    const durationMinutes = endTotal - startTotal;

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  // Generate time options (15-minute intervals)
  const generateTimeOptions = () => {
    const options = [];
    for (let i = 0; i < 24 * 4; i++) {
      const hour = Math.floor(i / 4);
      const minute = (i % 4) * 15;
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      options.push({
        value: time,
        label: formatTime(time)
      });
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading shift templates...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Shift Templates</h1>
            <p className="text-gray-600 mt-1">
              Create and manage reusable shift patterns for scheduling
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/management/workforce/shifts')}
            >
              View Shifts
            </Button>
            <Button
              onClick={() => setShowNewTemplateForm(true)}
              disabled={showNewTemplateForm}
            >
              New Template
            </Button>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-red-800">Error</h3>
              <p className="text-red-700 mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={loadShiftTemplates}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Template Form */}
      {showNewTemplateForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Shift Template</CardTitle>
            <CardDescription>Define a reusable shift pattern</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTemplate}>
              {/* Common Shift Quick Select */}
              <div className="mb-6">
                <Label className="block mb-2">Quick Templates</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {commonShifts.map((shift) => (
                    <button
                      key={shift.name}
                      type="button"
                      onClick={() => applyCommonShift(shift)}
                      className="p-3 text-center border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="font-medium text-sm">{shift.name}</div>
                      <div className="text-xs text-gray-600">{shift.start} - {shift.end}</div>
                      <div className="text-xs text-gray-500">{shift.duration}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Information */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="template_name">Template Name *</Label>
                    <Input
                      id="template_name"
                      value={newTemplate.name}
                      onChange={(e) => handleNewTemplateChange('name', e.target.value)}
                      placeholder="e.g., Morning Shift, Evening Shift"
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="template_description">Description</Label>
                    <Textarea
                      id="template_description"
                      value={newTemplate.description}
                      onChange={(e) => handleNewTemplateChange('description', e.target.value)}
                      placeholder="Optional description of this shift template"
                      rows={3}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="required_staff">Required Staff Count</Label>
                    <Input
                      id="required_staff"
                      type="number"
                      min="1"
                      max="100"
                      value={newTemplate.required_staff_count}
                      onChange={(e) => handleNewTemplateChange('required_staff_count', parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label htmlFor="break_minutes">Break Minutes</Label>
                    <Input
                      id="break_minutes"
                      type="number"
                      min="0"
                      max="240"
                      value={newTemplate.break_minutes}
                      onChange={(e) => handleNewTemplateChange('break_minutes', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Total break time in minutes</p>
                  </div>
                </div>

                {/* Time Settings */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="start_time">Start Time</Label>
                    <select
                      id="start_time"
                      value={newTemplate.default_start_time}
                      onChange={(e) => handleNewTemplateChange('default_start_time', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {timeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="end_time">End Time</Label>
                    <select
                      id="end_time"
                      value={newTemplate.default_end_time}
                      onChange={(e) => handleNewTemplateChange('default_end_time', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {timeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="department">Department (Optional)</Label>
                    <Input
                      id="department"
                      value={newTemplate.department_id || ''}
                      onChange={(e) => handleNewTemplateChange('department_id', e.target.value)}
                      placeholder="Department ID"
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave empty for all departments</p>
                  </div>

                  {/* Duration Preview */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-700">Shift Preview</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-gray-600">Duration</p>
                        <p className="font-medium">
                          {getDuration(newTemplate.default_start_time, newTemplate.default_end_time)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Schedule</p>
                        <p className="font-medium">
                          {formatTime(newTemplate.default_start_time)} - {formatTime(newTemplate.default_end_time)}
                        </p>
                      </div>
                    </div>
                    {getDuration(newTemplate.default_start_time, newTemplate.default_end_time) !== '8h' && (
                      <p className="text-xs text-amber-600 mt-2">
                        ⚠️ Non-standard shift duration. Most businesses use 8-hour shifts.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewTemplateForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || !newTemplate.name.trim()}
                >
                  {creating ? 'Creating...' : 'Create Template'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Templates Grid */}
      {shiftTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <div className="text-4xl mb-4">📋</div>
              <h3 className="text-xl font-medium text-gray-900">No Shift Templates</h3>
              <p className="text-gray-600 mt-2">
                Create your first shift template to streamline scheduling.
              </p>
              <Button
                className="mt-4"
                onClick={() => setShowNewTemplateForm(true)}
              >
                Create First Template
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shiftTemplates.map((template) => (
            <Card key={template.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{template.name}</CardTitle>
                    <CardDescription>
                      {template.description || 'No description'}
                    </CardDescription>
                  </div>
                  <Badge variant={template.is_active ? "default" : "secondary"}>
                    {template.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* Template Details */}
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Time</p>
                      <p className="font-medium">
                        {formatTime(template.default_start_time)} - {formatTime(template.default_end_time)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Duration</p>
                      <p className="font-medium">
                        {getDuration(template.default_start_time, template.default_end_time)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Staff Required</p>
                      <p className="font-medium">{template.required_staff_count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Break Time</p>
                      <p className="font-medium">{template.break_minutes} minutes</p>
                    </div>
                  </div>

                  {template.department_id && (
                    <div>
                      <p className="text-sm text-gray-600">Department</p>
                      <p className="font-medium">{template.department_id}</p>
                    </div>
                  )}
                </div>

                {/* Created Info */}
                <div className="text-xs text-gray-500 pt-3 border-t border-gray-100">
                  Created: {formatDisplayDate(template.created_at)}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      // TODO: Implement edit functionality
                      alert('Edit functionality to be implemented');
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      router.push(`/dashboard/management/workforce/shifts/schedule?template=${template.id}`);
                    }}
                  >
                    Apply to Schedule
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Footer Stats */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <p>{shiftTemplates.length} template(s) available</p>
            <p>{shiftTemplates.filter(t => t.is_active).length} active template(s)</p>
          </div>
          <div className="text-sm text-gray-600">
            <p>Use templates to quickly schedule recurring shifts</p>
          </div>
        </div>
      </div>
    </div>
  );
}
