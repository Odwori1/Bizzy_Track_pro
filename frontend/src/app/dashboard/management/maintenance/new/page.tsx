'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMaintenanceStore } from '@/store/week6/maintenance-store';
import { useAssetsStore } from '@/store/week6/assets-store'; // ✅ FIXED IMPORT NAME

export default function NewMaintenancePage() {
  const router = useRouter();
  const { createMaintenance } = useMaintenanceStore();
  const { assets, fetchAssets } = useAssetsStore(); // ✅ FIXED USAGE
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const [formData, setFormData] = useState({
    asset_id: '',
    maintenance_type: 'routine',
    maintenance_date: new Date().toISOString().split('T')[0],
    cost: 0,
    technician: '',
    next_maintenance_date: '',
    description: '',
    status: 'scheduled'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.asset_id) {
      alert('Please select an asset');
      return;
    }

    setIsLoading(true);

    try {
      await createMaintenance(formData);
      alert('Maintenance scheduled successfully!');
      router.push('/dashboard/management/maintenance');
    } catch (error) {
      console.error('Failed to schedule maintenance:', error);
      alert('Failed to schedule maintenance. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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
          <h1 className="text-2xl font-bold text-gray-900">Schedule Maintenance</h1>
          <p className="text-gray-600">Create a new maintenance record</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Asset Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Asset *
                </label>
                <select
                  value={formData.asset_id}
                  onChange={(e) => handleChange('asset_id', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select Asset</option>
                  {assets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_name} - {asset.asset_code}
                    </option>
                  ))}
                </select>
                {assets.length === 0 && (
                  <p className="text-sm text-yellow-600 mt-1">Loading assets...</p>
                )}
              </div>

              {/* Maintenance Type */}
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

              {/* Maintenance Date */}
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

              {/* Status */}
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

              {/* Cost and Technician */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Technician
                  </label>
                  <input
                    type="text"
                    value={formData.technician}
                    onChange={(e) => handleChange('technician', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Technician name"
                  />
                </div>
              </div>

              {/* Next Maintenance Date */}
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

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe the maintenance work to be performed..."
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
                  {isLoading ? 'Scheduling...' : 'Schedule Maintenance'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar Information */}
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-800 mb-2">Maintenance Types</h4>
            <ul className="text-sm text-blue-700 space-y-2">
              <li className="flex items-start">
                <span className="mr-2">🛠️</span>
                <div>
                  <strong>Routine</strong>
                  <p className="text-xs">Regular scheduled maintenance to prevent issues</p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔧</span>
                <div>
                  <strong>Repair</strong>
                  <p className="text-xs">Fix existing issues or breakdowns</p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🔍</span>
                <div>
                  <strong>Inspection</strong>
                  <p className="text-xs">Check asset condition and identify potential issues</p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🚨</span>
                <div>
                  <strong>Emergency</strong>
                  <p className="text-xs">Urgent repairs for critical issues</p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="mr-2">🛡️</span>
                <div>
                  <strong>Preventive</strong>
                  <p className="text-xs">Proactive maintenance to prevent future issues</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-green-800 mb-2">Best Practices</h4>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• Schedule routine maintenance regularly</li>
              <li>• Record all maintenance activities</li>
              <li>• Track maintenance costs</li>
              <li>• Set reminders for next maintenance</li>
              <li>• Keep detailed maintenance history</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
