'use client';

import { Card } from '@/components/ui/Card';
import { WalletStats, ExpenseStats as ExpenseStatsType } from '@/types/week7';

interface FinancialStatsProps {
  walletStats: WalletStats | null;
  expenseStats: ExpenseStatsType | null;
  loading?: boolean;
}

export function FinancialStats({ walletStats, expenseStats, loading }: FinancialStatsProps) {
  console.log('FinancialStats props:', { walletStats, expenseStats, loading });
  
  // Safe destructuring with fallbacks
  const {
    total_balance = 0,
    total_income = 0,
    total_expenses: wallet_expenses = 0,
    wallet_count = 0
  } = walletStats || {};

  const {
    total_amount = 0,
    total_expenses: expense_count = 0,
    pending_expenses = 0,
    approved_expenses = 0
  } = expenseStats || {};

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <div className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-full mt-2"></div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const netCashFlow = total_income - wallet_expenses;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Balance</h3>
          <div className="text-2xl font-bold text-green-600 mt-2">
            ${total_balance.toLocaleString()}
          </div>
          <p className="text-sm text-gray-600 mt-1">Across {wallet_count} wallets</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Net Cash Flow</h3>
          <div className={`text-2xl font-bold mt-2 ${
            netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            ${netCashFlow.toLocaleString()}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Income: ${total_income.toLocaleString()} | Expenses: ${wallet_expenses.toLocaleString()}
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Expenses</h3>
          <div className="text-2xl font-bold text-red-600 mt-2">
            ${total_amount.toLocaleString()}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {approved_expenses} approved, {pending_expenses} pending
          </p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Wallet Status</h3>
          <div className="text-2xl font-bold text-blue-600 mt-2">
            {wallet_count}
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Active wallets tracking funds
          </p>
        </div>
      </Card>
    </div>
  );
}
