'use client';

import React from 'react';
import Link from 'next/link';
import { useUniversalCartStore } from '@/store/universal-cart-store';
import { useCurrency } from '@/lib/currency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function UniversalCartPage() {
  const { 
    items, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    getTotalAmount,
    getTotalItems 
  } = useUniversalCartStore();
  const { format } = useCurrency();

  const totalAmount = getTotalAmount();
  const totalItems = getTotalItems();

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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'product': return '📦';
      case 'service': return '🔧';
      case 'equipment_hire': return '💼';
      case 'job_fee': return '👷';
      default: return '📝';
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Universal Cart</h1>
        </div>
        
        <Card className="p-12 text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
          <p className="text-gray-600 mb-6">Add items from any module to get started</p>
          <div className="flex justify-center space-x-4">
            <Link href="/dashboard/management/products">
              <Button>Browse Products</Button>
            </Link>
            <Link href="/dashboard/management/services">
              <Button variant="outline">Browse Services</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Universal Cart</h1>
          <p className="text-gray-600">{totalItems} items from {new Set(items.map(i => i.sourceModule)).size} modules</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={clearCart}>
            Clear Cart
          </Button>
          <Link href="/dashboard/management/products">
            <Button variant="outline">
              Continue Shopping
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map((item) => (
            <Card key={`${item.id}-${item.type}`} className="p-4">
              <div className="flex items-start space-x-4">
                {/* Item Image/Icon */}
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                  {getTypeIcon(item.type)}
                </div>
                
                {/* Item Details */}
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{item.name}</h3>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`text-xs px-2 py-1 rounded ${getTypeColor(item.type)}`}>
                          {item.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-600 capitalize">
                          {item.sourceModule}
                        </span>
                        {item.category && (
                          <span className="text-sm text-gray-600">• {item.category}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-lg">{format(item.lineTotal)}</p>
                      <p className="text-sm text-gray-600">{format(item.unitPrice)} each</p>
                    </div>
                  </div>
                  
                  {item.description && (
                    <p className="text-gray-600 text-sm mt-2">{item.description}</p>
                  )}
                  
                  {/* Module-specific metadata */}
                  {item.metadata && (
                    <div className="mt-2 text-xs text-gray-500">
                      {item.metadata.duration_minutes && (
                        <span>Duration: {item.metadata.duration_minutes} min • </span>
                      )}
                      {item.metadata.hire_duration_days && (
                        <span>Hire: {item.metadata.hire_duration_days} days • </span>
                      )}
                      {item.metadata.stock_quantity !== undefined && (
                        <span>Stock: {item.metadata.stock_quantity} • </span>
                      )}
                    </div>
                  )}
                  
                  {/* Quantity Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => handleQuantityChange(item.id, item.type, item.quantity - 1)}
                        size="sm"
                        variant="outline"
                        disabled={item.quantity <= 1}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.id, item.type, parseInt(e.target.value) || 1)}
                        className="w-16 text-center"
                        min="1"
                      />
                      <Button
                        onClick={() => handleQuantityChange(item.id, item.type, item.quantity + 1)}
                        size="sm"
                        variant="outline"
                      >
                        +
                      </Button>
                    </div>
                    <Button
                      onClick={() => removeItem(item.id, item.type)}
                      variant="destructive"
                      size="sm"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Order Summary */}
        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
            
            <div className="space-y-3 mb-4">
              {items.map(item => (
                <div key={`${item.id}-${item.type}`} className="flex justify-between text-sm">
                  <span className="truncate flex-1">
                    {item.name} 
                    <span className="text-gray-500 ml-1">×{item.quantity}</span>
                  </span>
                  <span className="ml-2 flex-shrink-0">{format(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            
            <div className="border-t pt-4">
              <div className="flex justify-between items-center font-semibold">
                <span>Total:</span>
                <span className="text-xl text-green-600">{format(totalAmount)}</span>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Link href="/dashboard/management/pos/checkout" className="block">
                <Button className="w-full" size="lg">
                  Proceed to Checkout
                </Button>
              </Link>
              
              <Link href="/dashboard/management/products">
                <Button variant="outline" className="w-full">
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </Card>

          {/* Cart Statistics */}
          <Card className="p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-lg">{getTotalItems()}</div>
                <div className="text-gray-600">Total Items</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded">
                <div className="font-semibold text-lg">{format(totalAmount)}</div>
                <div className="text-gray-600">Total Amount</div>
              </div>
            </div>
            
            {/* Module breakdown */}
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-medium text-sm mb-2">Items by Module</h4>
              {Array.from(new Set(items.map(i => i.sourceModule))).map(module => {
                const moduleItems = items.filter(i => i.sourceModule === module);
                const moduleTotal = moduleItems.reduce((sum, item) => sum + item.lineTotal, 0);
                return (
                  <div key={module} className="flex justify-between text-xs text-gray-600 mb-1">
                    <span className="capitalize">{module}:</span>
                    <span>{moduleItems.length} items • {format(moduleTotal)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
