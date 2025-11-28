'use client';

import { useState } from 'react';
import { useProducts } from '@/hooks/week8/useProducts';
import { usePOS } from '@/hooks/week8/usePOS';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';

export const POSCheckout: React.FC = () => {
  const { products, loading: productsLoading } = useProducts();
  const { 
    cart, 
    addToCart, 
    removeFromCart, 
    updateQuantity, 
    clearCart, 
    getCartTotal, 
    processCheckout,
    loading: checkoutLoading 
  } = usePOS();
  
  const { format } = useCurrency();
  const [selectedPayment, setSelectedPayment] = useState('cash');
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  const handleCheckout = async () => {
    try {
      const result = await processCheckout(selectedPayment);
      setCheckoutSuccess(true);
      setTimeout(() => setCheckoutSuccess(false), 3000);
    } catch (error) {
      console.error('Checkout failed:', error);
    }
  };

  if (productsLoading) return <Loading />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Products List - Left Column */}
      <div className="lg:col-span-2">
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Available Products</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
              {products.map(product => (
                <div
                  key={product.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => addToCart(product)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{product.name}</h3>
                      <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                      <p className="text-xs text-gray-500">Stock: {product.current_stock}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{format(product.selling_price)}</div>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(product);
                        }}
                      >
                        Add to Cart
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Shopping Cart - Right Column */}
      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Shopping Cart</h2>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart}>
                  Clear All
                </Button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Cart is empty
                <div className="text-sm mt-2">Add products to get started</div>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {cart.map(item => (
                  <div key={item.productId} className="flex justify-between items-center border-b pb-2">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-600">{format(item.price)} each</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      >
                        +
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.productId)}
                        className="text-red-600"
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cart Total */}
            {cart.length > 0 && (
              <div className="border-t mt-4 pt-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total:</span>
                  <span>{format(getCartTotal())}</span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Payment Section */}
        {cart.length > 0 && (
          <Card>
            <div className="p-6">
              <h3 className="font-semibold mb-4">Payment Method</h3>
              <div className="space-y-2 mb-4">
                {['cash', 'card', 'mobile_money', 'credit'].map(method => (
                  <label key={method} className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="payment"
                      value={method}
                      checked={selectedPayment === method}
                      onChange={(e) => setSelectedPayment(e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="capitalize">{method.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>

              <Button
                variant="primary"
                className="w-full"
                onClick={handleCheckout}
                loading={checkoutLoading}
                disabled={cart.length === 0}
              >
                Complete Checkout - {format(getCartTotal())}
              </Button>

              {checkoutSuccess && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-center">
                  ✅ Checkout completed successfully!
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
