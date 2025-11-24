'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useMaintenanceStore } from '@/store/week6/maintenance-store';

export default function MaintenancePage() {
  const { maintenanceRecords, upcomingMaintenance, isLoading, error, fetchMaintenanceRecords, fetchUpcomingMaintenance } = useMaintenanceStore();

  useEffect(() => {
    fetchMaintenanceRecords();
    fetchUpcomingMaintenance();
  }, [fetchMaintenanceRecords, fetchUpcomingMaintenance]);

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-64">Loading maintenance records...</div>;
  }

  const completedMaintenance = maintenanceRecords.filter(record => record.status === 'completed');
  const scheduledMaintenance = maintenanceRecords.filter(record => record.status === 'scheduled');
  const inProgressMaintenance = maintenanceRecords.filter(record => record.status === 'in_progress');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Maintenance Management</h1>
        <div className="space-x-4">
          <Link
            href="/dashboard/management/maintenance/calendar"
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            Calendar View
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Records</h3>
          <p className="text-2xl font-bold">{maintenanceRecords.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Completed</h3>
          <p className="text-2xl font-bold text-green-600">{completedMaintenance.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Scheduled</h3>
          <p className="text-2xl font-bold text-yellow-600">{scheduledMaintenance.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">In Progress</h3>
          <p className="text-2xl font-bold text-blue-600">{inProgressMaintenance.length}</p>
        </div>
      </div>

      {/* Upcoming Maintenance */}
      {upcomingMaintenance.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Upcoming Maintenance</h3>
          <div className="space-y-2">
            {upcomingMaintenance.slice(0, 5).map((record) => (
              <div key={record.id} className="flex justify-between items-center">
                <div>
                  <span className="font-medium">{record.asset_name}</span>
                  <span className="text-sm text-yellow-700 ml-2">
                    - {record.maintenance_type} on {new Date(record.maintenance_date).toLocaleDateString()}
                  </span>
                </div>
                <Link
                  href={`/dashboard/management/maintenance/${record.id}`}
                  className="text-yellow-700 hover:text-yellow-900 text-sm"
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance Records Table */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Maintenance History</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Asset
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Technician
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {maintenanceRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{record.asset_name}</div>
                      <div className="text-sm text-gray-500">{record.asset_code}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {record.maintenance_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(record.maintenance_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      ${record.cost}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.technician}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        record.status === 'completed' ? 'bg-green-100 text-green-800' :
                        record.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        record.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {record.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Link
                        href={`/dashboard/management/maintenance/${record.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View
                      </Link>
                      <Link
                        href={`/dashboard/management/maintenance/${record.id}/edit`}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {maintenanceRecords.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No maintenance records found. <Link href="/dashboard/management/maintenance/new" className="text-blue-600 hover:text-blue-800">Schedule your first maintenance</Link>.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
