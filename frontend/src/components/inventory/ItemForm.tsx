'use client';

import { useState } from 'react';
import { useInventory } from '@/hooks/week7/useInventory';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/week7/FormInput';
import { FormSelect } from '@/components/ui/week7/FormSelect';

interface ItemFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ItemForm({ onSuccess, onCancel }: ItemFormProps) {
  const { createItem, categories, loading } = useInventory();
  
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createItem(formData);
    if (result.success && onSuccess) {
      onSuccess();
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
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
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Item'}
        </Button>
      </div>
    </form>
  );
}
