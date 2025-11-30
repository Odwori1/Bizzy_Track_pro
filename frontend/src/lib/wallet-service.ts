// Wallet Management Service
import { apiClient } from '@/lib/api';
import { Wallet } from '@/types/wallet-payment';

class WalletService {
  private cachedWallets: Wallet[] | null = null;
  private lastFetch: number = 0;
  private CACHE_DURATION = 30000; // 30 seconds

  async getWallets(forceRefresh: boolean = false): Promise<Wallet[]> {
    const now = Date.now();
    
    // Return cached wallets if within cache duration and not forced
    if (this.cachedWallets && !forceRefresh && (now - this.lastFetch) < this.CACHE_DURATION) {
      return this.cachedWallets;
    }

    try {
      const response = await apiClient.get<Wallet[]>('/wallets');
      this.cachedWallets = Array.isArray(response) ? response : [];
      this.lastFetch = now;
      return this.cachedWallets;
    } catch (error) {
      console.error('❌ Failed to fetch wallets:', error);
      // Return cached data if available, otherwise empty array
      return this.cachedWallets || [];
    }
  }

  async getActiveWallets(): Promise<Wallet[]> {
    const wallets = await this.getWallets();
    return wallets.filter(wallet => wallet.is_active);
  }

  async getWalletsByType(walletType: string): Promise<Wallet[]> {
    const wallets = await this.getActiveWallets();
    return wallets.filter(wallet => wallet.wallet_type === walletType);
  }

  async getWalletById(walletId: string): Promise<Wallet | null> {
    const wallets = await this.getWallets();
    return wallets.find(wallet => wallet.id === walletId) || null;
  }

  // Get wallets suitable for a specific payment method
  async getWalletsForPaymentMethod(paymentMethod: string): Promise<Wallet[]> {
    const activeWallets = await this.getActiveWallets();
    
    switch (paymentMethod) {
      case 'cash':
        return activeWallets.filter(w => w.wallet_type === 'cash');
      
      case 'mobile_money':
        return activeWallets.filter(w => 
          w.wallet_type === 'mobile_money' || 
          w.name.toLowerCase().includes('mtn') || 
          w.name.toLowerCase().includes('airtel')
        );
      
      case 'card':
        return activeWallets.filter(w => 
          w.wallet_type === 'card' || 
          w.wallet_type === 'bank'
        );
      
      case 'credit':
        return activeWallets.filter(w => w.wallet_type === 'credit');
      
      default:
        return [];
    }
  }

  // Get default wallet for a payment method based on business rules
  async getDefaultWallet(paymentMethod: string): Promise<Wallet | null> {
    const availableWallets = await this.getWalletsForPaymentMethod(paymentMethod);
    
    if (availableWallets.length === 0) return null;

    // Business logic for default selection
    if (paymentMethod === 'mobile_money') {
      // Prefer MTN over Airtel if both exist
      const mtnWallet = availableWallets.find(w => 
        w.name.toLowerCase().includes('mtn')
      );
      return mtnWallet || availableWallets[0];
    }
    
    // For other methods, return the first available wallet
    return availableWallets[0];
  }

  // Refresh wallet cache
  async refreshWallets(): Promise<void> {
    this.cachedWallets = null;
    await this.getWallets(true);
  }

  // Update wallet balance locally (for optimistic updates)
  updateLocalWalletBalance(walletId: string, amount: number, type: 'credit' | 'debit'): void {
    if (!this.cachedWallets) return;

    const walletIndex = this.cachedWallets.findIndex(w => w.id === walletId);
    if (walletIndex !== -1) {
      const updatedWallets = [...this.cachedWallets];
      if (type === 'credit') {
        updatedWallets[walletIndex].current_balance += amount;
      } else {
        updatedWallets[walletIndex].current_balance -= amount;
      }
      this.cachedWallets = updatedWallets;
    }
  }
}

// Singleton instance
export const walletService = new WalletService();
