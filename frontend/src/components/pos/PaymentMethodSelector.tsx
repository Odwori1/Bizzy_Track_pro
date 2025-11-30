'use client';

import React, { useState, useEffect } from 'react';
import { useWalletSelection } from '@/hooks/useWalletSelection';
import { useCurrency } from '@/lib/currency';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export const PaymentMethodSelector: React.FC<{
  onPaymentMethodChange: (method: string, walletId: string) => void;
}> = ({ onPaymentMethodChange }) => {
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const { getWalletsByPaymentMethod, getDefaultWallet, loading } = useWalletSelection();
  const { format } = useCurrency();

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: '💵' },
    { value: 'mobile_money', label: 'Mobile Money', icon: '📱' },
    { value: 'card', label: 'Card/Bank', icon: '💳' },
    { value: 'credit', label: 'Credit', icon: '📝' }
  ];

  const availableWallets = getWalletsByPaymentMethod(selectedMethod);

  useEffect(() => {
    // Set default wallet when payment method changes
    const defaultWallet = getDefaultWallet(selectedMethod);
    if (defaultWallet) {
      setSelectedWallet(defaultWallet.id);
      onPaymentMethodChange(selectedMethod, defaultWallet.id);
    }
  }, [selectedMethod]);

  const handleMethodChange = (method: string) => {
    setSelectedMethod(method);
  };

  const handleWalletChange = (walletId: string) => {
    setSelectedWallet(walletId);
    onPaymentMethodChange(selectedMethod, walletId);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Payment Method</label>
        <div className="grid grid-cols-2 gap-2">
          {paymentMethods.map(method => (
            <button
              key={method.value}
              type="button"
              onClick={() => handleMethodChange(method.value)}
              className={`p-3 border rounded-lg text-center transition-colors ${
                selectedMethod === method.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="text-2xl mb-1">{method.icon}</div>
              <div className="text-sm font-medium">{method.label}</div>
            </button>
          ))}
        </div>
      </div>

      {availableWallets.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Select {selectedMethod === 'mobile_money' ? 'Mobile Money' : selectedMethod} Wallet
          </label>
          <select
            value={selectedWallet}
            onChange={(e) => handleWalletChange(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg"
          >
            {availableWallets.map(wallet => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} - {format(wallet.current_balance)}
              </option>
            ))}
          </select>
          
          {/* Wallet balances summary */}
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {availableWallets.map(wallet => (
              <div 
                key={wallet.id}
                className={`p-2 rounded ${
                  selectedWallet === wallet.id 
                    ? 'bg-blue-100 border border-blue-300' 
                    : 'bg-gray-100'
                }`}
              >
                <div className="font-medium truncate">{wallet.name}</div>
                <div className="text-green-600">{format(wallet.current_balance)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableWallets.length === 0 && !loading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            No active wallets found for {selectedMethod} payments.
            Please create a wallet for this payment method in the wallet management section.
          </p>
        </div>
      )}
    </div>
  );
};
