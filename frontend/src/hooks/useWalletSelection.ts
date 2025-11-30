'use client';

import { useState, useEffect } from 'react';
import { Wallet } from '@/types/wallet-payment';
import { walletService } from '@/services/wallet-service';

export const useWalletSelection = () => {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWallets = async () => {
    try {
      setLoading(true);
      setError(null);
      const walletData = await walletService.getActiveWallets();
      setWallets(walletData);
    } catch (err: any) {
      setError(err.message || 'Failed to load wallets');
      console.error('Error loading wallets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWallets();
  }, []);

  const getWalletsByPaymentMethod = (paymentMethod: string): Wallet[] => {
    switch (paymentMethod) {
      case 'cash':
        return wallets.filter(w => w.wallet_type === 'cash');
      
      case 'mobile_money':
        return wallets.filter(w => 
          w.wallet_type === 'mobile_money' || 
          w.name.toLowerCase().includes('mtn') || 
          w.name.toLowerCase().includes('airtel')
        );
      
      case 'card':
        return wallets.filter(w => 
          w.wallet_type === 'card' || 
          w.wallet_type === 'bank'
        );
      
      case 'credit':
        return wallets.filter(w => w.wallet_type === 'credit');
      
      default:
        return [];
    }
  };

  const getDefaultWallet = (paymentMethod: string): Wallet | null => {
    const availableWallets = getWalletsByPaymentMethod(paymentMethod);
    
    if (availableWallets.length === 0) return null;

    // Business logic for default selection
    if (paymentMethod === 'mobile_money') {
      // Prefer MTN over Airtel if both exist
      const mtnWallet = availableWallets.find(w => 
        w.name.toLowerCase().includes('mtn')
      );
      return mtnWallet || availableWallets[0];
    }
    
    return availableWallets[0];
  };

  const refreshWallets = async () => {
    await loadWallets();
  };

  return {
    wallets,
    loading,
    error,
    getWalletsByPaymentMethod,
    getDefaultWallet,
    refreshWallets
  };
};
