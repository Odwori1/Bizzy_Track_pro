'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMaintenanceStore } from '@/store/week6/maintenance-store';

export default function MaintenanceEditPage() {
  const params = useParams();
  const router = useRouter();
  const maintenanceId = params.maintenanceId as string;
  
  const { maintenanceRecords, updateMaintenance, fetchMaintenanceRecords } = useMaintenanceStore();
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

  const [formData, setFormData] = useState({
    maintenance_type: '',
    maintenance_date: '',
    cost: 0,
    description: '',
    technician: '',
    status: '',
    next_maintenance_date: '',
  });

  useEffect(() => {
    if (currentRecord) {
      setFormData({
        maintenance_type: currentRecord.maintenance_type || '',
        maintenance_date: currentRecord.maintenance_date || '',
        cost: currentRecord.cost || 0,
        description: currentRecord.description || '',
        technician: currentRecord.technician || '',
        status: currentRecord.status || '',
        next_maintenance_date: currentRecord.next_maintenance_date || '',
      });
    }
  }, [currentRecord]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await updateMaintenance(maintenanceId, formData);
      router.push('/dashboard/management/maintenance');
    } catch (error) {
      console.error('Failed to update maintenance record:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!currentRecord) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="text-lg text-gray-600">Loading maintenance record...</div>
        </div>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Edit Maintenance Record</h1>
          <p className="text-gray-600">{currentRecord.asset_name} - {currentRecord.asset_code}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maintenance Type *
              </label>
              <select
                value={formData.maintenance_type}
                onChange={(e) => handleChange('maintenance_type', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="routine">Routine</option>
                <option value="repair">Repair</option>
                <option value="inspection">Inspection</option>
                <option value="emergency">Emergency</option>
                <option value="preventive">Preventive</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status *
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maintenance Date *
              </label>
              <input
                type="date"
                value={formData.maintenance_date}
                onChange={(e) => handleChange('maintenance_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.cost}
                onChange={(e) => handleChange('cost', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Technician
              </label>
              <input
                type="text"
                value={formData.technician}
                onChange={(e) => handleChange('technician', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Next Maintenance Date
              </label>
              <input
                type="date"
                value={formData.next_maintenance_date}
                onChange={(e) => handleChange('next_maintenance_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-4 pt-6 border-t">
            <Link
              href="/dashboard/management/maintenance"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : 'Update Maintenance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
