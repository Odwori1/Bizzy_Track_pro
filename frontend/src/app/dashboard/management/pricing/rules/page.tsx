'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePricing, usePricingActions } from '@/hooks/usePricing';

export default function PricingRulesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const { pricingRules, loading, error, refetch } = usePricing();
  const { deletePricingRule } = usePricingActions();

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (confirm(`Are you sure you want to delete the rule "${ruleName}"?`)) {
      const result = await deletePricingRule(ruleId);
      if (result.success) {
        refetch();
      } else {
        alert(result.error);
      }
    }
  };

  const filteredRules = pricingRules.filter(rule =>
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
        <Link href="/dashboard/management/pricing/rules/new">
          <Button>
            Create Rule
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={refetch} className="mt-2">
            Retry
          </Button>
        </div>
      )}

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
                <Link href={`/dashboard/management/pricing/rules/${rule.id}/edit`}>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDeleteRule(rule.id, rule.name)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredRules.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No pricing rules found</p>
          <Link href="/dashboard/management/pricing/rules/new">
            <Button className="mt-4">
              Create Your First Rule
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
