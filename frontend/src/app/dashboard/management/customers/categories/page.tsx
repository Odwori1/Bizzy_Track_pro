'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

export default function CustomerCategoriesPage() {
  const { customerCategories, loading, error, actions } = useCustomerStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    discount_percentage: '0'
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    actions.fetchCustomerCategories();
  }, [actions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const categoryData = {
        ...formData,
        discount_percentage: parseFloat(formData.discount_percentage)
      };

      if (editingId) {
        await actions.updateCustomerCategory(editingId, categoryData);
      } else {
        await actions.createCustomerCategory(categoryData);
      }
      
      setShowForm(false);
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        color: '#3B82F6',
        discount_percentage: '0'
      });
    } catch (error) {
      console.error('Failed to save category:', error);
      alert('Failed to save category. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (category: any) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color,
      discount_percentage: category.discount_percentage
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      name: '',
      description: '',
      color: '#3B82F6',
      discount_percentage: '0'
    });
  };

  const handleDelete = async (categoryId: string, categoryName: string) => {
    if (!confirm(`Are you sure you want to delete "${categoryName}"? Customers in this category will be moved to no category.`)) {
      return;
    }

    try {
      await actions.deleteCustomerCategory(categoryId);
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category. It might be in use by some customers.');
    }
  };

  if (loading && customerCategories.length === 0) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Categories</h1>
          <p className="text-gray-600">Organize customers and set discount rates</p>
        </div>
        <Link href="/dashboard/management/customers">
          <Button variant="secondary">Back to Customers</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={() => actions.fetchCustomerCategories()} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {/* Add/Edit Category Form */}
      {showForm && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Category' : 'Add New Category'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name *
                </label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., VIP, Corporate, Regular"
                />
              </div>

              <div>
                <label htmlFor="discount_percentage" className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Percentage *
                </label>
                <Input
                  id="discount_percentage"
                  name="discount_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={formData.discount_percentage}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount_percentage: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe this customer category..."
                />
              </div>

              <div>
                <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    name="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    className="w-20"
                  />
                  <div 
                    className="w-10 h-10 rounded border"
                    style={{ backgroundColor: formData.color }}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Saving...' : (editingId ? 'Update Category' : 'Create Category')}
              </Button>
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Categories List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Add Category Card */}
        {!showForm && (
          <Card className="p-6 border-2 border-dashed border-gray-300 hover:border-gray-400 cursor-pointer">
            <div 
              className="flex flex-col items-center justify-center h-32 text-gray-500"
              onClick={() => setShowForm(true)}
            >
              <div className="text-2xl mb-2">+</div>
              <div className="text-sm">Add New Category</div>
            </div>
          </Card>
        )}

        {/* Existing Categories */}
        {customerCategories.map((category) => (
          <Card key={category.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div 
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: category.color }}
                />
                <h3 className="font-semibold">{category.name}</h3>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs ${
                category.is_active 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {category.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            {category.description && (
              <p className="text-gray-600 text-sm mb-3">{category.description}</p>
            )}
            
            <div className="flex justify-between items-center text-sm">
              <div className="font-semibold text-green-600">
                {category.discount_percentage}% Discount
              </div>
              <div className="text-gray-500 text-xs">
                ID: {category.id.slice(0, 8)}...
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEdit(category)}
                className="flex-1"
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDelete(category.id, category.name)}
                className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {customerCategories.length === 0 && !loading && !showForm && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No customer categories found</p>
          <Button onClick={() => setShowForm(true)} className="mt-4">
            Create Your First Category
          </Button>
        </Card>
      )}
    </div>
  );
}
