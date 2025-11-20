'use client';

import { useState, useEffect } from 'react';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PriceHistory } from '@/types/pricing';

export default function PriceHistoryPage() {
  const { getPriceHistory, getPricingStats } = usePricing();
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [historyData, statsData] = await Promise.all([
        getPriceHistory(),
        getPricingStats()
      ]);
      setHistory(historyData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading price history:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading price history...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Price History & Analytics</h1>
        <p className="text-gray-600">Track price changes and view pricing analytics</p>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <h3 className="text-sm font-medium text-gray-600">Total Price Changes</h3>
            <p className="text-2xl font-bold mt-2">{stats.total_changes}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-medium text-gray-600">Active Pricing Rules</h3>
            <p className="text-2xl font-bold mt-2">{stats.active_rules}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-medium text-gray-600">Seasonal Rules</h3>
            <p className="text-2xl font-bold mt-2">{stats.seasonal_rules}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-medium text-gray-600">Avg. Price Change</h3>
            <p className="text-2xl font-bold mt-2">{stats.avg_change}%</p>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex gap-4">
          <Input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
            placeholder="Start Date"
          />
          <Input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
            placeholder="End Date"
          />
          <select className="border rounded-md px-3 py-2">
            <option value="">All Entity Types</option>
            <option value="service">Service</option>
            <option value="customer_category">Customer Category</option>
          </select>
          <Button variant="outline">
            Apply Filters
          </Button>
          <Button variant="outline">
            Export Data
          </Button>
        </div>
      </Card>

      {/* Price History List */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Price Change History</h2>
        <div className="space-y-4">
          {history.map((item) => (
            <div key={item.id} className="flex justify-between items-center py-3 border-b">
              <div>
                <h4 className="font-medium">{item.entity_type}: {item.entity_name}</h4>
                <p className="text-sm text-gray-600">
                  Changed from ${item.old_price} to ${item.new_price}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Reason: {item.change_reason} • {new Date(item.changed_at).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  item.new_price > item.old_price 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {item.new_price > item.old_price ? 'Increase' : 'Decrease'}
                </span>
                <p className="text-sm text-gray-600 mt-1">
                  {Math.abs(((item.new_price - item.old_price) / item.old_price) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>

        {history.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No price history found</p>
          </div>
        )}
      </Card>
    </div>
  );
}
