'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useServiceStore } from '@/store/serviceStore';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

export default function ServiceCategoriesPage() {
  const { serviceCategories, loading, error, actions } = useServiceStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    sort_order: 0
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    actions.fetchServiceCategories();
  }, [actions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editingId) {
        await actions.updateServiceCategory(editingId, formData);
      } else {
        await actions.createServiceCategory(formData);
      }
      
      setShowForm(false);
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        color: '#3B82F6',
        sort_order: 0
      });
    } catch (error) {
      console.error('Failed to save category:', error);
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
      sort_order: category.sort_order
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
      sort_order: 0
    });
  };

  const handleDelete = async (categoryId: string, categoryName: string) => {
    if (!confirm(`Are you sure you want to delete "${categoryName}"? Services using this category will keep their category name but lose the relationship.`)) {
      return;
    }

    try {
      await actions.deleteServiceCategory(categoryId);
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Failed to delete category. It might be in use by some services.');
    }
  };

  if (loading && serviceCategories.length === 0) {
    return <Loading />;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Categories</h1>
          <p className="text-gray-600">Organize your services into categories</p>
        </div>
        <Link href="/dashboard/management/services">
          <Button variant="secondary">Back to Services</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="text-red-800 text-sm">{error}</div>
          <Button variant="secondary" size="sm" onClick={() => actions.fetchServiceCategories()} className="mt-2">
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
                  placeholder="e.g., Beauty, Photography, Maintenance"
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
                  placeholder="Describe this category..."
                />
              </div>

              <div>
                <label htmlFor="sort_order" className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <Input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  min="0"
                  value={formData.sort_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                />
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
        {serviceCategories.map((category) => (
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
            
            <div className="flex justify-between items-center text-sm text-gray-500">
              <div>Order: {category.sort_order}</div>
              <div>ID: {category.id.slice(0, 8)}...</div>
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

      {serviceCategories.length === 0 && !loading && !showForm && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No service categories found</p>
          <Button onClick={() => setShowForm(true)} className="mt-4">
            Create Your First Category
          </Button>
        </Card>
      )}
    </div>
  );
}
