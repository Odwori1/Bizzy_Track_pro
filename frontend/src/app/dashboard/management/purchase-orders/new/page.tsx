'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';

interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  cost_price: string;
  current_stock: number;
}

interface PurchaseOrderItem {
  product_id: string;
  quantity: number;
  unit_cost: string;
  total_cost: string;
}

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { format } = useCurrency();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    supplier_id: searchParams.get('supplier_id') || '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    notes: ''
  });

  const [items, setItems] = useState<PurchaseOrderItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [suppliersData, productsData] = await Promise.all([
          apiClient.get<Supplier[]>('/suppliers'),
          apiClient.get<Product[]>('/products')
        ]);
        setSuppliers(suppliersData);
        setProducts(productsData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const addItem = () => {
    setItems([...items, {
      product_id: '',
      quantity: 1,
      unit_cost: '0',
      total_cost: '0'
    }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'quantity' || field === 'unit_cost') {
      const quantity = field === 'quantity' ? Number(value) : newItems[index].quantity;
      const unitCost = field === 'unit_cost' ? String(value) : newItems[index].unit_cost;
      newItems[index].total_cost = (quantity * parseFloat(unitCost || '0')).toFixed(2);
    }

    setItems(newItems);
  };

  const getProductCost = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product ? product.cost_price : '0';
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => total + parseFloat(item.total_cost || '0'), 0).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        items: items.filter(item => item.product_id && item.quantity > 0),
        total_amount: calculateTotal()
      };

      await apiClient.post('/purchase-orders', payload);
      router.push('/dashboard/management/purchase-orders');
    } catch (error: any) {
      console.error('Failed to create purchase order:', error);
      alert(error.message || 'Failed to create purchase order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Purchase Order</h1>
          <p className="text-gray-600">Add a new purchase order from your suppliers</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/management/purchase-orders')}
        >
          Back to Orders
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Supplier & Dates Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier *
                  </label>
                  <select
                    required
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
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
                    Order Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={formData.expected_delivery_date}
                    onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Additional notes for this purchase order..."
                  />
                </div>
              </div>
            </div>

            {/* Items Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Order Items</h2>
                <Button type="button" variant="outline" onClick={addItem}>
                  Add Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No items added yet.</p>
                  <Button type="button" variant="outline" onClick={addItem} className="mt-2">
                    Add First Item
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={index} className="flex items-start space-x-4 p-4 border border-gray-200 rounded-lg">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Product *
                          </label>
                          <select
                            required
                            value={item.product_id}
                            onChange={(e) => {
                              updateItem(index, 'product_id', e.target.value);
                              updateItem(index, 'unit_cost', getProductCost(e.target.value));
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select Product</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} ({product.sku})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity *
                          </label>
                          <input
                            type="number"
                            required
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Unit Cost *
                          </label>
                          <input
                            type="number"
                            required
                            step="0.01"
                            min="0"
                            value={item.unit_cost}
                            onChange={(e) => updateItem(index, 'unit_cost', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Total Cost
                          </label>
                          <div className="px-3 py-2 bg-gray-50 rounded-md border border-gray-300">
                            <span className="text-sm text-gray-900">{format(item.total_cost)}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => removeItem(index)}
                        className="mt-6"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
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
                  <span className="text-sm text-gray-900">{items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Value</span>
                  <span className="text-sm font-medium text-gray-900">{format(calculateTotal())}</span>
                </div>
              </div>
            </div>

            {/* Actions Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="space-y-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={submitting || items.length === 0 || !formData.supplier_id}
                >
                  {submitting ? 'Creating...' : 'Create Purchase Order'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push('/dashboard/management/purchase-orders')}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
