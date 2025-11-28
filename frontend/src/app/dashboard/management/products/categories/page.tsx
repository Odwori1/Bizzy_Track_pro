'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

interface Category {
  id: string;
  name: string;
  description: string;
  parent_id: string | null;
  is_active: boolean;
  product_count: string;
  created_at: any;
  updated_at: any;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Category[]>('/categories');
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    if (confirm(`Are you sure you want to delete "${categoryName}"? This will affect all products in this category.`)) {
      try {
        await apiClient.delete(`/categories/${categoryId}`);
        fetchCategories(); // Refresh the list
      } catch (err: any) {
        alert(err.message || 'Failed to delete category');
      }
    }
  };

  // Filter categories based on search
  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    category.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading categories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-600">Error: {error}</div>
        <Button onClick={fetchCategories} className="ml-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Categories</h1>
          <p className="text-gray-600">Manage your product categories</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={fetchCategories}
          >
            Refresh
          </Button>
          <Link href="/dashboard/management/products/categories/new">
            <Button variant="primary">
              Add New Category
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <input
          type="text"
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCategories.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">
              {searchTerm ? 'No categories found' : 'No categories yet'}
            </div>
            <p className="text-gray-400 mb-4">
              {searchTerm 
                ? 'Try adjusting your search terms' 
                : 'Get started by creating your first category'
              }
            </p>
            {!searchTerm && (
              <Link href="/dashboard/management/products/categories/new">
                <Button variant="primary">
                  Create First Category
                </Button>
              </Link>
            )}
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{category.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      category.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {category.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    <span className="text-sm text-gray-600">
                      {category.product_count} products
                    </span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Link href={`/dashboard/management/products/categories/${category.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={() => handleDeleteCategory(category.id, category.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              {category.description && (
                <div className="text-sm text-gray-600 mb-4">
                  {category.description}
                </div>
              )}

              <div className="flex justify-between text-xs text-gray-500 border-t pt-3">
                <span>Created: {formatDate(category.created_at)}</span>
                <span>Updated: {formatDate(category.updated_at)}</span>
              </div>

              <div className="flex space-x-2 mt-4">
                <Link href={`/dashboard/management/products?category=${category.id}`} className="flex-1">
                  <Button variant="outline" className="w-full">
                    View Products
                  </Button>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Stats */}
      {filteredCategories.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredCategories.length}</div>
            <div className="text-sm text-gray-600">Total Categories</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {filteredCategories.filter(c => c.is_active).length}
            </div>
            <div className="text-sm text-gray-600">Active Categories</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {filteredCategories.reduce((sum, cat) => sum + parseInt(cat.product_count), 0)}
            </div>
            <div className="text-sm text-gray-600">Total Products</div>
          </div>
        </div>
      )}
    </div>
  );
}
