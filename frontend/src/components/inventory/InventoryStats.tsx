'use client';

import { Card } from '@/components/ui/Card';
import { InventoryStats as InventoryStatsType } from '@/types/week7';
import { useCurrency } from '@/lib/currency';  // ✅ CORRECT IMPORT

interface InventoryStatsProps {
  stats: InventoryStatsType;
  loading?: boolean;
}

export function InventoryStats({ stats, loading = false }: InventoryStatsProps) {
  const { format } = useCurrency();  // ✅ CORRECT HOOK USAGE

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <div className="p-6">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-2 animate-pulse"></div>
              <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Items</h3>
          <div className="text-2xl font-bold mt-2">{stats.total_items}</div>
          <p className="text-sm text-gray-600">All inventory items</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Low Stock</h3>
          <div className="text-2xl font-bold text-yellow-600 mt-2">{stats.low_stock_items}</div>
          <p className="text-sm text-gray-600">Need restocking</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Out of Stock</h3>
          <div className="text-2xl font-bold text-red-600 mt-2">{stats.out_of_stock_items}</div>
          <p className="text-sm text-gray-600">Urgent attention needed</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Value</h3>
          <div className="text-2xl font-bold text-green-600 mt-2">
            {format(stats.total_inventory_value || 0)}  {/* ✅ CORRECT CURRENCY USAGE */}
          </div>
          <p className="text-sm text-gray-600">Inventory worth</p>
        </div>
      </Card>
    </div>
  );
}
