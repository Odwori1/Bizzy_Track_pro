'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useCurrency } from '@/lib/currency';
import { apiClient } from '@/lib/api';

interface Product {
  id: string;
  name: string;
  sku: string;
  selling_price: string;
  current_stock: number;
  category_name: string;
}

interface CartItem {
  product: Product;
  quantity: number;
  total: number;
}

export default function CheckoutPage() {
  const { format } = useCurrency();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [customerPhone, setCustomerPhone] = useState('');
  const [processingSale, setProcessingSale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.get<Product[]>('/products');
      setProducts(data || []);
    } catch (err: any) {
      console.error('Failed to fetch products:', err);
      setError(err.message || 'Failed to load products');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { 
                ...item, 
                quantity: item.quantity + 1, 
                total: (item.quantity + 1) * parseFloat(product.selling_price) 
              }
            : item
        );
      }
      return [...prev, {
        product,
        quantity: 1,
        total: parseFloat(product.selling_price)
      }];
    });
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { 
              ...item, 
              quantity: newQuantity, 
              total: newQuantity * parseFloat(item.product.selling_price) 
            }
          : item
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.total, 0);
  };

  const getCartItemCount = () => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  };

  const processSale = async (paymentMethod: string) => {
    if (cart.length === 0) {
      alert('Please add items to cart before processing sale');
      return;
    }

    try {
      setProcessingSale(true);
      
      // CORRECTED: Match backend validation schema exactly
      const transactionData = {
        // Note: customer_id is optional, we're not providing it for now
        // customer_id: null, // We'd need to lookup customer by phone first
        
        // Required amounts
        total_amount: getCartTotal(),
        tax_amount: 0, // Required, default 0
        discount_amount: 0, // Required, default 0
        final_amount: getCartTotal(), // Required
        
        // Required payment info
        payment_method: paymentMethod,
        payment_status: 'completed', // Required, default 'completed'
        status: 'active', // Required, default 'completed'
        
        // Optional notes
        notes: customerPhone ? `Customer phone: ${customerPhone}` : '',
        
        // Required items array with correct structure
        items: cart.map(item => ({
          product_id: item.product.id,
          item_type: 'product', // Required: 'product' or 'service'
          item_name: item.product.name, // Required
          quantity: item.quantity, // Required
          unit_price: parseFloat(item.product.selling_price), // Required
          total_price: item.total, // Required (not line_total)
          discount_amount: 0 // Required per item, default 0
        }))
      };

      console.log('Sending transaction data:', transactionData);

      const response = await apiClient.post('/pos/transactions', transactionData);
      
      alert(`Sale completed successfully! Receipt: ${response.transaction_number}`);
      
      // Clear cart and customer info
      setCart([]);
      setCustomerPhone('');
      
      // Refresh products to update stock levels
      await fetchProducts();
      
    } catch (error: any) {
      console.error('Sale processing error:', error);
      
      if (error.status === 400) {
        alert('Sale failed: Invalid data sent to server. Please check the transaction details.');
      } else {
        alert(`Sale failed: ${error.message || 'Unknown error occurred'}`);
      }
    } finally {
      setProcessingSale(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen p-6">
      {/* Products Section */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Products</h2>

          {/* Search Bar */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800">{error}</p>
              <Button onClick={fetchProducts} variant="outline" className="mt-2">
                Retry
              </Button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="text-lg">Loading products...</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => addToCart(product)}
                >
                  <h3 className="font-semibold text-gray-900">{product.name}</h3>
                  <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                  <p className="text-lg font-bold text-gray-900 mt-2">
                    {format(product.selling_price)}
                  </p>
                  <p className="text-sm text-gray-600">Stock: {product.current_stock}</p>
                  <div className="mt-2 text-xs text-blue-600 font-medium">
                    Click to add to cart
                  </div>
                </div>
              ))}
              
              {filteredProducts.length === 0 && !loading && (
                <div className="col-span-full text-center py-8">
                  <p className="text-gray-500">
                    {searchTerm ? 'No products match your search' : 'No products available'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cart & Checkout Section */}
      <div className="space-y-4">
        {/* Cart Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Cart</h2>
            {cart.length > 0 && (
              <span className="bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded">
                {getCartItemCount()} items
              </span>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No items in cart</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {cart.map((item) => (
                <div key={item.product.id} className="flex justify-between items-center border-b pb-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{item.product.name}</h4>
                    <p className="text-sm text-gray-600">{format(item.product.selling_price)} each</p>
                    <p className="text-xs text-gray-500">SKU: {item.product.sku}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateQuantity(item.product.id, item.quantity - 1);
                      }}
                      className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-medium">{item.quantity}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateQuantity(item.product.id, item.quantity + 1);
                      }}
                      className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"
                    >
                      +
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(item.product.id);
                      }}
                      className="text-red-600 ml-2 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-medium text-gray-900">{format(item.total)}</p>
                  </div>
                </div>
              ))}

              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>{format(getCartTotal())}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Customer Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
          <input
            type="text"
            placeholder="Customer phone number (optional)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Note: Phone number will be added to transaction notes
          </p>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Process Sale</h2>
          
          {/* Process Sale Button */}
          <div className="mb-4">
            <Button 
              onClick={() => processSale('cash')} 
              disabled={cart.length === 0 || processingSale}
              className="w-full py-3 text-lg font-semibold"
            >
              {processingSale ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing Sale...
                </span>
              ) : (
                `Process Sale - ${format(getCartTotal())}`
              )}
            </Button>
          </div>

          {/* Payment Method Selection */}
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              onClick={() => processSale('cash')} 
              disabled={cart.length === 0 || processingSale}
              className="py-2"
            >
              Cash
            </Button>
            <Button 
              variant="outline" 
              onClick={() => processSale('card')} 
              disabled={cart.length === 0 || processingSale}
              className="py-2"
            >
              Card
            </Button>
            <Button 
              variant="outline" 
              onClick={() => processSale('mobile_money')} 
              disabled={cart.length === 0 || processingSale}
              className="py-2"
            >
              Mobile Money
            </Button>
            <Button 
              variant="outline" 
              onClick={() => processSale('credit')} 
              disabled={cart.length === 0 || processingSale}
              className="py-2"
            >
              Credit
            </Button>
          </div>

          {/* Sale Instructions */}
          {cart.length === 0 && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                Add products to cart to enable sale processing
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {cart.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                onClick={() => setCart([])}
                disabled={processingSale}
                className="py-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                Clear Cart
              </Button>
              <Button 
                variant="outline" 
                onClick={fetchProducts}
                disabled={processingSale}
                className="py-2"
              >
                Refresh Products
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
