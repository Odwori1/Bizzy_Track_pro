'use client';

import { useEffect, useState } from 'react';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';

export default function ExpenseCategoriesPage() {
  const { 
    categories, 
    loading, 
    fetchCategories, 
    createCategory,
    updateCategory,
    deleteCategory 
  } = useExpenses();
  
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
  });

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingCategory) {
        // Update existing category
        await updateCategory(editingCategory.id, formData);
      } else {
        // Create new category
        await createCategory(formData);
      }
      
      // Refresh categories
      await fetchCategories();
      
      // Reset form
      setShowForm(false);
      setEditingCategory(null);
      setFormData({ name: '', description: '', color: '#3B82F6' });
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Failed to save category. Please try again.');
    }
  };

  const handleEdit = (category: any) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#3B82F6',
    });
    setShowForm(true);
  };

  const handleDelete = async (categoryId: string) => {
    if (confirm('Are you sure you want to delete this category?')) {
      try {
        await deleteCategory(categoryId);
        await fetchCategories(); // Refresh the list
      } catch (error) {
        console.error('Error deleting category:', error);
        alert('Failed to delete category. Please try again.');
      }
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingCategory(null);
    setFormData({ name: '', description: '', color: '#3B82F6' });
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Categories</h1>
          <p className="text-gray-600">Manage your expense categories</p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => setShowForm(true)}
          disabled={loading}
        >
          Add Category
        </Button>
      </div>

      {showForm && (
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingCategory ? 'Edit Category' : 'Create New Category'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormInput
                  label="Category Name"
                  value={formData.name}
                  onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                  required
                  placeholder="e.g., Office Supplies"
                />
                <FormInput
                  label="Description"
                  value={formData.description}
                  onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                  placeholder="Optional description"
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                      className="w-12 h-12 rounded cursor-pointer"
                    />
                    <span className="text-sm text-gray-500">{formData.color}</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="primary"
                  disabled={loading || !formData.name.trim()}
                >
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
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div
                    className="w-4 h-4 rounded-full mr-3"
                    style={{ backgroundColor: category.color || '#3B82F6' }}
                  ></div>
                  <h3 className="font-semibold text-gray-900">{category.name}</h3>
                </div>
                <div className="flex space-x-2">
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
                    onClick={() => handleDelete(category.id)}
                    disabled={category.expense_count > 0}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              
              {category.description && (
                <p className="text-sm text-gray-600 mb-3">{category.description}</p>
              )}
              
              <div className="text-xs text-gray-500">
                {category.expense_count || 0} expense{(category.expense_count || 0) !== 1 ? 's' : ''}
              </div>
              
              {category.expense_count > 0 && (
                <div className="text-xs text-orange-500 mt-1">
                  Cannot delete - category has expenses
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {categories.length === 0 && !loading && (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500 mb-4">No expense categories found</div>
            <Button variant="primary" onClick={() => setShowForm(true)}>
              Create Your First Category
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
