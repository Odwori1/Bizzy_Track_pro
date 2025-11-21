'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { usePricingStore } from '@/store/pricingStore';

export default function NewSeasonalPricingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    adjustment_type: 'percentage' as 'percentage' | 'fixed' | 'override',
    adjustment_value: '',
    target_type: 'all_services' as 'all_services' | 'category' | 'specific_service' | 'customer_segment',
    target_id: '',
    is_active: true,
    priority: 50
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { actions } = usePricingStore.getState();

      // Validate dates
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);

      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }

      if (!formData.adjustment_value || parseFloat(formData.adjustment_value) <= 0) {
        throw new Error('Adjustment value must be greater than 0');
      }

      if (formData.adjustment_type === 'percentage' && parseFloat(formData.adjustment_value) > 100) {
        throw new Error('Percentage adjustment cannot exceed 100%');
      }

      // ✅ FIX: Send adjustment_value as NUMBER, not string
      const submitData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        start_date: formData.start_date,
        end_date: formData.end_date,
        adjustment_type: formData.adjustment_type,
        adjustment_value: parseFloat(formData.adjustment_value), // Convert to number
        target_type: formData.target_type,
        target_id: formData.target_id || null,
        is_active: formData.is_active,
        priority: formData.priority,
        // Add optional fields with defaults
        applies_to_new_customers: true,
        applies_to_existing_customers: true,
        is_recurring: false
      };

      console.log('🔄 Submitting seasonal pricing:', submitData);

      await actions.createSeasonalPricing(submitData);

      router.push('/dashboard/management/pricing/seasonal');
      router.refresh();

    } catch (err) {
      console.error('❌ Seasonal pricing creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create seasonal pricing');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Seasonal Pricing</h1>
          <p className="text-gray-600">Set up date-based pricing adjustments</p>
        </div>
        <Link href="/dashboard/management/pricing/seasonal">
          <Button variant="secondary" disabled={loading}>
            Back to Seasonal Pricing
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
        </div>
      )}

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Seasonal Pricing Details</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Rule Name *
                </label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Holiday Season 2024"
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="target_type" className="block text-sm font-medium text-gray-700">
                  Target Type *
                </label>
                <select
                  id="target_type"
                  name="target_type"
                  value={formData.target_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required
                  disabled={loading}
                >
                  <option value="all_services">All Services</option>
                  <option value="specific_service">Specific Service</option>
                  <option value="category">Service Category</option>
                  <option value="customer_segment">Customer Segment</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="adjustment_type" className="block text-sm font-medium text-gray-700">
                  Adjustment Type *
                </label>
                <select
                  id="adjustment_type"
                  name="adjustment_type"
                  value={formData.adjustment_type}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required
                  disabled={loading}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                  <option value="override">Override Price</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="adjustment_value" className="block text-sm font-medium text-gray-700">
                  Adjustment Value *
                </label>
                <Input
                  type="number"
                  id="adjustment_value"
                  name="adjustment_value"
                  value={formData.adjustment_value}
                  onChange={handleChange}
                  placeholder={formData.adjustment_type === 'percentage' ? '10' : '25.00'}
                  required
                  disabled={loading}
                  step="0.01"
                />
                <p className="text-xs text-gray-500">
                  {formData.adjustment_type === 'percentage'
                    ? 'Percentage discount/increase'
                    : formData.adjustment_type === 'fixed'
                    ? 'Fixed amount discount/increase'
                    : 'Override base price'}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                  Start Date *
                </label>
                <Input
                  type="date"
                  id="start_date"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="end_date" className="block text-sm font-medium text-gray-700">
                  End Date *
                </label>
                <Input
                  type="date"
                  id="end_date"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
                  Priority
                </label>
                <Input
                  type="number"
                  id="priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  min="1"
                  max="100"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500">Higher priority rules apply first (1-100)</p>
              </div>

              {formData.target_type === 'specific_service' && (
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="target_id" className="block text-sm font-medium text-gray-700">
                    Service ID
                  </label>
                  <Input
                    id="target_id"
                    name="target_id"
                    value={formData.target_id}
                    onChange={handleChange}
                    placeholder="Enter service ID"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="Special pricing during holiday season"
                  disabled={loading}
                />
              </div>

              <div className="flex items-center md:col-span-2">
                <input
                  type="checkbox"
                  id="is_active"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  className="mr-2"
                  disabled={loading}
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Active Rule
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Link href="/dashboard/management/pricing/seasonal">
                <Button type="button" variant="secondary" disabled={loading}>
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Creating Seasonal Pricing...' : 'Create Seasonal Pricing'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
