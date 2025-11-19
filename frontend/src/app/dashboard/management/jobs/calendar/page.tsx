'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useJobs } from '@/hooks/useJobs';
import { Job } from '@/types/jobs';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  jobs: Job[];
}

export default function JobCalendarPage() {
  const { jobs, loading, error, refetch } = useJobs();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);

  // Generate calendar days when currentDate or jobs change
  useEffect(() => {
    generateCalendar();
  }, [currentDate, jobs]);

  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // First day of the month
    const firstDay = new Date(year, month, 1);
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0);
    // First day of calendar (might be previous month)
    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
    
    // Last day of calendar (might be next month)
    const calendarEnd = new Date(lastDay);
    calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));
    
    const days: CalendarDay[] = [];
    const currentDateIter = new Date(calendarStart);
    
    while (currentDateIter <= calendarEnd) {
      const date = new Date(currentDateIter);
      const isCurrentMonth = date.getMonth() === month;
      
      // Filter jobs for this date
      const dayJobs = jobs.filter(job => {
        if (!job.scheduled_date) return false;
        const jobDate = new Date(job.scheduled_date.utc);
        return (
          jobDate.getDate() === date.getDate() &&
          jobDate.getMonth() === date.getMonth() &&
          jobDate.getFullYear() === date.getFullYear()
        );
      });
      
      days.push({
        date: new Date(date),
        isCurrentMonth,
        jobs: dayJobs
      });
      
      currentDateIter.setDate(currentDateIter.getDate() + 1);
    }
    
    setCalendarDays(days);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getJobStatusColor = (status: Job['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 border-green-300';
      case 'in-progress': return 'bg-blue-100 border-blue-300';
      case 'pending': return 'bg-yellow-100 border-yellow-300';
      case 'cancelled': return 'bg-gray-100 border-gray-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job Calendar</h1>
            <p className="text-gray-600">Loading calendar view...</p>
          </div>
        </div>
        <div className="text-center py-12">
          <div className="text-gray-500">Loading jobs...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Calendar</h1>
          <p className="text-gray-600">View and manage scheduled jobs</p>
        </div>
        <div className="flex space-x-4">
          <Link href="/dashboard/management/jobs">
            <Button variant="secondary">
              List View
            </Button>
          </Link>
          <Link href="/dashboard/management/jobs/board">
            <Button variant="secondary">
              Kanban Board
            </Button>
          </Link>
          <Link href="/dashboard/management/jobs/new">
            <Button variant="primary">
              Create New Job
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={refetch} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Calendar Controls */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                Next
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Weekday headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {calendarDays.map((day, index) => (
              <div
                key={index}
                className={`min-h-32 p-2 border rounded-lg ${
                  day.isCurrentMonth 
                    ? 'bg-white border-gray-200' 
                    : 'bg-gray-50 border-gray-100 text-gray-400'
                } ${
                  day.date.toDateString() === new Date().toDateString() 
                    ? 'border-blue-300 bg-blue-50' 
                    : ''
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-sm font-medium ${
                    day.date.toDateString() === new Date().toDateString()
                      ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center'
                      : ''
                  }`}>
                    {day.date.getDate()}
                  </span>
                </div>
                
                {/* Jobs for this day */}
                <div className="space-y-1 max-h-20 overflow-y-auto">
                  {day.jobs.slice(0, 3).map(job => (
                    <Link key={job.id} href={`/dashboard/management/jobs/${job.id}`}>
                      <div 
                        className={`text-xs p-1 rounded border cursor-pointer hover:shadow-sm transition-shadow ${getJobStatusColor(job.status)}`}
                        title={`${job.title} - ${job.customer_first_name} ${job.customer_last_name}`}
                      >
                        <div className="font-medium truncate">{job.title}</div>
                        <div className="text-gray-600 truncate">
                          {job.customer_first_name} {job.customer_last_name?.charAt(0)}.
                        </div>
                      </div>
                    </Link>
                  ))}
                  {day.jobs.length > 3 && (
                    <div className="text-xs text-gray-500 text-center">
                      +{day.jobs.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Legend */}
      <Card>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Status Legend</h3>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
              <span className="text-sm text-gray-600">Pending</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
              <span className="text-sm text-gray-600">In Progress</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
              <span className="text-sm text-gray-600">Completed</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
              <span className="text-sm text-gray-600">Cancelled</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
