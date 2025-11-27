'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useWallets } from '@/hooks/week7/useWallets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WalletCard } from '@/components/finances/WalletCard';
import { Loading } from '@/components/ui/Loading';

export default function WalletsPage() {
  const {
    wallets,
    stats,
    loading,
    error,
    fetchWallets,
    fetchStats
  } = useWallets();

  useEffect(() => {
    fetchWallets();
    fetchStats();
  }, [fetchWallets, fetchStats]);

  if (loading && wallets.length === 0) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Money Wallets</h1>
          <p className="text-gray-600">Manage your business money wallets</p>
        </div>
        <div className="flex space-x-3">
          <Link href="/dashboard/management/finances/wallets/transfer">
            <Button variant="outline">Transfer Funds</Button>
          </Link>
          <Link href="/dashboard/management/finances/wallets/new">
            <Button variant="primary">Add New Wallet</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Quick Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Total Balance</h3>
              <div className="text-2xl font-bold text-green-600 mt-2">
                ${stats.total_balance.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600">Across all wallets</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Active Wallets</h3>
              <div className="text-2xl font-bold mt-2">{stats.active_wallets}</div>
              <p className="text-sm text-gray-600">of {stats.total_wallets} total</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-600">Wallet Types</h3>
              <div className="text-2xl font-bold mt-2">{stats.wallet_types.length}</div>
              <p className="text-sm text-gray-600">Different types</p>
            </div>
          </Card>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex space-x-4">
        <Link href="/dashboard/management/finances/wallets/transactions">
          <Button variant="secondary">
            View All Transactions
          </Button>
        </Link>
        <Link href="/dashboard/management/finances/wallets/transfer">
          <Button variant="secondary">
            Transfer Between Wallets
          </Button>
        </Link>
      </div>

      {/* Wallets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {wallets.map((wallet) => (
          <WalletCard
            key={wallet.id}
            wallet={wallet}
            onClick={() => window.location.href = `/dashboard/management/finances/wallets/${wallet.id}`}
            showActions
          />
        ))}
      </div>

      {wallets.length === 0 && !loading && (
        <Card className="text-center py-12">
          <div className="text-gray-500 text-lg mb-4">No wallets found</div>
          <p className="text-gray-600 mb-6">
            Get started by creating your first money wallet to track your business finances
          </p>
          <Link href="/dashboard/management/finances/wallets/new">
            <Button variant="primary">Create Your First Wallet</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
