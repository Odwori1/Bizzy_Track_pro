'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SellableItem, CartItem } from '@/types/sellable-item';
import { apiClient } from '@/lib/api';
import { posEngine } from '@/lib/pos-engine'; // ✅ USE SAME AS PRODUCTS

interface UniversalCartStore {
  items: CartItem[];
  addItem: (item: SellableItem) => void;
  removeItem: (id: string, type: string) => void;
  updateQuantity: (id: string, type: string, quantity: number) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalAmount: () => number;
  getItemsByType: (type: string) => CartItem[];
  validateItem: (item: SellableItem) => { isValid: boolean; errors: string[] };
  addEquipmentBookingToCart: (bookingId: string) => Promise<{ success: boolean; message: string }>;
}

export const useUniversalCartStore = create<UniversalCartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item: SellableItem) => {
        const { items, validateItem } = get();

        // Validate item before adding
        const validation = validateItem(item);
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        const existingItemIndex = items.findIndex(
          cartItem => cartItem.id === item.id && cartItem.type === item.type
        );

        if (existingItemIndex >= 0) {
          // Update quantity if item exists
          const updatedItems = [...items];
          updatedItems[existingItemIndex].quantity += item.quantity;
          updatedItems[existingItemIndex].lineTotal =
            updatedItems[existingItemIndex].unitPrice * updatedItems[existingItemIndex].quantity;
          set({ items: updatedItems });
        } else {
          // Add new item with lineTotal
          const cartItem: CartItem = {
            ...item,
            lineTotal: item.unitPrice * item.quantity,
            isAvailable: true
          };
          set({ items: [...items, cartItem] });
        }
      },

      removeItem: (id: string, type: string) => {
        const { items } = get();
        set({
          items: items.filter(item => !(item.id === id && item.type === type))
        });
      },

      updateQuantity: (id: string, type: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(id, type);
          return;
        }

        const { items } = get();
        const updatedItems = items.map(item =>
          item.id === id && item.type === type
            ? {
                ...item,
                quantity,
                lineTotal: item.unitPrice * quantity
              }
            : item
        );
        set({ items: updatedItems });
      },

      clearCart: () => set({ items: [] }),

      getTotalItems: () => {
        const { items } = get();
        return items.reduce((total, item) => total + item.quantity, 0);
      },

      getTotalAmount: () => {
        const { items } = get();
        return items.reduce((total, item) => total + (item.unitPrice * item.quantity), 0);
      },

      getItemsByType: (type: string) => {
        const { items } = get();
        return items.filter(item => item.type === type);
      },

      validateItem: (item: SellableItem): { isValid: boolean; errors: string[] } => {
        const errors: string[] = [];

        // Basic validation
        if (!item.name) errors.push('Item name is required');
        if (item.unitPrice < 0) errors.push('Price cannot be negative');
        if (item.quantity <= 0) errors.push('Quantity must be positive');

        // Module-specific validation
        switch (item.sourceModule) {
          case 'inventory':
            if (!item.metadata.product_id) errors.push('Product ID is required for inventory items');
            if (item.metadata.stock_quantity !== undefined && item.quantity > item.metadata.stock_quantity) {
              errors.push('Insufficient stock');
            }
            break;

          case 'services':
            if (!item.metadata.service_id) errors.push('Service ID is required for service items');
            break;

          case 'hire':
            // SIMPLE VALIDATION LIKE PRODUCTS
            if (!item.metadata.equipment_id) errors.push('Equipment ID is required for hire items');
            break;

          case 'jobs':
            if (!item.metadata.job_id) errors.push('Job ID is required for job items');
            break;
        }

        return {
          isValid: errors.length === 0,
          errors
        };
      },

      // ✅ FIXED: Use EXACT SAME PATTERN as products page
      addEquipmentBookingToCart: async (bookingId: string): Promise<{ success: boolean; message: string }> => {
        try {
          console.log(`🔄 Adding booking ${bookingId} to POS cart (using product pattern)...`);
          
          // 1. Fetch booking details (same as products fetch data)
          const response = await apiClient.get(`/equipment-hire/bookings/${bookingId}`);
          const booking = response.data || response;
          
          if (!booking) {
            throw new Error('Booking not found');
          }

          console.log('📋 Booking for cart:', {
            id: booking.id,
            name: booking.asset_name,
            price: booking.total_amount
          });

          // 2. Create sellable item EXACTLY like products do
          const sellableItem = {
            id: booking.id,
            type: 'equipment_hire' as const,  // Only difference from products
            sourceModule: 'hire' as const,     // Only difference from products
            name: `${booking.asset_name || 'Equipment'} Hire`,
            description: `Equipment hire booking #${booking.booking_number || booking.id.slice(-8)}`,
            unitPrice: parseFloat(booking.total_amount) || 0,
            quantity: 1,
            category: 'Equipment Hire',
            metadata: {
              // SIMPLE METADATA LIKE PRODUCTS
              equipment_id: booking.equipment_asset_id || booking.id,
              booking_id: booking.id,
              booking_number: booking.booking_number,
              // Optional: Add minimal hire info
              asset_name: booking.asset_name,
              // That's it! Keep it simple like products
            },
            business_id: booking.business_id || '' // Same as products
          };

          console.log('🛒 Created equipment item (product pattern):', sellableItem);

          // 3. ✅ USE EXACT SAME METHOD AS PRODUCTS: posEngine.addItem()
          posEngine.addItem(sellableItem);

          console.log(`✅ Added booking to cart: ${sellableItem.name}`);
          
          return {
            success: true,
            message: `Added ${booking.asset_name} hire to cart`
          };

        } catch (error: any) {
          console.error('❌ Failed to add booking to cart:', error);
          return {
            success: false,
            message: error.message || 'Failed to add booking to cart'
          };
        }
      },
    }),
    {
      name: 'universal-cart-storage',
    }
  )
);
