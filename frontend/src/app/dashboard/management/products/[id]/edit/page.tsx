'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  barcode: string;
  category_id: string;
  cost_price: string;
  selling_price: string;
  current_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  unit_of_measure: string;
  is_active: boolean;
  category_name: string;
}

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    cost_price: '',
    selling_price: '',
    current_stock: '',
    min_stock_level: '',
    max_stock_level: '',
    unit_of_measure: 'pieces',
    is_active: true
  });

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const product = await apiClient.get<Product>(`/products/${productId}`);

        setFormData({
          name: product.name,
          description: product.description || '',
          sku: product.sku,
          barcode: product.barcode || '',
          cost_price: product.cost_price,
          selling_price: product.selling_price,
          current_stock: product.current_stock.toString(),
          min_stock_level: product.min_stock_level.toString(),
          max_stock_level: product.max_stock_level.toString(),
          unit_of_measure: product.unit_of_measure,
          is_active: product.is_active
        });
      } catch (err: any) {
        setError(err.message || 'Failed to fetch product details');
      } finally {
        setLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await apiClient.put(`/products/${productId}`, {
        ...formData,
        cost_price: parseFloat(formData.cost_price),
        selling_price: parseFloat(formData.selling_price),
        current_stock: parseInt(formData.current_stock),
        min_stock_level: parseInt(formData.min_stock_level),
        max_stock_level: parseInt(formData.max_stock_level)
      });

      router.push(`/dashboard/management/products/${productId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update product');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading product details...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
          <p className="text-gray-600">Update product information</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/management/products/${productId}`)}
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
              Product Name *
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SKU Code *
            </label>
            <input
              type="text"
              name="sku"
              required
              value={formData.sku}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost Price *
            </label>
            <input
              type="number"
              step="0.01"
              name="cost_price"
              required
              value={formData.cost_price}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Selling Price *
            </label>
            <input
              type="number"
              step="0.01"
              name="selling_price"
              required
              value={formData.selling_price}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Stock *
            </label>
            <input
              type="number"
              name="current_stock"
              required
              value={formData.current_stock}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unit of Measure
            </label>
            <select
              name="unit_of_measure"
              value={formData.unit_of_measure}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pieces">Pieces</option>
              <option value="units">Units</option>
              <option value="kg">Kilograms</option>
              <option value="liters">Liters</option>
              <option value="meters">Meters</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Stock Level
            </label>
            <input
              type="number"
              name="min_stock_level"
              value={formData.min_stock_level}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximum Stock Level
            </label>
            <input
              type="number"
              name="max_stock_level"
              value={formData.max_stock_level}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Barcode
            </label>
            <input
              type="text"
              name="barcode"
              value={formData.barcode}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Active Product</span>
            </label>
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Product'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/dashboard/management/products/${productId}`)}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
