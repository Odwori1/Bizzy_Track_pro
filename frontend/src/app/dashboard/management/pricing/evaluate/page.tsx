'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePricingActions } from '@/hooks/usePricing';
import { apiClient } from '@/lib/api';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency'; // ADDED IMPORT

interface CustomerCategory {
  id: string;
  name: string;
}

interface Service {
  id: string;
  name: string;
  base_price: string;
}

interface EvaluationResult {
  original_price: number;
  final_price: number;
  base_price_after_abac: number;
  total_amount: number;
  adjustments: Array<{
    type: string;
    rule_name?: string;
    adjustment_type?: string;
    value?: number;
    amount?: number;
  }>;
  applied_rules: Array<{
    rule_id: string;
    rule_name: string;
    rule_type: string;
    adjustment_type: string;
    adjustment_value: number;
    new_price: number;
  }>;
  abac_context: {
    can_override: boolean;
    user_restrictions: boolean;
    user_discount_limit: number;
    abac_failed: boolean;
  };
  summary: {
    total_discount: number;
    total_discount_percentage: number;
    requires_approval: any;
  };
}

export default function PricingEvaluationPage() {
  const [customerCategories, setCustomerCategories] = useState<CustomerCategory[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { formatCurrency, currencySymbol } = useBusinessCurrency(); // ADDED HOOK

  const { evaluatePricingWithABAC } = usePricingActions();

  // Load customer categories and services from real API
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('🔄 Loading evaluation data from API...');

        // Load customer categories
        const categoriesResponse = await apiClient.get('/customer-categories');
        console.log('📊 Customer categories response:', categoriesResponse);

        const categories = Array.isArray(categoriesResponse) ? categoriesResponse :
                          (categoriesResponse.data && Array.isArray(categoriesResponse.data)) ? categoriesResponse.data : [];
        setCustomerCategories(categories);

        // Load services
        const servicesResponse = await apiClient.get('/services');
        console.log('📊 Services response:', servicesResponse);

        const services = Array.isArray(servicesResponse) ? servicesResponse :
                        (servicesResponse.data && Array.isArray(servicesResponse.data)) ? servicesResponse.data : [];
        setServices(services);

        console.log(`✅ Loaded ${categories.length} categories and ${services.length} services`);
      } catch (err) {
        console.error('❌ Failed to load evaluation data:', err);
        setError('Failed to load customer categories and services');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Auto-fill base price when service is selected
  useEffect(() => {
    if (selectedService) {
      const service = services.find(s => s.id === selectedService);
      if (service) {
        setBasePrice(service.base_price);
      }
    }
  }, [selectedService, services]);

  const handleEvaluate = async () => {
    if (!selectedCategory || !selectedService || !basePrice) {
      setError('Please fill in all required fields');
      return;
    }

    setEvaluating(true);
    setError(null);

    try {
      console.log('🔄 Evaluating pricing with ABAC:', {
        customer_category_id: selectedCategory,
        service_id: selectedService,
        base_price: parseFloat(basePrice),
        quantity: parseInt(quantity) || 1
      });

      const result = await evaluatePricingWithABAC({
        customer_category_id: selectedCategory,
        service_id: selectedService,
        base_price: parseFloat(basePrice),
        quantity: parseInt(quantity) || 1
      });

      console.log('📊 Evaluation API result:', result);

      if (result.success && result.data) {
        setEvaluationResult(result.data);
        console.log('✅ Evaluation result received:', result.data);
      } else {
        console.error('❌ Evaluation failed:', result.error);
        setError(result.error || 'Failed to evaluate pricing');
      }
    } catch (err) {
      console.error('❌ Evaluation error:', err);
      setError('Failed to evaluate pricing. Please check console for details.');
    } finally {
      setEvaluating(false);
    }
  };

  // REMOVED: Hardcoded formatCurrency function

  const formatPercentage = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '0.0%';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-gray-500">Loading evaluation tool...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pricing Evaluation Tool</h1>
        <p className="text-gray-600">Test how pricing rules and ABAC security apply to specific scenarios</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm font-medium">Error</div>
          <div className="text-red-700 text-sm mt-1">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Evaluation Parameters */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Evaluation Parameters</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Category *
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={evaluating}
              >
                <option value="">Select Customer Category</option>
                {customerCategories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Service *
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={evaluating}
              >
                <option value="">Select Service</option>
                {services.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({formatCurrency(parseFloat(service.base_price))}) {/* FIXED: Dynamic currency */}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base Price ({currencySymbol}) * {/* FIXED: Dynamic currency symbol */}
              </label>
              <Input
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="100.00"
                step="0.01"
                disabled={evaluating}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity
              </label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                min="1"
                disabled={evaluating}
                className="w-full"
              />
            </div>

            <Button
              onClick={handleEvaluate}
              disabled={evaluating || !selectedCategory || !selectedService || !basePrice}
              className="w-full"
            >
              {evaluating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Evaluating with ABAC...
                </span>
              ) : (
                'Evaluate Pricing with ABAC'
              )}
            </Button>
          </div>
        </Card>

        {/* Evaluation Results */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Evaluation Results</h2>

            {!evaluationResult ? (
              <div className="text-center p-8 text-gray-500">
                <p>Enter parameters and click "Evaluate Pricing" to see results</p>
                <p className="text-sm text-gray-400 mt-1">
                  This tests both pricing rules and ABAC security restrictions
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Price Summary */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-3">Price Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Original Price:</span>
                      <div className="font-medium text-lg">{formatCurrency(evaluationResult.original_price)}</div> {/* FIXED: Dynamic currency */}
                    </div>
                    <div>
                      <span className="text-gray-600">Final Price:</span>
                      <div className="font-medium text-lg text-green-600">{formatCurrency(evaluationResult.final_price)}</div> {/* FIXED: Dynamic currency */}
                    </div>
                    <div>
                      <span className="text-gray-600">Total Discount:</span>
                      <div className="font-medium text-red-600">
                        {formatCurrency(evaluationResult.summary.total_discount)} {/* FIXED: Dynamic currency */}
                        <span className="text-xs ml-1">({formatPercentage(evaluationResult.summary.total_discount_percentage)})</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Amount:</span>
                      <div className="font-medium text-lg">{formatCurrency(evaluationResult.total_amount)}</div> {/* FIXED: Dynamic currency */}
                    </div>
                  </div>
                </div>

                {/* Applied Rules */}
                {evaluationResult.applied_rules && evaluationResult.applied_rules.length > 0 ? (
                  <div>
                    <h3 className="font-medium mb-2">Applied Pricing Rules</h3>
                    <div className="space-y-2">
                      {evaluationResult.applied_rules.map((rule, index) => (
                        <div key={rule.rule_id || index} className="flex justify-between items-center p-3 border border-gray-200 rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{rule.rule_name}</div>
                            <div className="text-sm text-gray-600">
                              {rule.rule_type} • {rule.adjustment_type} • {rule.adjustment_value}
                              {rule.adjustment_type === 'percentage' ? '%' : currencySymbol} {/* FIXED: Dynamic currency symbol */}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-green-600">
                            {formatCurrency(rule.new_price)} {/* FIXED: Dynamic currency */}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">No pricing rules applied to this scenario</p>
                  </div>
                )}

                {/* ABAC Security Context */}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-medium mb-2">ABAC Security Context</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">User Discount Limit:</span>
                      <div className="font-medium">{evaluationResult.abac_context.user_discount_limit}%</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Can Override:</span>
                      <div className="font-medium">{evaluationResult.abac_context.can_override ? 'Yes' : 'No'}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Approval Required:</span>
                      <div className="font-medium">
                        {evaluationResult.summary.requires_approval?.requires_approval ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-600">User Restrictions:</span>
                      <div className="font-medium">{evaluationResult.abac_context.user_restrictions ? 'Active' : 'None'}</div>
                    </div>
                  </div>
                  {evaluationResult.abac_context.abac_failed && (
                    <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded">
                      <p className="text-xs text-red-700">ABAC evaluation partially failed, using fallback values</p>
                    </div>
                  )}
                </div>

                {/* Adjustments */}
                {evaluationResult.adjustments && evaluationResult.adjustments.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Price Adjustments</h3>
                    <div className="space-y-2">
                      {evaluationResult.adjustments.map((adjustment, index) => (
                        <div key={index} className="flex justify-between items-center p-2 border border-gray-200 rounded">
                          <div className="flex-1">
                            <div className="text-sm font-medium">{adjustment.rule_name || adjustment.type}</div>
                            <div className="text-xs text-gray-600">
                              {adjustment.adjustment_type} • {adjustment.value}
                              {adjustment.adjustment_type === 'percentage' ? '%' : currencySymbol} {/* FIXED: Dynamic currency symbol */}
                            </div>
                          </div>
                          <div className={`text-sm font-medium ${(adjustment.amount || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(adjustment.amount)} {/* FIXED: Dynamic currency */}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
