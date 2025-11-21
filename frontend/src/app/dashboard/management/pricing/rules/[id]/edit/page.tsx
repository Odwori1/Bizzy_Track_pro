'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Link from 'next/link';
import { usePricingRule, usePricingActions } from '@/hooks/usePricing';

interface EditPricingRulePageProps {
  params: Promise<{
    id: string;
  }>;
}

interface PricingRuleFormData {
  name: string;
  description: string;
  rule_type: string;
  conditions: {
    customer_category_id?: string;
    min_quantity?: number;
    day_of_week?: number[];
  };
  adjustment_type: string;
  adjustment_value: number;
  target_entity: string;
  priority: number;
  is_active: boolean;
}

export default function EditPricingRulePage({ params }: EditPricingRulePageProps) {
  const router = useRouter();
  const [ruleId, setRuleId] = useState<string | null>(null);
  const { pricingRule, loading: ruleLoading, error: ruleError, refetch } = usePricingRule(ruleId || undefined);
  const { updatePricingRule } = usePricingActions();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<PricingRuleFormData>({
    name: '',
    description: '',
    rule_type: 'customer_category',
    conditions: {
      customer_category_id: '7c1b1017-c8a7-4471-bb8d-cfd137d19fe5'
    },
    adjustment_type: 'percentage',
    adjustment_value: 0,
    target_entity: 'service',
    priority: 50,
    is_active: true
  });

  // Unwrap the params promise
  useEffect(() => {
    const unwrapParams = async () => {
      const unwrappedParams = await params;
      setRuleId(unwrappedParams.id);
    };

    unwrapParams();
  }, [params]);

  // Populate form when rule data is loaded
  useEffect(() => {
    if (pricingRule) {
      setFormData({
        name: pricingRule.name || '',
        description: pricingRule.description || '',
        rule_type: pricingRule.rule_type || 'customer_category',
        conditions: pricingRule.conditions || {
          customer_category_id: '7c1b1017-c8a7-4471-bb8d-cfd137d19fe5'
        },
        adjustment_type: pricingRule.adjustment_type || 'percentage',
        adjustment_value: pricingRule.adjustment_value || 0,
        target_entity: pricingRule.target_entity || 'service',
        priority: pricingRule.priority || 50,
        is_active: pricingRule.is_active !== undefined ? pricingRule.is_active : true
      });
    }
  }, [pricingRule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleId) return;

    setLoading(true);
    setError(null);

    try {
      console.log('Updating pricing rule:', ruleId, formData);

      const result = await updatePricingRule(ruleId, formData);

      if (result.success) {
        // Redirect to pricing rules list on success
        router.push('/dashboard/management/pricing/rules');
        router.refresh();
      } else {
        setError(result.error || 'Failed to update pricing rule. Please try again.');
      }
    } catch (err) {
      console.error('Pricing rule update error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (name.startsWith('conditions.')) {
      const conditionField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        conditions: {
          ...prev.conditions,
          [conditionField]: type === 'number' ? parseFloat(value) : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseFloat(value) : 
                type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
                value
      }));
    }
  };

  const handleRuleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const ruleType = e.target.value;
    let conditions = {};
    
    // Set default conditions based on rule type
    switch (ruleType) {
      case 'customer_category':
        conditions = { customer_category_id: '7c1b1017-c8a7-4471-bb8d-cfd137d19fe5' };
        break;
      case 'quantity_tier':
        conditions = { min_quantity: 10 };
        break;
      case 'time_based':
        conditions = { day_of_week: [0, 6] }; // Weekend
        break;
      default:
        conditions = {};
    }
    
    setFormData(prev => ({
      ...prev,
      rule_type: ruleType,
      conditions
    }));
  };

  if (!ruleId || ruleLoading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-500">Loading pricing rule data...</div>
      </div>
    );
  }

  if (ruleError || !pricingRule) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pricing Rule Not Found</h1>
            <p className="text-gray-600">Unable to load pricing rule for editing</p>
          </div>
          <Link href="/dashboard/management/pricing/rules">
            <Button variant="secondary">
              Back to Pricing Rules
            </Button>
          </Link>
        </div>
        <Card>
          <div className="p-6 text-center">
            <div className="text-red-600 mb-4">Error loading pricing rule: {ruleError}</div>
            <Button variant="primary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Pricing Rule</h1>
          <p className="text-gray-600">Update pricing rule: {pricingRule.name}</p>
        </div>
        <Link href="/dashboard/management/pricing/rules">
          <Button variant="secondary" disabled={loading}>
            Back to Pricing Rules
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
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Pricing Rule Details</h2>

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
                  placeholder="Enter rule name"
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="rule_type" className="block text-sm font-medium text-gray-700">
                  Rule Type *
                </label>
                <select
                  id="rule_type"
                  name="rule_type"
                  value={formData.rule_type}
                  onChange={handleRuleTypeChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required
                  disabled={loading}
                >
                  <option value="customer_category">Customer Category</option>
                  <option value="quantity_tier">Quantity Tier</option>
                  <option value="time_based">Time Based</option>
                  <option value="seasonal">Seasonal</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="target_entity" className="block text-sm font-medium text-gray-700">
                  Target Entity *
                </label>
                <select
                  id="target_entity"
                  name="target_entity"
                  value={formData.target_entity}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  required
                  disabled={loading}
                >
                  <option value="service">Service</option>
                  <option value="customer">Customer</option>
                  <option value="category">Category</option>
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
                  placeholder="Enter value"
                  required
                  disabled={loading}
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="priority" className="block text-sm font-medium text-gray-700">
                  Priority (1-100) *
                </label>
                <Input
                  type="number"
                  id="priority"
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  placeholder="Enter priority (1-100)"
                  min="1"
                  max="100"
                  required
                  disabled={loading}
                />
              </div>

              {/* Conditional fields based on rule type */}
              {formData.rule_type === 'customer_category' && (
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="conditions.customer_category_id" className="block text-sm font-medium text-gray-700">
                    Customer Category ID
                  </label>
                  <Input
                    id="conditions.customer_category_id"
                    name="conditions.customer_category_id"
                    value={formData.conditions.customer_category_id || ''}
                    onChange={handleChange}
                    placeholder="Enter customer category ID"
                    disabled={loading}
                  />
                </div>
              )}

              {formData.rule_type === 'quantity_tier' && (
                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="conditions.min_quantity" className="block text-sm font-medium text-gray-700">
                    Minimum Quantity
                  </label>
                  <Input
                    type="number"
                    id="conditions.min_quantity"
                    name="conditions.min_quantity"
                    value={formData.conditions.min_quantity || ''}
                    onChange={handleChange}
                    placeholder="Enter minimum quantity"
                    min="1"
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
                  placeholder="Enter rule description"
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
              <Link href="/dashboard/management/pricing/rules">
                <Button type="button" variant="secondary" disabled={loading}>
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                variant="primary"
                disabled={loading}
              >
                {loading ? 'Updating Rule...' : 'Update Rule'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
