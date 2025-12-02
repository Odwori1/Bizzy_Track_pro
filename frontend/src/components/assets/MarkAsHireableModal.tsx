'use client';

import { useState } from 'react';
import { useAssetHireStore } from '@/store/week6/asset-hire-store';
import { useCurrency } from '@/lib/currency';

interface MarkAsHireableModalProps {
  assetId: string;
  assetName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MarkAsHireableModal: React.FC<MarkAsHireableModalProps> = ({
  assetId,
  assetName,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { markAssetAsHireable, isLoading, error } = useAssetHireStore();
  const { format } = useCurrency();

  const [formData, setFormData] = useState({
    hire_rate_per_day: '',
    deposit_amount: '',
    minimum_hire_period: '1',
    current_location: '',
    condition_notes: ''
  });

  const [formErrors, setFormErrors] = useState({
    hire_rate_per_day: '',
    deposit_amount: ''
  });

  const validateForm = () => {
    const errors = {
      hire_rate_per_day: '',
      deposit_amount: ''
    };
    let isValid = true;

    // Validate hire rate
    const hireRate = parseFloat(formData.hire_rate_per_day);
    if (isNaN(hireRate) || hireRate <= 0) {
      errors.hire_rate_per_day = 'Hire rate must be a positive number';
      isValid = false;
    }

    // Validate deposit amount
    const deposit = parseFloat(formData.deposit_amount);
    if (isNaN(deposit) || deposit < 0) {
      errors.deposit_amount = 'Deposit amount cannot be negative';
      isValid = false;
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      // Convert strings to numbers for API
      const submitData = {
        hire_rate_per_day: parseFloat(formData.hire_rate_per_day),
        deposit_amount: parseFloat(formData.deposit_amount) || 0,
        minimum_hire_period: parseInt(formData.minimum_hire_period) || 1,
        current_location: formData.current_location,
        condition_notes: formData.condition_notes
      };

      await markAssetAsHireable(assetId, submitData);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to mark asset as hireable:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear error when user starts typing
    if (formErrors[field as keyof typeof formErrors]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Mark "{assetName}" as Hireable</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily Hire Rate *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.hire_rate_per_day}
              onChange={(e) => handleInputChange('hire_rate_per_day', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg ${
                formErrors.hire_rate_per_day ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter daily rate"
              required
            />
            {formErrors.hire_rate_per_day && (
              <p className="text-red-500 text-xs mt-1">{formErrors.hire_rate_per_day}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deposit Amount
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.deposit_amount}
              onChange={(e) => handleInputChange('deposit_amount', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg ${
                formErrors.deposit_amount ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Optional deposit amount"
            />
            {formErrors.deposit_amount && (
              <p className="text-red-500 text-xs mt-1">{formErrors.deposit_amount}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Hire Period (days)
            </label>
            <input
              type="number"
              min="1"
              value={formData.minimum_hire_period}
              onChange={(e) => handleInputChange('minimum_hire_period', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Location
            </label>
            <input
              type="text"
              value={formData.current_location}
              onChange={(e) => handleInputChange('current_location', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g., Equipment Yard"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Condition Notes
            </label>
            <textarea
              value={formData.condition_notes}
              onChange={(e) => handleInputChange('condition_notes', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Optional notes about equipment condition"
              rows={3}
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm p-2 bg-red-50 rounded">{error}</div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Mark as Hireable'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
