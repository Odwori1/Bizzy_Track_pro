'use client';

import { useState } from 'react';
import { FixedAsset } from '@/types/assets';

interface AssetFormProps {
  asset?: FixedAsset;
  onSubmit: (assetData: Partial<FixedAsset>) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

export const AssetForm: React.FC<AssetFormProps> = ({
  asset,
  onSubmit,
  onCancel,
  isLoading = false
}) => {
  const [formData, setFormData] = useState<Partial<FixedAsset>>({
    asset_code: asset?.asset_code || '',
    asset_name: asset?.asset_name || '',
    category: asset?.category || 'equipment',
    description: asset?.description || '',
    purchase_date: asset?.purchase_date || new Date().toISOString().split('T')[0],
    purchase_price: asset?.purchase_price || 0,
    supplier: asset?.supplier || '',
    invoice_reference: asset?.invoice_reference || '',
    current_value: asset?.current_value || 0,
    depreciation_method: asset?.depreciation_method || 'straight_line',
    depreciation_rate: asset?.depreciation_rate || 10,
    useful_life_years: asset?.useful_life_years || 5,
    salvage_value: asset?.salvage_value || 0,
    location: asset?.location || '',
    condition_status: asset?.condition_status || 'good',
    serial_number: asset?.serial_number || '',
    model: asset?.model || '',
    maintenance_schedule: asset?.maintenance_schedule || 'none',
    is_active: asset?.is_active ?? true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof FixedAsset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.asset_code?.trim()) {
      newErrors.asset_code = 'Asset code is required';
    }
    if (!formData.asset_name?.trim()) {
      newErrors.asset_name = 'Asset name is required';
    }
    if (!formData.purchase_date) {
      newErrors.purchase_date = 'Purchase date is required';
    }
    if (!formData.purchase_price || formData.purchase_price <= 0) {
      newErrors.purchase_price = 'Purchase price must be greater than 0';
    }
    if (!formData.depreciation_rate || formData.depreciation_rate <= 0) {
      newErrors.depreciation_rate = 'Depreciation rate must be greater than 0';
    }
    if (!formData.useful_life_years || formData.useful_life_years <= 0) {
      newErrors.useful_life_years = 'Useful life must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      // Error handling is done in the parent component
    }
  };

  const categories = [
    'property', 'vehicle', 'furniture', 'electronics', 
    'machinery', 'equipment', 'intangible', 'other'
  ];

  const conditionStatuses = [
    'excellent', 'good', 'fair', 'poor', 'broken'
  ];

  const maintenanceSchedules = [
    'none', 'monthly', 'quarterly', 'biannual', 'annual'
  ];

  const depreciationMethods = [
    { value: 'straight_line', label: 'Straight Line' },
    { value: 'reducing_balance', label: 'Reducing Balance' }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asset Code *
          </label>
          <input
            type="text"
            value={formData.asset_code}
            onChange={(e) => handleChange('asset_code', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.asset_code ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., ASSET-001"
          />
          {errors.asset_code && (
            <p className="mt-1 text-sm text-red-600">{errors.asset_code}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Asset Name *
          </label>
          <input
            type="text"
            value={formData.asset_name}
            onChange={(e) => handleChange('asset_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.asset_name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., Company Laptop"
          />
          {errors.asset_name && (
            <p className="mt-1 text-sm text-red-600">{errors.asset_name}</p>
          )}
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Describe the asset..."
        />
      </div>

      {/* Purchase Information */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Purchase Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Purchase Date *
            </label>
            <input
              type="date"
              value={formData.purchase_date}
              onChange={(e) => handleChange('purchase_date', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.purchase_date ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.purchase_date && (
              <p className="mt-1 text-sm text-red-600">{errors.purchase_date}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Purchase Price *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.purchase_price}
              onChange={(e) => handleChange('purchase_price', parseFloat(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.purchase_price ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="0.00"
            />
            {errors.purchase_price && (
              <p className="mt-1 text-sm text-red-600">{errors.purchase_price}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Supplier
            </label>
            <input
              type="text"
              value={formData.supplier}
              onChange={(e) => handleChange('supplier', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Supplier name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invoice Reference
            </label>
            <input
              type="text"
              value={formData.invoice_reference}
              onChange={(e) => handleChange('invoice_reference', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Invoice number"
            />
          </div>
        </div>
      </div>

      {/* Depreciation Information */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Depreciation Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Value
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.current_value}
              onChange={(e) => handleChange('current_value', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Depreciation Method
            </label>
            <select
              value={formData.depreciation_method}
              onChange={(e) => handleChange('depreciation_method', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {depreciationMethods.map(method => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Depreciation Rate (%) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.depreciation_rate}
              onChange={(e) => handleChange('depreciation_rate', parseFloat(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.depreciation_rate ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="10.0"
            />
            {errors.depreciation_rate && (
              <p className="mt-1 text-sm text-red-600">{errors.depreciation_rate}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Useful Life (Years) *
            </label>
            <input
              type="number"
              value={formData.useful_life_years}
              onChange={(e) => handleChange('useful_life_years', parseInt(e.target.value) || 0)}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.useful_life_years ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="5"
            />
            {errors.useful_life_years && (
              <p className="mt-1 text-sm text-red-600">{errors.useful_life_years}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Salvage Value
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.salvage_value}
              onChange={(e) => handleChange('salvage_value', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Additional Information */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => handleChange('location', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Office, Warehouse"
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
              placeholder="Serial number"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model
            </label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => handleChange('model', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Model name/number"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maintenance Schedule
            </label>
            <select
              value={formData.maintenance_schedule}
              onChange={(e) => handleChange('maintenance_schedule', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {maintenanceSchedules.map(schedule => (
                <option key={schedule} value={schedule}>
                  {schedule.charAt(0).toUpperCase() + schedule.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-4 pt-6 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : (asset ? 'Update Asset' : 'Create Asset')}
        </button>
      </div>
    </form>
  );
};
