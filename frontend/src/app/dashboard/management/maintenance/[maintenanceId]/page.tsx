'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMaintenanceStore } from '@/store/week6/maintenance-store';

export default function MaintenanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const maintenanceId = params.maintenanceId as string;

  const { maintenanceRecords, fetchMaintenanceRecords, updateMaintenance } = useMaintenanceStore();
  const [currentRecord, setCurrentRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchMaintenanceRecords();
  }, [fetchMaintenanceRecords]);

  useEffect(() => {
    if (maintenanceId && maintenanceRecords.length > 0) {
      const foundRecord = maintenanceRecords.find(record => record.id === maintenanceId);
      setCurrentRecord(foundRecord);
    }
  }, [maintenanceId, maintenanceRecords]);

  const handleMarkComplete = async () => {
    if (!currentRecord) return;

    if (!confirm('Mark this maintenance as completed?')) {
      return;
    }

    setIsLoading(true);
    try {
      await updateMaintenance(maintenanceId, {
        status: 'completed',
        maintenance_date: new Date().toISOString().split('T')[0]
      });
      alert('Maintenance marked as completed!');
      fetchMaintenanceRecords();
    } catch (error) {
      console.error('Failed to update maintenance:', error);
      alert('Failed to update maintenance. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!currentRecord) return;

    const newDate = prompt('Enter new maintenance date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (newDate) {
      setIsLoading(true);
      try {
        await updateMaintenance(maintenanceId, {
          maintenance_date: newDate,
          status: 'scheduled'
        });
        alert('Maintenance rescheduled successfully!');
        fetchMaintenanceRecords();
      } catch (error) {
        console.error('Failed to reschedule maintenance:', error);
        alert('Failed to reschedule maintenance. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleEditRecord = () => {
    router.push(`/dashboard/management/maintenance/${maintenanceId}/edit`);
  };

  const formatDate = (dateInput: any): string => {
    if (!dateInput) return 'Not set';
    try {
      const dateString = dateInput.utc || dateInput.iso_local || dateInput;
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Date not set';
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return 'Date error';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getMaintenanceTypeIcon = (type: string) => {
    switch (type) {
      case 'routine':
        return '🛠️';
      case 'repair':
        return '🔧';
      case 'inspection':
        return '🔍';
      case 'emergency':
        return '🚨';
      case 'preventive':
        return '🛡️';
      default:
        return '⚙️';
    }
  };

  if (!currentRecord) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="text-lg text-gray-600">Loading maintenance record...</div>
          <Link href="/dashboard/management/maintenance" className="text-blue-600 hover:text-blue-800 mt-2 inline-block">
            Back to Maintenance
          </Link>
        </div>
      </div>
    );
  }

  const canMarkComplete = currentRecord.status !== 'completed' && currentRecord.status !== 'cancelled';
  const canReschedule = currentRecord.status !== 'completed' && currentRecord.status !== 'cancelled';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link
            href="/dashboard/management/maintenance"
            className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Maintenance
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Record</h1>
          <p className="text-gray-600">
            {currentRecord.asset_name} - {currentRecord.asset_code}
          </p>
        </div>
        <div className="space-x-2">
          <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(currentRecord.status)}`}>
            {currentRecord.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Maintenance Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Basic Information</h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Asset</dt>
                    <dd className="text-sm text-gray-900">{currentRecord.asset_name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Asset Code</dt>
                    <dd className="text-sm text-gray-900">{currentRecord.asset_code}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Maintenance Type</dt>
                    <dd className="text-sm text-gray-900">
                      <span className="mr-2">{getMaintenanceTypeIcon(currentRecord.maintenance_type)}</span>
                      {currentRecord.maintenance_type}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Scheduled Date</dt>
                    <dd className="text-sm text-gray-900">{formatDate(currentRecord.maintenance_date)}</dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Cost & Personnel</h3>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Cost</dt>
                    <dd className="text-sm text-gray-900">${parseFloat(currentRecord.cost || 0).toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Technician</dt>
                    <dd className="text-sm text-gray-900">{currentRecord.technician || 'Not assigned'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Status</dt>
                    <dd className="text-sm text-gray-900">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(currentRecord.status)}`}>
                        {currentRecord.status}
                      </span>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600">Next Maintenance</dt>
                    <dd className="text-sm text-gray-900">{formatDate(currentRecord.next_maintenance_date)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Description */}
            {currentRecord.description && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Description</h3>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded border">
                  {currentRecord.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Actions */}
        <div className="space-y-6">
          {/* Maintenance Actions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Actions</h3>
            <div className="space-y-2">
              <button 
                onClick={handleEditRecord}
                disabled={isLoading}
                className="w-full bg-blue-50 text-blue-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Edit Record
              </button>
              
              {canMarkComplete && (
                <button 
                  onClick={handleMarkComplete}
                  disabled={isLoading}
                  className="w-full bg-green-50 text-green-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Updating...' : 'Mark Complete'}
                </button>
              )}
              
              {canReschedule && (
                <button 
                  onClick={handleReschedule}
                  disabled={isLoading}
                  className="w-full bg-yellow-50 text-yellow-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-yellow-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reschedule
                </button>
              )}
              
              <Link
                href="/dashboard/management/maintenance"
                className="w-full bg-gray-50 text-gray-700 text-sm font-medium py-2 px-3 rounded text-center hover:bg-gray-100 transition-colors block"
              >
                Back to Maintenance
              </Link>
            </div>
          </div>

          {/* Maintenance Type Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {getMaintenanceTypeIcon(currentRecord.maintenance_type)}
              {' '}
              {currentRecord.maintenance_type.charAt(0).toUpperCase() + currentRecord.maintenance_type.slice(1)} Maintenance
            </h3>
            <p className="text-sm text-gray-600">
              {currentRecord.maintenance_type === 'routine' && 'Regular scheduled maintenance to prevent issues'}
              {currentRecord.maintenance_type === 'repair' && 'Fix existing issues or breakdowns'}
              {currentRecord.maintenance_type === 'inspection' && 'Check asset condition and identify potential issues'}
              {currentRecord.maintenance_type === 'emergency' && 'Urgent repairs for critical issues'}
              {currentRecord.maintenance_type === 'preventive' && 'Proactive maintenance to prevent future issues'}
            </p>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Timeline</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Record Created</p>
                  <p className="text-xs text-gray-500">{formatDate(currentRecord.created_at)}</p>
                </div>
              </div>

              {currentRecord.status === 'completed' && (
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Completed</p>
                    <p className="text-xs text-gray-500">{formatDate(currentRecord.maintenance_date)}</p>
                  </div>
                </div>
              )}

              {currentRecord.next_maintenance_date && (
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Next Maintenance</p>
                    <p className="text-xs text-gray-500">{formatDate(currentRecord.next_maintenance_date)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
