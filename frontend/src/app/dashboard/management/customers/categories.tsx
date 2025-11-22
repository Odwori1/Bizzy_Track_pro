'use client';

import { useState, useEffect } from 'react';
import { useCustomerStore } from '@/store/customerStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Loading } from '@/components/ui/Loading';

export default function CustomerCategoriesPage() {
  const { actions, customerCategories, loading } = useCustomerStore();
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
    discount_percentage: '',
    is_active: true
  });

  useEffect(() => {
    actions.fetchCustomerCategories();
  }, [actions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const categoryData = {
        ...formData,
        discount_percentage: formData.discount_percentage ? parseFloat(formData.discount_percentage) : 0
      };

      if (editingCategory) {
        await actions.updateCustomerCategory(editingCategory.id, categoryData);
        setEditingCategory(null);
      } else {
        await actions.createCustomerCategory(categoryData);
        setShowNewForm(false);
      }
      
      setFormData({
        name: '',
        description: '',
        color: '#3B82F6',
        discount_percentage: '',
        is_active: true
      });
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description,
      color: category.color,
      discount_percentage: category.discount_percentage,
      is_active: category.is_active
    });
    setShowNewForm(true);
  };

  const handleCancel = () => {
    setShowNewForm(false);
    setEditingCategory(null);
    setFormData({
      name: '',
      description: '',
      color: '#3B82F6',
      discount_percentage: '',
      is_active: true
    });
  };

  const handleDelete = async (categoryId: string) => {
    if (confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      try {
        await actions.deleteCustomerCategory(categoryId);
      } catch (error) {
        console.error('Failed to delete category:', error);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({
      ...formData,
      [e.target.name]: value
    });
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Categories</h1>
          <p className="text-gray-600">Manage customer categories and discounts</p>
        </div>
        <Button onClick={() => setShowNewForm(true)}>
          Add Category
        </Button>
      </div>

      {/* Category Form */}
      {showNewForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{editingCategory ? 'Edit Category' : 'New Category'}</CardTitle>
            <CardDescription>
              {editingCategory ? 'Update the category details' : 'Create a new customer category'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Category Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="e.g., VIP, Regular, Corporate"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      name="color"
                      type="color"
                      value={formData.color}
                      onChange={handleChange}
                      className="w-20"
                    />
                    <div 
                      className="w-10 h-10 rounded border"
                      style={{ backgroundColor: formData.color }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe this customer category"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discount_percentage">Discount Percentage</Label>
                <Input
                  id="discount_percentage"
                  name="discount_percentage"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.discount_percentage}
                  onChange={handleChange}
                  placeholder="0.00"
                />
                <p className="text-sm text-gray-500">
                  Discount percentage applied to customers in this category (0-100%)
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_active"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="is_active">Active Category</Label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : (editingCategory ? 'Update Category' : 'Create Category')}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Categories Grid */}
      {loading && customerCategories.length === 0 ? (
        <Loading />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {customerCategories.map((category) => (
            <Card key={category.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{category.name}</CardTitle>
                  <div
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: category.color }}
                  />
                </div>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Discount:</span>
                    <span className="font-semibold">
                      {parseFloat(category.discount_percentage) > 0 
                        ? `${category.discount_percentage}%` 
                        : 'None'
                      }
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      category.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {category.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-500">Created:</span>
                    <span>{new Date(category.created_at.utc).toLocaleDateString()}</span>
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
                    onClick={() => handleDelete(category.id)}
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {customerCategories.length === 0 && !loading && (
        <Card className="p-8 text-center">
          <p className="text-gray-500 mb-4">No customer categories found</p>
          <Button onClick={() => setShowNewForm(true)}>
            Create Your First Category
          </Button>
        </Card>
      )}
    </div>
  );
}
