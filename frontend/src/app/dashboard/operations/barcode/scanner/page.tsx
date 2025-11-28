'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  selling_price: string;
  current_stock: number;
  category_name: string;
}

export default function BarcodeScannerPage() {
  const router = useRouter();
  const { format } = useCurrency();

  const [scanning, setScanning] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanHistory, setScanHistory] = useState<Product[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setScanning(true);
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      setError('Camera access denied or not available');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const lookupBarcode = async (barcode: string) => {
    if (!barcode.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      const productData = await apiClient.get<Product>('/barcode/lookup', { 
        sku: barcode,
        barcode: barcode 
      });
      
      setProduct(productData);
      setScanHistory(prev => [productData, ...prev.slice(0, 4)]); // Keep last 5 scans
    } catch (err: any) {
      setError(err.message || 'Product not found');
      setProduct(null);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookupBarcode(barcodeInput);
    setBarcodeInput('');
  };

  const handleAddToCart = () => {
    if (product) {
      // In a real implementation, this would add to the POS cart
      router.push(`/dashboard/management/pos/checkout?product=${product.id}`);
    }
  };

  const handleViewProduct = () => {
    if (product) {
      router.push(`/dashboard/management/products/${product.id}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Barcode Scanner</h1>
          <p className="text-gray-600">Scan barcodes to quickly lookup products</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/operations/barcode/lookup')}
        >
          Manual Lookup
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scanner Section */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {scanning ? 'Camera Scanner' : 'Barcode Input'}
            </h2>

            {!scanning ? (
              // Manual Input Mode
              <div className="space-y-4">
                <form onSubmit={handleManualSubmit} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Enter Barcode or SKU
                    </label>
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Scan or enter barcode/SKU..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <Button type="submit" variant="primary" className="w-full" disabled={loading}>
                    {loading ? 'Looking up...' : 'Lookup Product'}
                  </Button>
                </form>

                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-2">Or use camera scanner</div>
                  <Button onClick={startCamera} variant="outline" className="w-full">
                    Start Camera Scanner
                  </Button>
                </div>
              </div>
            ) : (
              // Camera Mode
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-64 object-cover"
                  />
                  {/* Scanner overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="border-2 border-red-500 w-64 h-32 rounded-lg animate-pulse"></div>
                  </div>
                </div>
                
                <div className="text-center space-y-2">
                  <p className="text-sm text-gray-600">Point camera at barcode to scan</p>
                  <Button onClick={stopCamera} variant="danger" className="w-full">
                    Stop Scanner
                  </Button>
                </div>

                {/* Manual input fallback */}
                <div className="border-t pt-4">
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        lookupBarcode(barcodeInput);
                        setBarcodeInput('');
                      }
                    }}
                    placeholder="Or type barcode and press Enter..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Scan History */}
          {scanHistory.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Scans</h2>
              <div className="space-y-2">
                {scanHistory.map((item, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => setProduct(item)}
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.sku}</div>
                    </div>
                    <div className="text-sm text-gray-900">{format(item.selling_price)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-red-800 text-sm">{error}</div>
            </div>
          )}

          {product ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Found</h2>
              
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
                  <p className="text-gray-600">{product.category_name}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">SKU</label>
                    <p className="text-sm text-gray-900">{product.sku}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Barcode</label>
                    <p className="text-sm text-gray-900">{product.barcode || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Price</label>
                    <p className="text-sm font-medium text-gray-900">{format(product.selling_price)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Stock</label>
                    <p className={`text-sm font-medium ${
                      product.current_stock > 10 ? 'text-green-600' : 
                      product.current_stock > 0 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {product.current_stock} units
                    </p>
                  </div>
                </div>

                <div className="flex space-x-3 pt-4">
                  <Button variant="primary" onClick={handleAddToCart} className="flex-1">
                    Add to POS
                  </Button>
                  <Button variant="outline" onClick={handleViewProduct}>
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="text-center py-8">
                <div className="text-gray-400 text-6xl mb-4">📷</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Product Scanned</h3>
                <p className="text-gray-600">
                  {scanning 
                    ? 'Point your camera at a barcode to scan' 
                    : 'Enter a barcode or SKU to lookup a product'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                onClick={() => router.push('/dashboard/management/products/new')}
              >
                Add New Product
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.push('/dashboard/management/pos/checkout')}
              >
                Go to POS
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.push('/dashboard/management/products')}
                className="col-span-2"
              >
                View All Products
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
