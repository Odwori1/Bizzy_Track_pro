'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInventory } from '@/hooks/week7/useInventory';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/ui/week7/FilterBar';

export function InventoryTable() {
  const { items, loading, filters, setFilters } = useInventory();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const handleSearch = (search: string) => {
    setFilters({ ...filters, search });
  };

  const handleCategoryFilter = (categoryId: string) => {
    setFilters({ ...filters, category_id: categoryId || undefined });
  };

  if (loading) {
    return <div className="text-center py-4">Loading inventory items...</div>;
  }

  return (
    <div className="space-y-4">
      <FilterBar
        onSearch={handleSearch}
        onFilterChange={handleCategoryFilter}
        searchPlaceholder="Search items..."
        filterOptions={[]} // You can add category filters here
      />

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      {item.description && (
                        <div className="text-sm text-gray-500">{item.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.sku || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.category_name || 'Uncategorized'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{item.current_stock} {item.unit}</div>
                    {item.current_stock <= item.min_stock_level && (
                      <div className="text-xs text-red-600">Low Stock</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${item.selling_price?.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link href={`/dashboard/management/inventory/items/${item.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <div className="text-center py-8">
            <div className="text-gray-500">No inventory items found</div>
            <Link href="/dashboard/management/inventory/items/new">
              <Button variant="primary" className="mt-2">
                Add Your First Item
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
