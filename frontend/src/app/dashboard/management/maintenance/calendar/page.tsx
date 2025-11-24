'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMaintenanceStore } from '@/store/week6/maintenance-store';
import { MaintenanceCalendar } from '@/components/maintenance/MaintenanceCalendar';

export default function MaintenanceCalendarPage() {
  const { maintenanceRecords, isLoading, error, fetchMaintenanceRecords } = useMaintenanceStore();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);

  useEffect(() => {
    fetchMaintenanceRecords();
  }, [fetchMaintenanceRecords]);

  const handleDateClick = (date: Date, records: any[]) => {
    setSelectedDate(date);
    setSelectedRecords(records);
  };

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

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-64">Loading maintenance calendar...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Calendar</h1>
          <p className="text-gray-600">View and manage maintenance schedules</p>
        </div>
        <div className="space-x-4">
          <Link
            href="/dashboard/management/maintenance"
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            Back to List
          </Link>
          <Link
            href="/dashboard/management/maintenance/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Schedule Maintenance
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <MaintenanceCalendar 
            maintenanceRecords={maintenanceRecords} 
            onDateClick={handleDateClick}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Statistics */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Overview</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Records</span>
                <span className="text-sm font-medium text-gray-900">{maintenanceRecords.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Scheduled</span>
                <span className="text-sm font-medium text-yellow-600">
                  {maintenanceRecords.filter(r => r.status === 'scheduled').length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">In Progress</span>
                <span className="text-sm font-medium text-blue-600">
                  {maintenanceRecords.filter(r => r.status === 'in_progress').length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Completed</span>
                <span className="text-sm font-medium text-green-600">
                  {maintenanceRecords.filter(r => r.status === 'completed').length}
                </span>
              </div>
            </div>
          </div>

          {/* Selected Date Details */}
          {selectedDate && selectedRecords.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Maintenance on {selectedDate.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              <div className="space-y-3">
                {selectedRecords.map((record) => (
                  <div key={record.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span>{getMaintenanceTypeIcon(record.maintenance_type)}</span>
                        <span className="font-medium text-gray-900">{record.asset_name}</span>
                      </div>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(record.status)}`}>
                        {record.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>Type: <span className="capitalize">{record.maintenance_type}</span></div>
                      <div>Cost: ${record.cost}</div>
                      <div>Technician: {record.technician}</div>
                    </div>
                    <Link
                      href={`/dashboard/management/maintenance/${record.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
                    >
                      View Details →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Maintenance */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Maintenance</h3>
            <div className="space-y-3">
              {maintenanceRecords
                .filter(record => record.status === 'scheduled')
                .slice(0, 5)
                .map((record) => (
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
              {maintenanceRecords.filter(r => r.status === 'scheduled').length === 0 && (
                <p className="text-sm text-gray-500 text-center">No upcoming maintenance</p>
              )}
              {maintenanceRecords.filter(r => r.status === 'scheduled').length > 5 && (
                <Link
                  href="/dashboard/management/maintenance"
                  className="text-sm text-blue-600 hover:text-blue-800 block text-center"
                >
                  View all scheduled
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
