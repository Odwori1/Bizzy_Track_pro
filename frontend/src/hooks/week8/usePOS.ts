import { useState } from 'react';
import { apiClient } from '@/lib/api';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export const usePOS = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const addToCart = (product: any, quantity: number = 1) => {
    setCart(current => {
      const existing = current.find(item => item.productId === product.id);
      if (existing) {
        return current.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...current, {
        productId: product.id,
        name: product.name,
        price: parseFloat(product.selling_price),
        quantity
      }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(current => current.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(current =>
      current.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => setCart([]);

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const processCheckout = async (paymentMethod: string) => {
    setLoading(true);
    try {
      const transactionData = {
        items: cart.map(item => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.price
        })),
        payment_method: paymentMethod,
        total_amount: getCartTotal()
      };

      const result = await apiClient.post('/pos/transactions', transactionData);
      clearCart();
      return result;
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    processCheckout,
    loading
  };
};
