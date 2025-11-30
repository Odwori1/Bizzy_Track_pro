'use client';

import React, { useState, useEffect } from 'react';
import { useUniversalCartStore } from '@/store/universal-cart-store';
import { useCurrency } from '@/lib/currency';
import { posEngine } from '@/lib/pos-engine';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PaymentMethodSelector } from '@/components/pos/PaymentMethodSelector';

export default function POSCheckoutPage() {
  const { 
    items, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    getTotalAmount 
  } = useUniversalCartStore();
  
  const { format } = useCurrency();
  
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [processingSale, setProcessingSale] = useState(false);
  const [saleNotes, setSaleNotes] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const totalAmount = getTotalAmount();

  const handlePaymentMethodChange = (method: string, walletId: string) => {
    setPaymentMethod(method);
    setSelectedWallet(walletId);
  };

  const handleProcessSale = async () => {
    if (!selectedWallet) {
      alert('Please select a wallet for payment');
      return;
    }

    if (items.length === 0) {
      alert('Cart is empty');
      return;
    }

    setProcessingSale(true);
    
    try {
      const result = await posEngine.processSale({
        customer_id: selectedCustomer || undefined,
        payment_method: paymentMethod,
        wallet_id: selectedWallet,
        payment_amount: totalAmount,
        notes: saleNotes
      });

      if (result.success) {
        alert('Sale processed successfully!');
        // Cart is automatically cleared by posEngine
      } else {
        alert(`Failed to process sale: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error processing sale: ${error.message}`);
    } finally {
      setProcessingSale(false);
    }
  };

  const handleQuantityChange = (id: string, type: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    updateQuantity(id, type, newQuantity);
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'product': return 'bg-green-100 text-green-800';
      case 'service': return 'bg-blue-100 text-blue-800';
      case 'equipment_hire': return 'bg-purple-100 text-purple-800';
      case 'job_fee': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">POS Checkout</h1>
            <p className="text-gray-600">Complete your transaction</p>
          </div>
        </div>
        
        <Card className="p-12 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-xl font-semibold mb-2">No items to checkout</h2>
          <p className="text-gray-600 mb-6">Add items to your cart from any module first</p>
          <div className="flex justify-center space-x-4">
            <Button onClick={() => window.history.back()}>
              Back to Cart
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/dashboard/management/products'}>
              Browse Products
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">POS Checkout</h1>
          <p className="text-gray-600">Complete your transaction</p>
        </div>
        <Button variant="outline" onClick={() => window.history.back()}>
          Back to Cart
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Customer & Payment */}
        <div className="lg:col-span-1 space-y-6">
          {/* Customer Information */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Customer Information</h2>
              <div className="space-y-4">
                <Input
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full"
                />
                
                <select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="">Walk-in Customer</option>
                  {/* Customer options would be populated from API */}
                  <option value="customer1">John Doe - +256700000001</option>
                  <option value="customer2">Jane Smith - +256700000002</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Payment Method */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Payment Method</h2>
              <PaymentMethodSelector onPaymentMethodChange={handlePaymentMethodChange} />
            </div>
          </Card>

          {/* Sale Notes */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Sale Notes</h2>
              <textarea
                value={saleNotes}
                onChange={(e) => setSaleNotes(e.target.value)}
                placeholder="Add any notes about this sale..."
                className="w-full p-3 border border-gray-300 rounded-md h-24 resize-none"
              />
            </div>
          </Card>
        </div>

        {/* Middle Column - Order Items */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Review */}
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Order Review</h2>
                <span className="text-sm text-gray-500">{items.length} items</span>
              </div>
              
              <div className="space-y-3">
                {items.map((item) => (
                  <div key={`${item.id}-${item.type}`} className="flex justify-between items-center p-4 border border-gray-200 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">{item.name}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`inline-block text-xs px-2 py-1 rounded ${getTypeColor(item.type)}`}>
                              {item.type.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-sm text-gray-600 capitalize">
                              {item.sourceModule}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{format(item.lineTotal)}</p>
                          <p className="text-sm text-gray-600">
                            {format(item.unitPrice)} × {item.quantity}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <Button
                        onClick={() => handleQuantityChange(item.id, item.type, item.quantity - 1)}
                        size="sm"
                        variant="outline"
                        disabled={item.quantity <= 1}
                      >
                        -
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button
                        onClick={() => handleQuantityChange(item.id, item.type, item.quantity + 1)}
                        size="sm"
                        variant="outline"
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Final Payment */}
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Complete Sale</h2>
              
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="flex justify-between items-center text-lg">
                    <span className="font-semibold">Total Amount:</span>
                    <span className="text-2xl font-bold text-green-600">{format(totalAmount)}</span>
                  </div>
                  
                  {selectedWallet && (
                    <div className="mt-2 text-sm text-gray-600">
                      Payment will be processed to selected wallet
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleProcessSale}
                  disabled={processingSale || !selectedWallet || items.length === 0}
                  className="w-full py-3"
                  size="lg"
                >
                  {processingSale 
                    ? 'Processing Sale...' 
                    : `Complete Sale - ${format(totalAmount)}`
                  }
                </Button>

                {!selectedWallet && (
                  <p className="text-sm text-red-600 text-center">
                    Please select a payment method and wallet to continue
                  </p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
