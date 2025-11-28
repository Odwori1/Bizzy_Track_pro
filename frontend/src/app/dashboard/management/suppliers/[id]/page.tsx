'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string | null;
  tax_id: string | null;
  payment_terms: string;
  rating: number;
  performance_metrics: any;
  is_active: boolean;
  created_at: {
    utc: string;
    local: string;
    formatted: string;
  };
  total_purchase_orders: string;
  completed_orders: string;
  pending_orders: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: string;
  order_date: {
    formatted: string;
  };
  total_amount: string;
  item_count: string;
}

export default function SupplierDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { format } = useCurrency();
  const supplierId = params.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSupplierData = async () => {
      try {
        setLoading(true);
        
        // Fetch supplier details
        const supplierData = await apiClient.get<Supplier>(`/suppliers/${supplierId}`);
        setSupplier(supplierData);

        // Fetch supplier's purchase orders
        const ordersData = await apiClient.get<PurchaseOrder[]>(`/purchase-orders?supplier_id=${supplierId}`);
        setPurchaseOrders(ordersData);

      } catch (err: any) {
        setError(err.message || 'Failed to fetch supplier details');
      } finally {
        setLoading(false);
      }
    };

    if (supplierId) {
      fetchSupplierData();
    }
  }, [supplierId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'confirmed': return 'bg-yellow-100 text-yellow-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading supplier details...</div>
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

  if (!supplier) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-600">Supplier not found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
          <p className="text-gray-600">Supplier Details</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/management/suppliers')}
        >
          Back to Suppliers
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Supplier Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Contact Person</label>
                <p className="mt-1 text-sm text-gray-900">{supplier.contact_person}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <p className="mt-1 text-sm text-gray-900">{supplier.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Phone</label>
                <p className="mt-1 text-sm text-gray-900">{supplier.phone}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Payment Terms</label>
                <p className="mt-1 text-sm text-gray-900">{supplier.payment_terms}</p>
              </div>
              {supplier.address && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Address</label>
                  <p className="mt-1 text-sm text-gray-900">{supplier.address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{supplier.total_purchase_orders}</p>
                <p className="text-sm text-blue-600">Total Orders</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{supplier.completed_orders}</p>
                <p className="text-sm text-green-600">Completed</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{supplier.pending_orders}</p>
                <p className="text-sm text-yellow-600">Pending</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">{supplier.rating}/5</p>
                <p className="text-sm text-purple-600">Rating</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Supplier Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${supplier.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {supplier.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Member Since</span>
                <span className="text-sm text-gray-900">{supplier.created_at.formatted}</span>
              </div>
            </div>
          </div>

          {/* Actions Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-2">
              <Button
                variant="primary"
                className="w-full"
                onClick={() => router.push(`/dashboard/management/purchase-orders/new?supplier_id=${supplierId}`)}
              >
                Create Purchase Order
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => router.push(`/dashboard/management/suppliers/${supplierId}/edit`)}
              >
                Edit Supplier
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Purchase Orders Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Purchase Orders</h2>
          <Button
            variant="primary"
            onClick={() => router.push(`/dashboard/management/purchase-orders/new?supplier_id=${supplierId}`)}
          >
            New Purchase Order
          </Button>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No purchase orders found for this supplier.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    PO Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {purchaseOrders.map((order) => (
                  <tr 
                    key={order.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/dashboard/management/purchase-orders/${order.id}`)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.po_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.order_date.formatted}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {order.item_count} items
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(order.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
