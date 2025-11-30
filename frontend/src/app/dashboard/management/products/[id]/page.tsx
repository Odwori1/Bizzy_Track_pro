'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';

interface ProductDetail {
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
  category_name: string;
  stock_status: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const { format } = useCurrency();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const data = await apiClient.get<ProductDetail>(`/products/${params.id}`);
        setProduct(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [params.id]);

  if (loading) return <Loading />;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!product) return <div>Product not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-gray-600">SKU: {product.sku}</p>
        </div>
        <Button variant="outline">Edit Product</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Product Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium">{product.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">SKU:</span>
                <span className="font-medium">{product.sku}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Category:</span>
                <span className="font-medium">{product.category_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className={`font-medium ${
                  product.is_active ? 'text-green-600' : 'text-red-600'
                }`}>
                  {product.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Pricing & Stock</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Cost Price:</span>
                <span className="font-medium">{format(product.cost_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Selling Price:</span>
                <span className="font-medium text-green-600">{format(product.selling_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Current Stock:</span>
                <span className="font-medium">{product.current_stock} {product.unit_of_measure}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Stock Status:</span>
                <span className={`font-medium ${
                  product.stock_status === 'low' ? 'text-yellow-600' :
                  product.stock_status === 'out' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {product.stock_status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
