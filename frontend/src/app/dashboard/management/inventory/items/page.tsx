'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInventory } from '@/hooks/week7/useInventory';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input'; // ADD: Import Input component
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

  // ADD: search state for client-side filtering
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchItems();
    fetchCategories();
  }, [fetchItems, fetchCategories]);

  // CHANGE: Client-side search only
  const handleSearch = (searchTerm: string) => {
    setSearchTerm(searchTerm);
  };

  const handleFilterChange = (newFilters: any) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    fetchItems(updatedFilters); // Keep backend filtering for other filters
  };

  // ADD: Client-side search filtering
  const filteredItems = items.filter(item => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      (item.name?.toLowerCase() || '').includes(searchLower) ||
      (item.sku?.toLowerCase() || '').includes(searchLower) ||
      (item.description?.toLowerCase() || '').includes(searchLower) ||
      (item.category_name?.toLowerCase() || '').includes(searchLower)
    );
  });

  // ADD: Handle search form submit (like jobs page)
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Client-side search is already handled by filteredItems
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

      {/* REMOVED: Separate FilterBar component */}

      {/* Items List - USE filteredItems INSTEAD OF items */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {filters.category_id ? 'Filtered Items' : 'All Items'} ({filteredItems.length})
              {loading && <span className="text-sm text-gray-500 ml-2">Loading...</span>}
            </h2>
            
            {/* ADD: Search and filters in header like jobs page */}
            <div className="flex space-x-2">
              {/* Category Filter */}
              <select
                className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.category_id || 'all'}
                onChange={(e) => handleFilterChange({ 
                  category_id: e.target.value === 'all' ? undefined : e.target.value 
                })}
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              
              {/* Search Input - like jobs page */}
              <form onSubmit={handleSearchSubmit} className="flex">
                <Input
                  type="text"
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-sm w-48"
                />
              </form>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 text-lg mb-2">No items found</div>
              <p className="text-gray-600 mb-4">
                {searchTerm || filters.category_id ? 'Try adjusting your search or filter terms' : 'Get started by adding your first inventory item'}
              </p>
              {!searchTerm && !filters.category_id && (
                <Link href="/dashboard/management/inventory/items/new">
                  <Button variant="primary">Add Your First Item</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((item) => (
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
                          Cost: ${Number(item.cost_price)?.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-500">
                          Price: ${Number(item.selling_price)?.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      ${(Number(item.current_stock) * Number(item.cost_price)).toLocaleString()}
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
