'use client';

import { useState } from 'react';
import { useBarcode } from '@/hooks/week8/useBarcode';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function BarcodeLookupPage() {
  const [barcodeInput, setBarcodeInput] = useState('');
  const { lookupBarcode, clearResult, result, loading, error } = useBarcode();
  const { format } = useCurrency();

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    
    try {
      await lookupBarcode(barcodeInput);
    } catch (err) {
      // Error handled by hook
    }
  };

  const handleClear = () => {
    setBarcodeInput('');
    clearResult();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Barcode Lookup</h1>
          <p className="text-gray-600">Search products by barcode or SKU</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Search Form */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Search Product</h2>
            <form onSubmit={handleLookup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Barcode or SKU
                </label>
                <Input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Enter barcode or SKU code"
                  disabled={loading}
                />
              </div>
              
              <div className="flex space-x-4">
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                  disabled={!barcodeInput.trim() || loading}
                >
                  Lookup Product
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClear}
                  disabled={loading}
                >
                  Clear
                </Button>
              </div>
            </form>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800">
                ❌ {error}
              </div>
            )}
          </div>
        </Card>

        {/* Results */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Product Information</h2>
            
            {result ? (
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-green-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">{result.name}</h3>
                      <p className="text-gray-600">SKU: {result.sku}</p>
                      <p className="text-gray-600">Stock: {result.current_stock} units</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-green-600">
                        {format(result.selling_price)}
                      </div>
                      <div className={`text-sm ${
                        result.current_stock > 10 ? 'text-green-600' : 
                        result.current_stock > 0 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {result.current_stock > 10 ? 'In Stock' : 
                         result.current_stock > 0 ? 'Low Stock' : 'Out of Stock'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600">
                  <p>✅ Product found successfully</p>
                  <p>Use this product in POS checkout or inventory management.</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📦</div>
                <p>Enter a barcode or SKU to lookup product information</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
