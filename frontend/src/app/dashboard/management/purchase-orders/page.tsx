'use client';

import { usePurchaseOrders } from '@/hooks/week8/usePurchaseOrders';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import Link from 'next/link';

const statusColors = {
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-yellow-100 text-yellow-800',
  received: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const statusLabels = {
  draft: 'Draft',
  sent: 'Sent',
  confirmed: 'Confirmed',
  received: 'Received',
  cancelled: 'Cancelled'
};

export default function PurchaseOrdersPage() {
  const { orders, loading, error, refetch } = usePurchaseOrders();
  const { format } = useCurrency();

  if (loading) return <Loading />;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  // Safe check for orders data
  const displayOrders = Array.isArray(orders) ? orders : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-gray-600">Manage your supplier orders</p>
        </div>
        <div className="flex space-x-4">
          <Link href="/dashboard/management/purchase-orders/new">
            <Button variant="primary">Create Purchase Order</Button>
          </Link>
          <Button variant="outline" onClick={refetch}>
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-6">
          {displayOrders.length > 0 ? (
            <div className="space-y-4">
              {displayOrders.map(order => (
                <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="font-semibold text-lg">Order #{order.order_number}</h3>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                          {statusLabels[order.status]}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>Supplier: {order.supplier_name}</div>
                        <div>Order Date: {new Date(order.order_date).toLocaleDateString()}</div>
                        <div>Expected Delivery: {new Date(order.expected_delivery).toLocaleDateString()}</div>
                        <div>Items: {order.items?.length || 0} products</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">{format(order.total_amount)}</div>
                      <Link href={`/dashboard/management/purchase-orders/${order.id}`}>
                        <Button variant="outline" size="sm" className="mt-2">
                          View Details
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📋</div>
              <p>No purchase orders found</p>
              <p className="text-sm mt-2">Create your first purchase order to get started.</p>
              <div className="flex space-x-4 justify-center mt-4">
                <Link href="/dashboard/management/purchase-orders/new">
                  <Button variant="primary">
                    Create Purchase Order
                  </Button>
                </Link>
                <Link href="/dashboard/management/suppliers">
                  <Button variant="outline">
                    Manage Suppliers
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
