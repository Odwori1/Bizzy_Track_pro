import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

export interface Product {
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

export const useProducts = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<Product[]>('/products');
      setProducts(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return {
    products,
    loading,
    error,
    refetch: fetchProducts
  };
};
