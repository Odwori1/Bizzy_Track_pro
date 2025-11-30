'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';

interface PurchaseOrder {
  id: string;
  supplier_id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string;
  total_amount: string;
  notes: string;
}

interface Supplier {
  id: string;
  name: string;
}

export default function EditPurchaseOrderPage() {
  const params = useParams();
  const router = useRouter();
  const { format } = useCurrency();
  const purchaseOrderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [formData, setFormData] = useState({
    supplier_id: '',
    order_date: '',
    expected_delivery_date: '',
    status: 'draft',
    notes: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const [purchaseOrder, suppliersData] = await Promise.all([
          apiClient.get<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`),
          apiClient.get<Supplier[]>('/suppliers')
        ]);

        setSuppliers(suppliersData);

        setFormData({
          supplier_id: purchaseOrder.supplier_id,
          order_date: purchaseOrder.order_date.split('T')[0],
          expected_delivery_date: purchaseOrder.expected_delivery_date.split('T')[0],
          status: purchaseOrder.status,
          notes: purchaseOrder.notes || ''
        });

      } catch (err: any) {
        setError(err.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    if (purchaseOrderId) {
      fetchData();
    }
  }, [purchaseOrderId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await apiClient.put(`/purchase-orders/${purchaseOrderId}`, formData);
      router.push(`/dashboard/management/purchase-orders/${purchaseOrderId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update purchase order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading purchase order details...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Purchase Order</h1>
          <p className="text-gray-600">Update purchase order information</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/management/purchase-orders/${purchaseOrderId}`)}
        >
          Cancel
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier *
            </label>
            <select
              name="supplier_id"
              required
              value={formData.supplier_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="confirmed">Confirmed</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order Date *
            </label>
            <input
              type="date"
              name="order_date"
              required
              value={formData.order_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expected Delivery Date
            </label>
            <input
              type="date"
              name="expected_delivery_date"
              value={formData.expected_delivery_date}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              name="notes"
              rows={3}
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional notes for this purchase order..."
            />
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Purchase Order'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/management/purchase-orders/${purchaseOrderId}`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
