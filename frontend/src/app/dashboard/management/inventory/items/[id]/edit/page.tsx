'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useInventory } from '@/hooks/week7/useInventory';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';
import { FormSelect } from '@/components/ui/week7/FormSelect';

export default function EditInventoryItemPage() {
  const params = useParams();
  const router = useRouter();
  const { getItemById, categories, updateItem, loading } = useInventory();
  
  const itemId = params.id as string;
  const item = getItemById(itemId);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category_id: '',
    sku: '',
    current_stock: 0,
    min_stock_level: 0,
    cost_price: 0,
    selling_price: 0,
    unit: '',
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || '',
        description: item.description || '',
        category_id: item.category_id || '',
        sku: item.sku || '',
        current_stock: item.current_stock || 0,
        min_stock_level: item.min_stock_level || 0,
        cost_price: item.cost_price || 0,
        selling_price: item.selling_price || 0,
        unit: item.unit || '',
      });
    }
  }, [item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await updateItem(itemId, formData);
    if (result.success) {
      router.push(`/dashboard/management/inventory/items/${itemId}`);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading && !item) return <Loading />;
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
          <h1 className="text-2xl font-bold text-gray-900">Edit {item.name}</h1>
          <p className="text-gray-600">Update inventory item details</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <Card>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                label="Item Name"
                value={formData.name}
                onChange={(value) => handleChange('name', value)}
                required
              />

              <FormInput
                label="SKU"
                value={formData.sku}
                onChange={(value) => handleChange('sku', value)}
              />

              <FormSelect
                label="Category"
                value={formData.category_id}
                onChange={(value) => handleChange('category_id', value)}
                options={categories.map(cat => ({ value: cat.id, label: cat.name }))}
                required
              />

              <FormInput
                label="Unit"
                value={formData.unit}
                onChange={(value) => handleChange('unit', value)}
                placeholder="e.g., pieces, kg, liters"
              />

              <FormInput
                label="Current Stock"
                type="number"
                value={formData.current_stock}
                onChange={(value) => handleChange('current_stock', parseInt(value) || 0)}
              />

              <FormInput
                label="Min Stock Level"
                type="number"
                value={formData.min_stock_level}
                onChange={(value) => handleChange('min_stock_level', parseInt(value) || 0)}
              />

              <FormInput
                label="Cost Price"
                type="number"
                step="0.01"
                value={formData.cost_price}
                onChange={(value) => handleChange('cost_price', parseFloat(value) || 0)}
              />

              <FormInput
                label="Selling Price"
                type="number"
                step="0.01"
                value={formData.selling_price}
                onChange={(value) => handleChange('selling_price', parseFloat(value) || 0)}
              />
            </div>

            <FormInput
              label="Description"
              type="text"
              value={formData.description}
              onChange={(value) => handleChange('description', value)}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Updating...' : 'Update Item'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
