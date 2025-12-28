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
import { useWorkforce } from '@/hooks/useWorkforce';
import { ClockEvent } from '@/types/workforce';

export default function ClockEventsPage() {
  const router = useRouter();
  const { fetchClockEvents, loading: workforceLoading } = useWorkforce();

  const [clockEvents, setClockEvents] = useState<ClockEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<ClockEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [dateFilter, setDateFilter] = useState<string>('');
  const [staffFilter, setStaffFilter] = useState<string>('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('');

  useEffect(() => {
    loadClockEvents();
  }, []);

  useEffect(() => {
    filterEvents();
  }, [clockEvents, dateFilter, staffFilter, eventTypeFilter]);

  const loadClockEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch more events - let's get 50 instead of 10
      const events = await fetchClockEvents(undefined, 50);
      setClockEvents(events);
    } catch (err: any) {
      console.error('Error loading clock events:', err);
      setError(err.message || 'Failed to load clock events');
    } finally {
      setLoading(false);
    }
  };

  const filterEvents = () => {
    let filtered = [...clockEvents];

    if (dateFilter) {
      const filterDate = new Date(dateFilter).toDateString();
      filtered = filtered.filter(event => 
        new Date(event.event_time).toDateString() === filterDate
      );
    }

    if (staffFilter) {
      filtered = filtered.filter(event =>
        event.user_full_name?.toLowerCase().includes(staffFilter.toLowerCase()) ||
        event.employee_id?.toLowerCase().includes(staffFilter.toLowerCase())
      );
    }

    if (eventTypeFilter) {
      filtered = filtered.filter(event =>
        event.event_type === eventTypeFilter
      );
    }

    setFilteredEvents(filtered);
  };

  const getEventTypeBadge = (eventType: string) => {
    const styles: Record<string, { variant: string, label: string }> = {
      'clock_in': { variant: 'default', label: 'CLOCK IN' },
      'clock_out': { variant: 'secondary', label: 'CLOCK OUT' },
      'break_start': { variant: 'outline', label: 'BREAK START' },
      'break_end': { variant: 'outline', label: 'BREAK END' }
    };

    const style = styles[eventType] || { variant: 'default', label: eventType.toUpperCase() };
    
    return (
      <Badge variant={style.variant as any}>
        {style.label}
      </Badge>
    );
  };

  const extractLocationFromNotes = (notes: string) => {
    if (!notes) return 'Not recorded';
    
    // Check if notes contain location pattern [Location: ...]
    const locationMatch = notes.match(/\[Location:\s*(.*?)\]/);
    if (locationMatch) {
      return locationMatch[1];
    }
    
    // Check if notes start with "Location: "
    if (notes.startsWith('Location: ')) {
      return notes.substring(10);
    }
    
    return 'Not specified';
  };

  const extractNotesWithoutLocation = (notes: string) => {
    if (!notes) return '';
    
    // Remove location from notes if present
    const withoutLocation = notes.replace(/\[Location:\s*(.*?)\]\s*/, '').replace(/^Location:\s*(.*?)\s*/, '');
    return withoutLocation.trim() || 'No additional notes';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading clock events...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clock Events History</h1>
            <p className="text-gray-600 mt-1">
              Detailed view of all clock in/out and break events
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => router.push('/dashboard/management/workforce/timesheets/clock')}
            >
              Go to Time Clock
            </Button>
            <Button
              variant="outline"
              onClick={loadClockEvents}
            >
              Refresh
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
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter clock events by date, staff, or event type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="date_filter">Date</Label>
              <Input
                id="date_filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="staff_filter">Staff Name or ID</Label>
              <Input
                id="staff_filter"
                placeholder="Search by name or employee ID"
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="event_type_filter">Event Type</Label>
              <select
                id="event_type_filter"
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Events</option>
                <option value="clock_in">Clock In</option>
                <option value="clock_out">Clock Out</option>
                <option value="break_start">Break Start</option>
                <option value="break_end">Break End</option>
              </select>
            </div>
          </div>
          
          {(dateFilter || staffFilter || eventTypeFilter) && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-gray-600">
                Showing {filteredEvents.length} of {clockEvents.length} events
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFilter('');
                  setStaffFilter('');
                  setEventTypeFilter('');
                }}
              >
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clock Events Display */}
      <Card>
        <CardHeader>
          <CardTitle>Clock Events</CardTitle>
          <CardDescription>
            {clockEvents.length} total events • {filteredEvents.length} filtered
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No clock events found</p>
              {(dateFilter || staffFilter || eventTypeFilter) && (
                <p className="mt-2">Try clearing your filters</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEvents.map((event) => {
                const eventTime = new Date(event.event_time);
                const isToday = new Date().toDateString() === eventTime.toDateString();
                const location = extractLocationFromNotes(event.notes || '');
                const cleanNotes = extractNotesWithoutLocation(event.notes || '');
                
                return (
                  <div key={event.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left side - Staff & Event Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="font-medium text-gray-900">{event.user_full_name || 'Unknown Staff'}</div>
                          <div className="text-sm text-gray-600">({event.employee_id || 'N/A'})</div>
                          <div>
                            {getEventTypeBadge(event.event_type)}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Date:</span>{' '}
                            {isToday ? 'Today' : formatDisplayDate(event.event_time)}
                          </div>
                          <div>
                            <span className="font-medium">Time:</span>{' '}
                            {formatTime(event.event_time)}
                          </div>
                          <div>
                            <span className="font-medium">Location:</span>{' '}
                            <span className={location === 'Not recorded' ? 'text-gray-400' : 'text-gray-700'}>
                              {location}
                            </span>
                          </div>
                        </div>
                        
                        {cleanNotes !== 'No additional notes' && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">Notes:</span>{' '}
                            <span className="text-gray-700">{cleanNotes}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Right side - Timestamp */}
                      <div className="text-xs text-gray-500">
                        Recorded: {formatDisplayDate(event.event_time)} at {formatTime(event.event_time)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{clockEvents.length}</div>
              <div className="text-sm text-gray-600">Total Events</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {clockEvents.filter(e => e.event_type === 'clock_in').length}
              </div>
              <div className="text-sm text-gray-600">Clock Ins</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {clockEvents.filter(e => e.event_type === 'break_start').length}
              </div>
              <div className="text-sm text-gray-600">Break Starts</div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {clockEvents.filter(e => e.event_type.includes('break')).length}
              </div>
              <div className="text-sm text-gray-600">Total Breaks</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different views */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Event Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="summary">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="by_staff">By Staff</TabsTrigger>
              <TabsTrigger value="by_date">By Date</TabsTrigger>
            </TabsList>
            
            <TabsContent value="summary" className="mt-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>Average events per day (last 7 days):</span>
                  <span className="font-medium">
                    {calculateAverageEvents(clockEvents, 7)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>Most active staff member:</span>
                  <span className="font-medium">
                    {getMostActiveStaff(clockEvents)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span>Latest clock event:</span>
                  <span className="font-medium">
                    {clockEvents.length > 0 ? formatTime(clockEvents[0].event_time) : 'N/A'}
                  </span>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="by_staff" className="mt-4">
              <div className="space-y-2">
                {getStaffEventCounts(clockEvents).map((staff, index) => (
                  <div key={index} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                    <span>{staff.name}</span>
                    <div className="flex gap-4">
                      <Badge variant="outline">{staff.count} events</Badge>
                      <Badge variant="secondary">{staff.lastEvent}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="by_date" className="mt-4">
              <div className="space-y-2">
                {getDateEventCounts(clockEvents).map((dateInfo, index) => (
                  <div key={index} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                    <span>{dateInfo.date}</span>
                    <Badge>{dateInfo.count} events</Badge>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );

  // Helper functions for statistics
  function calculateAverageEvents(events: ClockEvent[], days: number): string {
    if (events.length === 0) return '0';
    const uniqueDates = new Set(events.map(e => new Date(e.event_time).toDateString()));
    const avg = events.length / Math.min(days, uniqueDates.size);
    return avg.toFixed(1);
  }

  function getMostActiveStaff(events: ClockEvent[]): string {
    if (events.length === 0) return 'N/A';
    
    const staffCounts: Record<string, number> = {};
    events.forEach(event => {
      const name = event.user_full_name || 'Unknown';
      staffCounts[name] = (staffCounts[name] || 0) + 1;
    });
    
    const mostActive = Object.entries(staffCounts).sort((a, b) => b[1] - a[1])[0];
    return mostActive ? `${mostActive[0]} (${mostActive[1]} events)` : 'N/A';
  }

  function getStaffEventCounts(events: ClockEvent[]) {
    const staffMap: Record<string, { name: string, count: number, lastEvent: string }> = {};
    
    events.forEach(event => {
      const name = event.user_full_name || 'Unknown Staff';
      if (!staffMap[name]) {
        staffMap[name] = { name, count: 0, lastEvent: '' };
      }
      staffMap[name].count++;
      
      // Update last event time if this is more recent
      const eventTime = new Date(event.event_time);
      if (!staffMap[name].lastEvent || eventTime > new Date(staffMap[name].lastEvent)) {
        staffMap[name].lastEvent = formatTime(event.event_time);
      }
    });
    
    return Object.values(staffMap).sort((a, b) => b.count - a.count);
  }

  function getDateEventCounts(events: ClockEvent[]) {
    const dateMap: Record<string, number> = {};
    
    events.forEach(event => {
      const dateStr = formatDisplayDate(event.event_time);
      dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
    });
    
    return Object.entries(dateMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10); // Show last 10 days
  }
}
