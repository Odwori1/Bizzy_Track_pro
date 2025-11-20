'use client';

import { useState, useEffect } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SeasonalPricing } from '@/types/pricing';

export default function SeasonalPricingPage() {
  const { getSeasonalPricing, createSeasonalPricing } = usePricing();
  const [seasonalPricing, setSeasonalPricing] = useState<SeasonalPricing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSeasonalPricing();
  }, []);

  const loadSeasonalPricing = async () => {
    try {
      const data = await getSeasonalPricing();
      setSeasonalPricing(data);
    } catch (error) {
      console.error('Error loading seasonal pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading seasonal pricing...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seasonal Pricing</h1>
          <p className="text-gray-600">Manage date-based pricing adjustments</p>
        </div>
        <Button onClick={() => {/* Open create modal */}}>
          Create Seasonal Pricing
        </Button>
      </div>

      {/* Calendar View Placeholder */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Calendar Overview</h2>
        <div className="bg-gray-100 rounded-lg p-8 text-center">
          <p className="text-gray-500">Calendar view will be implemented here</p>
        </div>
      </Card>

      {/* Seasonal Pricing List */}
      <div className="grid gap-4">
        {seasonalPricing.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{item.name}</h3>
                <p className="text-gray-600 text-sm mt-1">{item.description}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span className="text-gray-600">
                    {new Date(item.start_date).toLocaleDateString()} - {new Date(item.end_date).toLocaleDateString()}
                  </span>
                  <span className="text-gray-600">
                    Adjustment: {item.adjustment_value}{item.adjustment_type === 'percentage' ? '%' : '$'}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${
                    item.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Edit
                </Button>
                <Button variant="outline" size="sm">
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {seasonalPricing.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No seasonal pricing rules found</p>
        </Card>
      )}
    </div>
  );
}
