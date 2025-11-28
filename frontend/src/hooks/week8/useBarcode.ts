import { useState } from 'react';
import { apiClient } from '@/lib/api';

export interface BarcodeResult {
  product_id: string;
  name: string;
  sku: string;
  selling_price: string;
  current_stock: number;
}

export const useBarcode = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BarcodeResult | null>(null);

  const lookupBarcode = async (barcode: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<BarcodeResult>(`/barcode/lookup?barcode=${barcode}`);
      setResult(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Product not found');
      setResult(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  return {
    lookupBarcode,
    clearResult,
    result,
    loading,
    error
  };
};
