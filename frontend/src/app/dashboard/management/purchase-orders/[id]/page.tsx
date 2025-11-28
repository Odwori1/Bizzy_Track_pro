'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface PurchaseOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: string;
  total_cost: string;
  received_quantity: number;
}

interface PurchaseOrder {
  id: string;
  supplier_id: string;
  po_number: string;
  status: string;
  order_date: any;
  expected_delivery_date: any;
  total_amount: string;
  notes: string;
  created_at: any;
  supplier_name: string;
  supplier_contact: string;
  supplier_email: string;
  supplier_phone: string;
  items: PurchaseOrderItem[];
}

export default function PurchaseOrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { format } = useCurrency();
  const purchaseOrderId = params.id as string;

  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPurchaseOrderData = async () => {
      try {
        setLoading(true);
        const orderData = await apiClient.get<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`);
        setPurchaseOrder(orderData);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch purchase order details');
      } finally {
        setLoading(false);
      }
    };

    if (purchaseOrderId) {
      fetchPurchaseOrderData();
    }
  }, [purchaseOrderId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'received': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-yellow-100 text-yellow-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Draft';
      case 'sent': return 'Sent to Supplier';
      case 'confirmed': return 'Confirmed';
      case 'received': return 'Received';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading purchase order details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-600">Purchase order not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{purchaseOrder.po_number}</h1>
          <p className="text-gray-600">Purchase Order Details</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/management/purchase-orders')}
          >
            Back to Orders
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push(`/dashboard/management/purchase-orders/${purchaseOrderId}/edit`)}
          >
            Edit Order
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Information Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Supplier</label>
                <p className="mt-1 text-sm text-gray-900">{purchaseOrder.supplier_name}</p>
                <p className="text-sm text-gray-500">{purchaseOrder.supplier_contact}</p>
                <p className="text-sm text-gray-500">{purchaseOrder.supplier_email}</p>
                <p className="text-sm text-gray-500">{purchaseOrder.supplier_phone}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Order Date</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(purchaseOrder.order_date)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Expected Delivery</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(purchaseOrder.expected_delivery_date)}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(purchaseOrder.status)}`}>
                    {getStatusText(purchaseOrder.status)}
                  </span>
                </div>
              </div>
              {purchaseOrder.notes && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Notes</label>
                  <p className="mt-1 text-sm text-gray-900">{purchaseOrder.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Items Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Items</h2>
            
            {purchaseOrder.items.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No items found in this purchase order.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit Cost
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Cost
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Received
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.product_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(item.unit_cost)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(item.total_cost)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.received_quantity} / {item.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                        Total Amount:
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {format(purchaseOrder.total_amount)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Order Summary Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Items</span>
                <span className="text-sm text-gray-900">{purchaseOrder.items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Value</span>
                <span className="text-sm font-medium text-gray-900">{format(purchaseOrder.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Created</span>
                <span className="text-sm text-gray-900">{formatDate(purchaseOrder.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Actions Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-2">
              {purchaseOrder.status === 'draft' && (
                <Button variant="primary" className="w-full">
                  Send to Supplier
                </Button>
              )}
              {purchaseOrder.status === 'sent' && (
                <Button variant="primary" className="w-full">
                  Mark as Confirmed
                </Button>
              )}
              {purchaseOrder.status === 'confirmed' && (
                <Button variant="primary" className="w-full">
                  Receive Items
                </Button>
              )}
              <Button variant="outline" className="w-full">
                Print Order
              </Button>
              {purchaseOrder.status === 'draft' && (
                <Button variant="danger" className="w-full">
                  Cancel Order
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
