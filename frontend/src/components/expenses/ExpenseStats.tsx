'use client';

import { Card } from '@/components/ui/Card';
import { ExpenseStats as ExpenseStatsType } from '@/types/week7';

interface ExpenseStatsProps {
  stats: ExpenseStatsType | null;
  loading?: boolean;
}

// Helper function to extract stats from API response
const extractStats = (stats: ExpenseStatsType | null) => {
  if (!stats) {
    return { totalExpenses: 0, totalAmount: 0, pendingExpenses: 0, approvedExpenses: 0 };
  }

  // Check if we have the new API structure with totals and by_category
  if (stats.totals && stats.by_category) {
    const totalExpenses = parseInt(stats.totals.total_count || '0');
    const totalAmount = parseFloat(stats.totals.total_amount || '0');
    
    const pendingExpenses = stats.by_category.reduce((sum, category) => 
      sum + parseInt(category.pending_expenses || '0'), 0);
    
    const approvedExpenses = stats.by_category.reduce((sum, category) => 
      sum + parseInt(category.approved_expenses || '0'), 0);

    return { totalExpenses, totalAmount, pendingExpenses, approvedExpenses };
  }

  // Fallback to old structure
  return {
    totalExpenses: stats.total_expenses || 0,
    totalAmount: stats.total_amount || 0,
    pendingExpenses: stats.pending_expenses || 0,
    approvedExpenses: stats.approved_expenses || 0
  };
};

export function ExpenseStats({ stats, loading = false }: ExpenseStatsProps) {
  const { totalExpenses, totalAmount, pendingExpenses, approvedExpenses } = extractStats(stats);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Expenses</h3>
          <div className="text-2xl font-bold mt-2">{totalExpenses}</div>
          <p className="text-sm text-gray-600">All expenses</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Total Amount</h3>
          <div className="text-2xl font-bold text-red-600 mt-2">
            ${totalAmount.toLocaleString()}
          </div>
          <p className="text-sm text-gray-600">Total spent</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Pending</h3>
          <div className="text-2xl font-bold text-yellow-600 mt-2">{pendingExpenses}</div>
          <p className="text-sm text-gray-600">Awaiting approval</p>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-600">Approved</h3>
          <div className="text-2xl font-bold text-green-600 mt-2">{approvedExpenses}</div>
          <p className="text-sm text-gray-600">Ready for payment</p>
        </div>
      </Card>
    </div>
  );
}
