'use client';

import { useEffect, useState } from 'react';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';

export default function ExpenseCategoriesPage() {
  const { categories, loading, fetchCategories } = useExpenses();
  const [showForm, setShowForm] = useState(false);
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
    // Implementation for creating category would go here
    setShowForm(false);
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
        <Button variant="primary" onClick={() => setShowForm(true)}>
          Add Category
        </Button>
      </div>

      {showForm && (
        <Card>
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormInput
                  label="Category Name"
                  value={formData.name}
                  onChange={(value) => setFormData(prev => ({ ...prev, name: value }))}
                  required
                />
                <FormInput
                  label="Description"
                  value={formData.description}
                  onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                />
                <FormInput
                  label="Color"
                  type="color"
                  value={formData.color}
                  onChange={(value) => setFormData(prev => ({ ...prev, color: value }))}
                />
              </div>
              <div className="flex justify-end space-x-3">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Create Category
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
                <div>
                  <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  {category.description && (
                    <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                  )}
                  <div className="flex items-center mt-2">
                    <div
                      className="w-4 h-4 rounded-full mr-2"
                      style={{ backgroundColor: category.color || '#3B82F6' }}
                    ></div>
                    <span className="text-sm text-gray-500">
                      {category.expense_count || 0} expenses
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {categories.length === 0 && (
        <Card>
          <div className="text-center py-8">
            <div className="text-gray-500">No expense categories found</div>
            <Button variant="primary" className="mt-2" onClick={() => setShowForm(true)}>
              Create First Category
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
