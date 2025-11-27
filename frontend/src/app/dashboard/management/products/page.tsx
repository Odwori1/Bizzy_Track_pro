'use client';

import { ProductList } from '@/components/products/ProductList';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-gray-600">Manage your products and inventory</p>
        </div>
        <div className="flex space-x-4">
          <Link href="/dashboard/management/products/new">
            <Button variant="primary">Add New Product</Button>
          </Link>
        </div>
      </div>

      {/* Product List Component */}
      <ProductList />
    </div>
  );
}
