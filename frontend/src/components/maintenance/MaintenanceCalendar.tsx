'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MaintenanceRecord } from '@/types/assets';

interface MaintenanceCalendarProps {
  maintenanceRecords: MaintenanceRecord[];
  onDateClick?: (date: Date, records: MaintenanceRecord[]) => void;
}

export const MaintenanceCalendar: React.FC<MaintenanceCalendarProps> = ({ 
  maintenanceRecords,
  onDateClick 
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'scheduled': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getMaintenanceTypeIcon = (type: string) => {
    switch (type) {
      case 'routine': return '🛠️';
      case 'repair': return '🔧';
      case 'inspection': return '🔍';
      case 'emergency': return '🚨';
      case 'preventive': return '🛡️';
      default: return '⚙️';
    }
  };

  // Group maintenance records by date
  const recordsByDate = maintenanceRecords.reduce((acc, record) => {
    const date = new Date(record.maintenance_date).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(record);
    return acc;
  }, {} as Record<string, MaintenanceRecord[]>);

  // Get days in month
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const getRecordsForDate = (day: number) => {
    const date = new Date(year, month, day);
    return recordsByDate[date.toDateString()] || [];
  };

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && 
           month === today.getMonth() && 
           year === today.getFullYear();
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Calendar Header */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => navigateMonth('prev')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          ←
        </button>
        
        <h3 className="text-lg font-semibold text-gray-900">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h3>
        
        <button
          onClick={() => navigateMonth('next')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          →
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 mb-4">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
            {day}
          </div>
        ))}
        
        {/* Empty cells for days before the first day of month */}
        {Array.from({ length: startingDay }).map((_, index) => (
          <div key={`empty-${index}`} className="h-24 border border-gray-100 rounded-lg" />
        ))}
        
        {/* Days of the month */}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dateRecords = getRecordsForDate(day);
          const today = isToday(day);
          
          return (
            <div
              key={`day-${day}`}
              className={`
                h-24 border rounded-lg p-1 overflow-y-auto cursor-pointer
                ${today ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}
                ${dateRecords.length > 0 ? 'hover:border-gray-300' : ''}
              `}
              onClick={() => dateRecords.length > 0 && onDateClick?.(new Date(year, month, day), dateRecords)}
            >
              <div className="flex justify-between items-start">
                <span className={`
                  text-sm font-medium
                  ${today ? 'text-blue-700' : 'text-gray-900'}
                `}>
                  {day}
                </span>
                {dateRecords.length > 0 && (
                  <span className="text-xs bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                    {dateRecords.length}
                  </span>
                )}
              </div>
              
              {/* Maintenance events for this day */}
              <div className="space-y-1 mt-1">
                {dateRecords.slice(0, 2).map(record => (
                  <div
                    key={record.id}
                    className={`
                      text-xs p-1 rounded border
                      ${getStatusColor(record.status)}
                    `}
                    title={`${record.asset_name} - ${record.maintenance_type}`}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{getMaintenanceTypeIcon(record.maintenance_type)}</span>
                      <span className="truncate">{record.asset_name}</span>
                    </div>
                  </div>
                ))}
                {dateRecords.length > 2 && (
                  <div className="text-xs text-gray-500 text-center">
                    +{dateRecords.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
          <span>Completed</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
          <span>In Progress</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
          <span>Scheduled</span>
        </div>
      </div>

      {/* Upcoming Maintenance Summary */}
      {maintenanceRecords.filter(r => r.status === 'scheduled').length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-3">Upcoming Maintenance</h4>
          <div className="space-y-2">
            {maintenanceRecords
              .filter(record => record.status === 'scheduled')
              .slice(0, 3)
              .map(record => (
                <div key={record.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center space-x-2">
                    <span>{getMaintenanceTypeIcon(record.maintenance_type)}</span>
                    <span className="font-medium">{record.asset_name}</span>
                  </div>
                  <div className="text-gray-500">
                    {new Date(record.maintenance_date).toLocaleDateString()}
                  </div>
                </div>
              ))}
          </div>
          {maintenanceRecords.filter(r => r.status === 'scheduled').length > 3 && (
            <Link
              href="/dashboard/management/maintenance"
              className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
            >
              View all scheduled maintenance →
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
