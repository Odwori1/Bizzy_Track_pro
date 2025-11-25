'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useInventory } from '@/hooks/week7/useInventory';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FilterBar } from '@/components/ui/week7/FilterBar';
import { Loading } from '@/components/ui/Loading';

export default function InventoryItemsPage() {
  const { 
    items, 
    categories, 
    loading, 
    error, 
    filters,
    setFilters,
    fetchItems,
    fetchCategories 
  } = useInventory();

  useEffect(() => {
    fetchItems();
    fetchCategories();
  }, [fetchItems, fetchCategories]);

  const handleSearch = (searchTerm: string) => {
    setFilters({ ...filters, search: searchTerm });
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters({ ...filters, ...newFilters });
  };

  if (loading && items.length === 0) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Items</h1>
          <p className="text-gray-600">Manage your business inventory items</p>
        </div>
        <Link href="/dashboard/management/inventory/items/new">
          <Button variant="primary">Add New Item</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Filters */}
      <FilterBar
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        filters={filters}
        filterOptions={{
          categories: categories
        }}
        placeholder="Search items by name, SKU..."
      />

      {/* Items List */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              All Items ({items.length})
            </h2>
          </div>

          {items.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-lg mb-2">No items found</div>
              <p className="text-gray-600 mb-4">
                {filters.search ? 'Try adjusting your search terms' : 'Get started by adding your first inventory item'}
              </p>
              {!filters.search && (
                <Link href="/dashboard/management/inventory/items/new">
                  <Button variant="primary">Add Your First Item</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4 flex-1">
                    <div className={`w-3 h-3 rounded-full ${
                      item.current_stock === 0 ? 'bg-red-500' :
                      item.current_stock <= item.min_stock_level ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`} />
                    <div className="flex-1">
                      <Link href={`/dashboard/management/inventory/items/${item.id}`}>
                        <div className="font-medium hover:text-blue-600 cursor-pointer">
                          {item.name}
                        </div>
                      </Link>
                      <div className="text-sm text-gray-600">
                        SKU: {item.sku} • Category: {item.category_name || 'Uncategorized'}
                      </div>
                      <div className="flex space-x-2 mt-1">
                        <span className="text-xs text-gray-500">
                          Stock: {item.current_stock} {item.unit_of_measure}
                        </span>
                        <span className="text-xs text-gray-500">
                          Cost: ${item.cost_price}
                        </span>
                        <span className="text-xs text-gray-500">
                          Price: ${item.selling_price}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      ${(item.current_stock * item.cost_price).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">
                      Stock Value
                    </div>
                    <div className="flex space-x-2 mt-2">
                      <Link href={`/dashboard/management/inventory/items/${item.id}`}>
                        <Button variant="secondary" size="sm">
                          View
                        </Button>
                      </Link>
                      <Link href={`/dashboard/management/inventory/items/${item.id}/edit`}>
                        <Button variant="secondary" size="sm">
                          Edit
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
