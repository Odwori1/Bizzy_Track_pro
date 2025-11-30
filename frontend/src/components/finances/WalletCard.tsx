'use client';

import { Card } from '@/components/ui/Card';
import { Wallet } from '@/types/week7';
import { useCurrency } from '@/lib/currency';  // ✅ CORRECT IMPORT

interface WalletCardProps {
  wallet: Wallet;
  onClick?: () => void;
  showActions?: boolean;
}

export function WalletCard({ wallet, onClick, showActions = false }: WalletCardProps) {
  const { format } = useCurrency();  // ✅ CORRECT HOOK USAGE

  const getWalletTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      cash: '💰',
      bank: '🏦',
      mobile_money: '📱',
      credit_card: '💳',
      savings: '📈',
      petty_cash: '💸',
      tithe: '⛪'
    };
    return icons[type] || '💼';
  };

  const getWalletTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      cash: 'bg-green-100 text-green-800',
      bank: 'bg-blue-100 text-blue-800',
      mobile_money: 'bg-purple-100 text-purple-800',
      credit_card: 'bg-orange-100 text-orange-800',
      savings: 'bg-indigo-100 text-indigo-800',
      petty_cash: 'bg-yellow-100 text-yellow-800',
      tithe: 'bg-red-100 text-red-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${!wallet.is_active ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">{getWalletTypeIcon(wallet.wallet_type)}</div>
            <div>
              <h3 className="font-semibold text-gray-900">{wallet.name}</h3>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getWalletTypeColor(wallet.wallet_type)}`}>
                {wallet.wallet_type.replace('_', ' ')}
              </span>
            </div>
          </div>
          <div className={`text-right ${wallet.current_balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            <div className="text-xl font-bold">
              {format(wallet.current_balance)}  {/* ✅ CORRECT CURRENCY USAGE */}
            </div>
            <div className="text-sm text-gray-500">Balance</div>
          </div>
        </div>

        {wallet.description && (
          <p className="text-sm text-gray-600 mb-4">{wallet.description}</p>
        )}

        <div className="flex justify-between items-center text-sm text-gray-500">
          <span className={wallet.is_active ? 'text-green-600' : 'text-gray-400'}>
            {wallet.is_active ? 'Active' : 'Inactive'}
          </span>
          {showActions && (
            <div className="flex space-x-2">
              <button className="text-blue-600 hover:text-blue-800 text-sm">
                View
              </button>
              <button className="text-gray-600 hover:text-gray-800 text-sm">
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
