'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePricing, usePricingActions } from '@/hooks/usePricing';
import SeasonalCalendar from '@/components/pricing/SeasonalCalendar';

export default function SeasonalPricingPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { seasonalPricing, loading, error, refetch } = usePricing();
  const { deleteSeasonalPricing } = usePricingActions();

  // Date formatting function for backend date objects
  const formatSeasonalDate = (dateObj: any) => {
    if (!dateObj) return 'Invalid Date';
    
    // Backend returns date as object with multiple formats
    // Try different properties in order of preference
    if (dateObj.iso_local) {
      return new Date(dateObj.iso_local).toLocaleDateString();
    } else if (dateObj.utc) {
      return new Date(dateObj.utc).toLocaleDateString();
    } else if (dateObj.local) {
      // Parse the "12/19/2025, 23:00:00" format
      const datePart = dateObj.local.split(',')[0];
      return new Date(datePart).toLocaleDateString();
    } else if (dateObj.formatted) {
      // Use the formatted date directly
      return dateObj.formatted.split(',')[0]; // Get "Fri, Dec 19, 2025" part
    } else if (dateObj.timestamp) {
      return new Date(dateObj.timestamp).toLocaleDateString();
    } else if (typeof dateObj === 'string') {
      return new Date(dateObj).toLocaleDateString();
    }
    
    return 'Invalid Date';
  };

  const handleDeleteSeasonalPricing = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete the seasonal pricing "${name}"?`)) {
      try {
        await deleteSeasonalPricing(id);
        refetch();
      } catch (err) {
        alert(`Failed to delete seasonal pricing: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  };

  const filteredPricing = seasonalPricing.filter(item =>
    (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (statusFilter === '' ||
     (statusFilter === 'active' && item.is_active) ||
     (statusFilter === 'inactive' && !item.is_active))
  );

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
        <Link href="/dashboard/management/pricing/seasonal/new">
          <Button>
            Create Seasonal Pricing
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

      {/* Calendar View */}
      <SeasonalCalendar seasonalPricing={seasonalPricing} />

      {/* Search and Filters */}
      <Card className="p-4 mb-6">
        <div className="flex gap-4">
          <Input
            placeholder="Search seasonal pricing..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      {/* Seasonal Pricing List */}
      <div className="grid gap-4">
        {filteredPricing.map((item) => (
          <Card key={item.id} className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{item.name}</h3>
                <p className="text-gray-600 text-sm mt-1">{item.description}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm">
                  <span className="text-gray-600">
                    📅 {formatSeasonalDate(item.start_date)} - {formatSeasonalDate(item.end_date)}
                  </span>
                  <span className="text-gray-600">
                    💰 Adjustment: {item.adjustment_value}{item.adjustment_type === 'percentage' ? '%' : '$'}
                  </span>
                  <span className="text-gray-600">
                    🎯 Target: {item.target_type.replace('_', ' ')}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    item.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <Link href={`/dashboard/management/pricing/seasonal/${item.id}/edit`}>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteSeasonalPricing(item.id, item.name)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredPricing.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No seasonal pricing rules found</p>
          <Link href="/dashboard/management/pricing/seasonal/new">
            <Button className="mt-4">
              Create Your First Seasonal Pricing
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
