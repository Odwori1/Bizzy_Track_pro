'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useInventory } from '@/hooks/week7/useInventory';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

export default function InventoryItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getItemById, loading } = useInventory();

  const itemId = params.id as string;
  const item = getItemById(itemId);

  useEffect(() => {
    if (!item) {
      console.log('Item not found, would fetch here');
    }
  }, [item, itemId]);

  if (loading) return <Loading />;
  if (!item) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">Item not found</div>
        <Button onClick={() => router.back()} className="mt-2">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
          <p className="text-gray-600">Inventory item details</p>
        </div>
        <div className="flex space-x-3">
          <Link href={`/dashboard/management/inventory/items/${item.id}/edit`}>
            <Button variant="outline">Edit Item</Button>
          </Link>
          <Button onClick={() => router.back()} variant="outline">
            Back to List
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Item Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">SKU</label>
                  <div className="text-sm text-gray-900 mt-1">{item.sku || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Category</label>
                  <div className="text-sm text-gray-900 mt-1">{item.category_name || 'Uncategorized'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <div className="text-sm text-gray-900 mt-1">{item.description || 'No description'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Unit</label>
                  <div className="text-sm text-gray-900 mt-1">{item.unit || 'N/A'}</div>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Current Stock</label>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{item.current_stock}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Min Stock Level</label>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{item.min_stock_level}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    {item.current_stock === 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Out of Stock
                      </span>
                    ) : item.current_stock <= item.min_stock_level ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        Low Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        In Stock
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Cost Price</label>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    ${Number(item.cost_price)?.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Selling Price</label>
                  <div className="text-lg font-bold text-green-600 mt-1">
                    ${Number(item.selling_price)?.toFixed(2)}
                  </div>
                </div>
                {item.cost_price && item.selling_price && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Profit Margin</label>
                    <div className="text-lg font-bold text-blue-600 mt-1">
                      {(Number(item.selling_price) - Number(item.cost_price)).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  📦 Update Stock
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  📊 View History
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  🔔 Set Alert
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

