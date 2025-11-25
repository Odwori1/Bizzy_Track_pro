'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useInventoryStore } from '@/store/week7';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

export default function InventoryPage() {
  const { stats, loading, error, fetchStats } = useInventoryStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading && !stats) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600">Track and manage your business inventory</p>
        </div>
        <div className="flex space-x-4">
          <Link href="/dashboard/management/inventory/items/new">
            <Button variant="primary">Add New Item</Button>
          </Link>
          <Link href="/dashboard/management/inventory/categories">
            <Button variant="outline">Manage Categories</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Quick Stats */}
      {stats && (
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
                ${stats.total_inventory_value?.toLocaleString() || '0'}
              </div>
              <p className="text-sm text-gray-600">Inventory worth</p>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/dashboard/management/inventory/items">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">📦</div>
              <h3 className="font-semibold text-gray-900">View All Items</h3>
              <p className="text-gray-600 text-sm">Browse and manage inventory</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/inventory/items?low_stock=true">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">⚠️</div>
              <h3 className="font-semibold text-gray-900">Low Stock Alerts</h3>
              <p className="text-gray-600 text-sm">Items needing restock</p>
            </div>
          </Card>
        </Link>

        <Card className="cursor-pointer hover:shadow-md transition-shadow bg-gray-50">
          <div className="p-6 text-center">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="font-semibold text-gray-900">Inventory Analytics</h3>
            <p className="text-gray-600 text-sm">Coming Soon</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
