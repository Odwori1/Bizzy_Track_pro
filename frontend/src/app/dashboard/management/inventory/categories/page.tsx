'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useInventory } from '@/hooks/week7/useInventory';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';
import { InventoryCategory } from '@/types/week7';

export default function InventoryCategoriesPage() {
  const { categories, loading, fetchCategories, createCategory, updateCategory, deleteCategory } = useInventory();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InventoryCategory | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCategory) {
      // Update existing category
      const result = await updateCategory(editingCategory.id, formData);
      if (result.success) {
        setEditingCategory(null);
        setFormData({ name: '', description: '' });
        fetchCategories();
      }
    } else {
      // Create new category
      const result = await createCategory(formData);
      if (result.success) {
        setShowForm(false);
        setFormData({ name: '', description: '' });
        fetchCategories();
      }
    }
  };

  const handleEdit = (category: InventoryCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (category: InventoryCategory) => {
    if (confirm(`Are you sure you want to delete category "${category.name}"? This will affect all items in this category.`)) {
      const result = await deleteCategory(category.id);
      if (result.success) {
        fetchCategories();
      }
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '' });
  };

  if (loading && categories.length === 0) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Categories</h1>
          <p className="text-gray-600">Organize your inventory with categories</p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => {
            setEditingCategory(null);
            setFormData({ name: '', description: '' });
            setShowForm(true);
          }}
        >
          Add Category
        </Button>
      </div>

      {showForm && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormInput
                  label="Category Name"
                  value={formData.name}
                  onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                  required
                  placeholder="e.g., Electronics, Office Supplies"
                />
                <FormInput
                  label="Description"
                  value={formData.description}
                  onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                  placeholder="Optional category description"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map((category) => (
          <Card key={category.id}>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  {category.description && (
                    <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                  )}
                  <div className="flex items-center mt-2">
                    <span className="text-sm text-gray-500">
                      {category.item_count || 0} items
                    </span>
                  </div>
                </div>
                <div className="flex space-x-2 ml-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEdit(category)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDelete(category)}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {categories.length === 0 && !loading && (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No categories found</div>
            <p className="text-gray-600 mb-4 mt-2">
              Categories help you organize your inventory items
            </p>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Create First Category
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
