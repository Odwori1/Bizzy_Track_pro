'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/date-utils';

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
  has_variants: boolean;
  category_name: string;
  stock_status: string;
  created_at: any;
  updated_at: any;
}

export default function ProductsPage() {
  const { format } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Product[]>('/products');
      setProducts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      try {
        await apiClient.delete(`/products/${productId}`);
        fetchProducts(); // Refresh the list
      } catch (err: any) {
        alert(err.message || 'Failed to delete product');
      }
    }
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'low': return 'bg-red-100 text-red-800';
      case 'adequate': return 'bg-green-100 text-green-800';
      case 'overstock': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStockStatusText = (product: Product) => {
    if (product.current_stock <= product.min_stock_level) return 'LOW STOCK';
    if (product.current_stock >= product.max_stock_level) return 'OVERSTOCK';
    return 'ADEQUATE';
  };

  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  // Get unique categories for filter
  const categories = [...new Set(products.map(p => p.category_name))];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg">Loading products...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-red-600">Error: {error}</div>
        <Button onClick={fetchProducts} className="ml-4">
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
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-gray-600">Manage your products and inventory</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={fetchProducts}
          >
            Refresh
          </Button>
          <Link href="/dashboard/management/products/new">
            <Button variant="primary">
              Add New Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, SKU, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map((category, index) => (
              <option key={index} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-500 text-lg mb-2">
              {searchTerm || categoryFilter !== 'all' ? 'No products found' : 'No products yet'}
            </div>
            <p className="text-gray-400 mb-4">
              {searchTerm || categoryFilter !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Get started by adding your first product'
              }
            </p>
            {!searchTerm && categoryFilter === 'all' && (
              <Link href="/dashboard/management/products/new">
                <Button variant="primary">
                  Add First Product
                </Button>
              </Link>
            )}
          </div>
        ) : (
          filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{product.name}</h3>
                  <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                  {product.barcode && (
                    <p className="text-sm text-gray-600">Barcode: {product.barcode}</p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <Link href={`/dashboard/management/products/${product.id}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={() => handleDeleteProduct(product.id, product.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-sm text-gray-600">Category:</span>
                  <span className="ml-2 text-sm text-gray-900">{product.category_name}</span>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-2xl font-bold text-gray-900">
                      {format(product.selling_price)}
                    </span>
                    <div className="text-sm text-gray-600">
                      Cost: {format(product.cost_price)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      {product.current_stock} {product.unit_of_measure}
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStockStatusColor(getStockStatusText(product).toLowerCase())}`}>
                      {getStockStatusText(product)}
                    </span>
                  </div>
                </div>

                {product.description && (
                  <div className="text-sm text-gray-600 border-t pt-3">
                    {product.description}
                  </div>
                )}

                <div className="flex justify-between text-xs text-gray-500 border-t pt-3">
                  <span>Created: {formatDate(product.created_at)}</span>
                  <span>Updated: {formatDate(product.updated_at)}</span>
                </div>

                <div className="flex space-x-2 pt-3">
                  <Link href={`/dashboard/management/products/${product.id}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      View Details
                    </Button>
                  </Link>
                  <Link href={`/dashboard/management/pos/checkout?product=${product.id}`} className="flex-1">
                    <Button variant="primary" className="w-full">
                      Sell Now
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary Stats */}
      {filteredProducts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredProducts.length}</div>
            <div className="text-sm text-gray-600">Total Products</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {filteredProducts.filter(p => p.current_stock > p.min_stock_level).length}
            </div>
            <div className="text-sm text-gray-600">In Stock</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {filteredProducts.filter(p => p.current_stock <= p.min_stock_level).length}
            </div>
            <div className="text-sm text-gray-600">Low Stock</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {filteredProducts.filter(p => !p.is_active).length}
            </div>
            <div className="text-sm text-gray-600">Inactive</div>
          </div>
        </div>
      )}
    </div>
  );
}
