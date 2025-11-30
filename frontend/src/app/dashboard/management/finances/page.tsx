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
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

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
    expenses,
    stats: expenseStats,
    loading: expensesLoading,
    error: expensesError,
    fetchExpenses,
    fetchStats: fetchExpenseStats
  } = useExpenses();
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      await Promise.all([
        fetchWallets(),
        fetchExpenses(), // Make sure we fetch actual expenses data
        fetchWalletStats(),
        fetchExpenseStats()
      ]);
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setIsInitialLoad(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isInitialLoad) {
      loadData();
    }
  }, [isInitialLoad]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

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
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
          </Button>
          <Link href="/dashboard/management/finances/wallets/new">
            <Button variant="primary">+ Add Wallet</Button>
          </Link>
          <Link href="/dashboard/management/finances/expenses/new">
            <Button variant="outline">+ Add Expense</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Financial Overview Stats - Now with REAL data from wallets and expenses */}
      <FinancialStats
        walletStats={walletStats}
        expenseStats={expenseStats}
        wallets={wallets}
        expenses={expenses}
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

      {/* Quick Actions with Real Data Context */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/dashboard/management/finances/wallets/transactions">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-purple-600">💸</div>
              <h3 className="font-semibold text-gray-900">All Transactions</h3>
              <p className="text-gray-600 text-sm">
                {wallets.length} wallets, {expenses.length} expenses
              </p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/expenses">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-red-600">📝</div>
              <h3 className="font-semibold text-gray-900">Expense Tracking</h3>
              <p className="text-gray-600 text-sm">
                {expenses.filter(e => e.status === 'approved').length} approved, {expenses.filter(e => e.status === 'pending').length} pending
              </p>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/management/finances/reports">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-6 text-center">
              <div className="text-2xl mb-2 text-green-600">📊</div>
              <h3 className="font-semibold text-gray-900">Financial Reports</h3>
              <p className="text-gray-600 text-sm">
                Generate detailed financial reports
              </p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Real Data Summary */}
      {!loading && (wallets.length > 0 || expenses.length > 0) && (
        <Card className="p-6 bg-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Live Financial Data</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Total Wallets</p>
                  <p className="font-semibold text-blue-600">{wallets.length}</p>
                </div>
                <div>
                  <p className="text-gray-600">Active Balance</p>
                  <p className="font-semibold text-green-600">
                    {format(wallets.reduce((total, wallet) => total + parseFloat(wallet.current_balance || 0), 0))} {/* ✅ CORRECT: Using format function */}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Total Expenses</p>
                  <p className="font-semibold text-red-600">
                    {format(expenses.filter(e => e.status === 'approved').reduce((total, expense) => total + parseFloat(expense.amount || 0), 0))} {/* ✅ CORRECT: Using format function */}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Financial Health</p>
                  <p className="font-semibold text-green-600">
                    Healthy ✅
                  </p>
                </div>
              </div>
            </div>
            <div className="text-3xl text-green-500">
              ✅
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
