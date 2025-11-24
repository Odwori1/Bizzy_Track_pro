'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEquipmentStore } from '@/store/week6/equipment-store';

export default function EquipmentEditPage() {
  const params = useParams();
  const router = useRouter();
  const equipmentId = params.equipmentId as string;
  
  const { equipment, updateEquipment, fetchEquipment } = useEquipmentStore();
  const [currentEquipment, setCurrentEquipment] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  useEffect(() => {
    if (equipmentId && equipment.length > 0) {
      const foundEquipment = equipment.find(eq => eq.id === equipmentId);
      setCurrentEquipment(foundEquipment);
    }
  }, [equipmentId, equipment]);

  const [formData, setFormData] = useState({
    asset_name: '',
    asset_code: '',
    category: 'equipment',
    description: '',
    purchase_date: '',
    purchase_price: 0,
    current_value: 0,
    location: '',
    condition_status: 'good',
    serial_number: '',
    is_available: true,
    hire_rate: 0,
    deposit_amount: 0,
    min_hire_duration: 1,
    max_hire_duration: 7,
  });

  useEffect(() => {
    if (currentEquipment) {
      setFormData({
        asset_name: currentEquipment.asset_name || '',
        asset_code: currentEquipment.asset_code || '',
        category: currentEquipment.category || 'equipment',
        description: currentEquipment.description || '',
        purchase_date: currentEquipment.purchase_date || new Date().toISOString().split('T')[0],
        purchase_price: currentEquipment.purchase_price || 0,
        current_value: currentEquipment.current_value || 0,
        location: currentEquipment.location || '',
        condition_status: currentEquipment.condition_status || 'good',
        serial_number: currentEquipment.serial_number || '',
        is_available: currentEquipment.is_available ?? true,
        hire_rate: currentEquipment.hire_rate || 0,
        deposit_amount: currentEquipment.deposit_amount || 0,
        min_hire_duration: currentEquipment.min_hire_duration || 1,
        max_hire_duration: currentEquipment.max_hire_duration || 7,
      });
    }
  }, [currentEquipment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await updateEquipment(equipmentId, formData);
      router.push('/dashboard/management/equipment');
    } catch (error) {
      console.error('Failed to update equipment:', error);
      alert('Failed to update equipment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const categories = [
    'equipment', 'machinery', 'tools', 'electronics', 'vehicle', 'other'
  ];

  const conditionStatuses = [
    'excellent', 'good', 'fair', 'poor', 'broken'
  ];

  if (!currentEquipment) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="text-lg text-gray-600">Equipment not found</div>
          <Link href="/dashboard/management/equipment" className="text-blue-600 hover:text-blue-800">
            Back to Equipment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link 
            href="/dashboard/management/equipment" 
            className="text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Equipment
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Edit Equipment</h1>
          <p className="text-gray-600">{currentEquipment.asset_name}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Equipment Name *
              </label>
              <input
                type="text"
                value={formData.asset_name}
                onChange={(e) => handleChange('asset_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Equipment Code *
              </label>
              <input
                type="text"
                value={formData.asset_code}
                onChange={(e) => handleChange('asset_code', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Condition
              </label>
              <select
                value={formData.condition_status}
                onChange={(e) => handleChange('condition_status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {conditionStatuses.map(status => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Financial Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.purchase_price}
                onChange={(e) => handleChange('purchase_price', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Value ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.current_value}
                onChange={(e) => handleChange('current_value', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Serial Number
              </label>
              <input
                type="text"
                value={formData.serial_number}
                onChange={(e) => handleChange('serial_number', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Hire Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hire Rate ($/day) *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.hire_rate}
                onChange={(e) => handleChange('hire_rate', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deposit Amount ($) *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.deposit_amount}
                onChange={(e) => handleChange('deposit_amount', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Hire Duration Limits */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Hire Duration (days)
              </label>
              <input
                type="number"
                value={formData.min_hire_duration}
                onChange={(e) => handleChange('min_hire_duration', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Hire Duration (days)
              </label>
              <input
                type="number"
                value={formData.max_hire_duration}
                onChange={(e) => handleChange('max_hire_duration', parseInt(e.target.value) || 7)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
              />
            </div>
          </div>

          {/* Availability */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_available}
                onChange={(e) => handleChange('is_available', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Equipment is available for hire</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              Uncheck this if the equipment is under maintenance or not available for hire
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Describe the equipment, features, and any special instructions..."
            />
          </div>

          <div className="flex justify-end space-x-4 pt-6 border-t">
            <Link
              href="/dashboard/management/equipment"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Updating...' : 'Update Equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
