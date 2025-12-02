// Centralized POS Engine - Industry Standard Approach
import { apiClient } from '@/lib/api';
import { SellableItem, SaleRecord } from '@/types/sellable-item';
import { useUniversalCartStore } from '@/store/universal-cart-store';

class POSEngine {
  private cart = useUniversalCartStore;

  // Validate item based on type and module
  private validateItem(item: SellableItem): { isValid: boolean; errors: string[] } {
    return this.cart.getState().validateItem(item);
  }

  // Add item from any module
  addItem(item: SellableItem): void {
    this.cart.getState().addItem(item);
  }

  // Remove item from cart
  removeItem(itemId: string, itemType: string): void {
    this.cart.getState().removeItem(itemId, itemType);
  }

  // Update item quantity
  updateQuantity(itemId: string, itemType: string, quantity: number): void {
    this.cart.getState().updateQuantity(itemId, itemType, quantity);
  }

  // Calculate totals
  calculateTotals(): {
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  } {
    const items = this.cart.getState().items;
    const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const tax = items.reduce((sum, item) => {
      const itemTax = item.taxRate ? (item.unitPrice * item.quantity * item.taxRate) / 100 : 0;
      return sum + itemTax;
    }, 0);

    // For now, no discount logic - can be extended
    const discount = 0;
    const total = subtotal + tax - discount;

    return { subtotal, tax, discount, total };
  }

  // Transform frontend items to backend-compatible format
  private transformItemsForBackend(items: SellableItem[]) {
    return items.map(item => {
      // Base item structure that matches backend schema
      const baseItem = {
        item_type: item.type,
        item_name: item.name,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        total_price: item.unitPrice * item.quantity,
        discount_amount: 0
      };

      // Add module-specific ID based on item type
      switch (item.type) {
        case 'product':
          return {
            ...baseItem,
            product_id: item.metadata?.product_id || null,
            inventory_item_id: null,
            service_id: null,
            equipment_id: null
          };
        
        case 'service':
          return {
            ...baseItem,
            product_id: null,
            inventory_item_id: null,
            service_id: item.metadata?.service_id || null,
            equipment_id: null
          };
        
        case 'equipment_hire':
          return {
            ...baseItem,
            product_id: null,
            inventory_item_id: null,
            service_id: null,
            equipment_id: item.metadata?.equipment_id || null
            // Note: booking_id can be added if needed, but equipment_id is the key link
          };
        
        default:
          return {
            ...baseItem,
            product_id: null,
            inventory_item_id: null,
            service_id: null,
            equipment_id: null
          };
      }
    });
  }

  // Process sale - Industry standard: POS creates sale → updates modules
  async processSale(saleData: {
    customer_id?: string;
    payment_method: string;
    wallet_id: string;           // SPECIFIC wallet selected
    payment_amount: number;
    notes?: string;
  }): Promise<{ success: boolean; sale?: SaleRecord; error?: string }> {
    try {
      const totals = this.calculateTotals();
      const items = this.cart.getState().items;

      // Transform items to match backend schema
      const transformedItems = this.transformItemsForBackend(items);

      // Create sale record with backend-compatible field names
      const salePayload = {
        customer_id: saleData.customer_id,
        payment_method: saleData.payment_method,
        wallet_id: saleData.wallet_id,
        total_amount: totals.total,     // Backend expects total_amount
        tax_amount: totals.tax,
        discount_amount: totals.discount,
        final_amount: totals.total,     // Backend expects final_amount
        items: transformedItems,
        notes: saleData.notes
      };

      console.log('🔄 POS Engine: Creating sale record', salePayload);

      const response = await apiClient.post('/pos/transactions', salePayload);
      console.log('🔍 POS Engine: Raw API Response', response);

      // Handle backend response format - the transaction data is returned directly
      if (response && response.id) {
        // Clear cart on successful sale
        this.cart.getState().clearCart();

        console.log('✅ POS Engine: Sale processed successfully, modules should update automatically');
        return { success: true, sale: response };
      } else {
        const errorMessage = response?.message || 'Failed to process sale';
        console.error('❌ POS Engine: Sale processing failed', errorMessage);
        return { success: false, error: errorMessage };
      }
    } catch (error: any) {
      console.error('❌ POS Engine: Sale processing failed with error', error);
      return { success: false, error: error.message || 'Network error' };
    }
  }

  // Get current cart
  getCart(): SellableItem[] {
    return this.cart.getState().items;
  }

  // Clear cart
  clearCart(): void {
    this.cart.getState().clearCart();
  }

  // Get item count
  getItemCount(): number {
    return this.cart.getState().getTotalItems();
  }

  // Get total amount
  getTotalAmount(): number {
    return this.cart.getState().getTotalAmount();
  }
}

// Singleton instance - One POS Engine per application
export const posEngine = new POSEngine();
