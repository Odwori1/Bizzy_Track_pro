'use client';

import { useState } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

export default function PricingEvaluationPage() {
  const { evaluatePricingWithABAC } = usePricing();
  const [evaluationData, setEvaluationData] = useState({
    customer_category_id: '',
    service_id: '',
    base_price: '',
    quantity: '1'
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleEvaluate = async () => {
    if (!evaluationData.customer_category_id || !evaluationData.service_id || !evaluationData.base_price) {
      return;
    }

    setLoading(true);
    try {
      const evaluationResult = await evaluatePricingWithABAC({
        customer_category_id: evaluationData.customer_category_id,
        service_id: evaluationData.service_id,
        base_price: parseFloat(evaluationData.base_price),
        quantity: parseInt(evaluationData.quantity)
      });
      setResult(evaluationResult);
    } catch (error) {
      console.error('Error evaluating pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pricing Evaluation Tool</h1>
        <p className="text-gray-600">Test how pricing rules apply to specific scenarios</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Evaluation Parameters</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Category
              </label>
              <select 
                value={evaluationData.customer_category_id}
                onChange={(e) => setEvaluationData(prev => ({
                  ...prev, 
                  customer_category_id: e.target.value
                }))}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">Select Customer Category</option>
                {/* Options will be populated from API */}
                <option value="7c1b1017-c8a7-4471-bb8d-cfd137d19fe5">VIP Customers</option>
                <option value="another-uuid">Regular Customers</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Service
              </label>
              <select 
                value={evaluationData.service_id}
                onChange={(e) => setEvaluationData(prev => ({
                  ...prev, 
                  service_id: e.target.value
                }))}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="">Select Service</option>
                {/* Options will be populated from API */}
                <option value="65a69ec1-3fe9-4ee3-b715-e5fb41b174c3">Family Photography</option>
                <option value="another-service-uuid">Portrait Session</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Base Price ($)
              </label>
              <Input
                type="number"
                value={evaluationData.base_price}
                onChange={(e) => setEvaluationData(prev => ({
                  ...prev, 
                  base_price: e.target.value
                }))}
                placeholder="Enter base price"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity
              </label>
              <Input
                type="number"
                value={evaluationData.quantity}
                onChange={(e) => setEvaluationData(prev => ({
                  ...prev, 
                  quantity: e.target.value
                }))}
                placeholder="Enter quantity"
                min="1"
              />
            </div>

            <Button onClick={handleEvaluate} disabled={loading} className="w-full">
              {loading ? 'Evaluating...' : 'Evaluate Pricing'}
            </Button>
          </div>
        </Card>

        {/* Results Panel */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Evaluation Results</h2>
          
          {result ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800">Final Price: ${result.final_price}</h3>
                <p className="text-green-700 text-sm mt-1">
                  Original: ${result.original_price} • Savings: ${result.total_discount}
                </p>
              </div>

              {result.applied_rules && result.applied_rules.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Applied Rules:</h4>
                  <div className="space-y-2">
                    {result.applied_rules.map((rule: any, index: number) => (
                      <div key={index} className="bg-blue-50 border border-blue-200 rounded p-3">
                        <p className="font-medium text-blue-800">{rule.name}</p>
                        <p className="text-blue-700 text-sm">{rule.description}</p>
                        <p className="text-blue-600 text-xs mt-1">
                          Discount: {rule.adjustment_value}{rule.adjustment_type === 'percentage' ? '%' : '$'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.abac_context && (
                <div>
                  <h4 className="font-medium mb-2">ABAC Security Context:</h4>
                  <div className="bg-gray-50 border border-gray-200 rounded p-3">
                    <pre className="text-xs text-gray-700">
                      {JSON.stringify(result.abac_context, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">
                Enter parameters and click "Evaluate Pricing" to see results
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
