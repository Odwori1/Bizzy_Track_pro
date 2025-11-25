'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallets } from '@/hooks/week7/useWallets';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FinancialStats } from '@/components/finances/FinancialStats';
import { WalletCard } from '@/components/finances/WalletCard';

export default function FinancesPage() {
  const { 
    wallets, 
    stats: walletStats, 
    loading: walletsLoading, 
    error: walletsError, 
    fetchWallets, 
    fetchStats: fetchWalletStats 
  } = useWallets();

  const { 
    stats: expenseStats, 
    loading: expensesLoading, 
    error: expensesError, 
    fetchStats: fetchExpenseStats 
  } = useExpenses();

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([
          fetchWallets(),
          fetchWalletStats(),
          fetchExpenseStats()
        ]);
      } catch (error) {
        console.error('Error loading financial data:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };

    if (isInitialLoad) {
      loadData();
    }
  }, [fetchWallets, fetchWalletStats, fetchExpenseStats, isInitialLoad]);

  const loading = (walletsLoading || expensesLoading) && isInitialLoad;
  const error = walletsError || expensesError;

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Management</h1>
          <p className="text-gray-600">Manage your business finances, wallets, and expenses</p>
        </div>
        <div className="flex space-x-3">
          <Link href="/dashboard/management/finances/wallets/new">
            <Button variant="primary">Add Wallet</Button>
          </Link>
          <Link href="/dashboard/management/finances/expenses/new">
            <Button variant="outline">Add Expense</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Financial Overview Stats */}
      <FinancialStats 
        walletStats={walletStats}
        expenseStats={expenseStats}
        loading={loading}
      />

      {/* Wallets Grid */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Wallets</h2>
          <Link href="/dashboard/management/finances/wallets">
            <Button variant="outline" size="sm">
              View All
            </Button>
          </Link>
        </div>

        {walletsLoading && !wallets.length ? (
          <div className="text-center py-8">
            <Loading />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wallets.map((wallet) => (
              <WalletCard key={wallet.id} wallet={wallet} />
            ))}
            
            {wallets.length === 0 && (
              <div className="col-span-full text-center py-8">
                <div className="text-gray-500">No wallets found</div>
                <Link href="/dashboard/management/finances/wallets/new">
                  <Button variant="primary" className="mt-2">
                    Create Your First Wallet
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/dashboard/management/finances/wallets/transactions">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">💸</div>
              <h3 className="font-semibold text-gray-900">All Transactions</h3>
              <p className="text-gray-600 text-sm">View all wallet transactions</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/expenses">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">📝</div>
              <h3 className="font-semibold text-gray-900">Expense Tracking</h3>
              <p className="text-gray-600 text-sm">Manage and track expenses</p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/reports">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2">📊</div>
              <h3 className="font-semibold text-gray-900">Financial Reports</h3>
              <p className="text-gray-600 text-sm">Generate financial reports</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
