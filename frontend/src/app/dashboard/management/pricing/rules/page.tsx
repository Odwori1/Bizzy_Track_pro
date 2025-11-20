'use client';

import { useState, useEffect } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PricingRule } from '@/types/pricing';

export default function PricingRulesPage() {
  const { getPricingRules, createPricingRule, updatePricingRule, deletePricingRule } = usePricing();
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const data = await getPricingRules();
      setRules(data);
    } catch (error) {
      console.error('Error loading pricing rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredRules = rules.filter(rule =>
    rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rule.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="flex justify-center p-8">Loading pricing rules...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Rules</h1>
          <p className="text-gray-600">Manage dynamic pricing rules and discounts</p>
        </div>
        <Button onClick={() => {/* Open create modal */}}>
          Create Rule
        </Button>
      </div>

      {/* Search and Filters */}
      <Card className="p-4 mb-6">
        <div className="flex gap-4">
          <Input
            placeholder="Search rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <select className="border rounded-md px-3 py-2">
            <option value="">All Rule Types</option>
            <option value="customer_category">Customer Category</option>
            <option value="quantity_tier">Quantity Tier</option>
            <option value="time_based">Time Based</option>
          </select>
          <select className="border rounded-md px-3 py-2">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {/* Rules List */}
      <div className="grid gap-4">
        {filteredRules.map((rule) => (
          <Card key={rule.id} className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{rule.name}</h3>
                <p className="text-gray-600 text-sm mt-1">{rule.description}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className={`px-2 py-1 rounded-full ${
                    rule.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-gray-600">Type: {rule.rule_type}</span>
                  <span className="text-gray-600">Priority: {rule.priority}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => deletePricingRule(rule.id)}>
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredRules.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No pricing rules found</p>
        </Card>
      )}
    </div>
  );
}
