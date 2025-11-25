'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { ExpenseStats } from '@/components/expenses/ExpenseStats';
import { FilterBar } from '@/components/ui/week7/FilterBar';
import { Loading } from '@/components/ui/Loading';

export default function ExpensesPage() {
  const {
    expenses,
    categories,
    stats,
    loading,
    error,
    filters,
    setFilters,
    fetchExpenses,
    fetchCategories,
    fetchStats,
    deleteExpense
  } = useExpenses();

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([
          fetchExpenses(),
          fetchCategories(),
          fetchStats()
        ]);
      } catch (error) {
        console.error('Error loading expense data:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };

    if (isInitialLoad) {
      loadData();
    }
  }, [fetchExpenses, fetchCategories, fetchStats, isInitialLoad]);

  const handleSearch = (searchTerm: string) => {
    setFilters({ ...filters, search: searchTerm });
    // Manually trigger fetch after setting filters
    fetchExpenses({ ...filters, search: searchTerm });
  };

  const handleFilterChange = (newFilters: any) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    // Manually trigger fetch after setting filters
    fetchExpenses(updatedFilters);
  };

  const handleDeleteExpense = async (expense: any) => {
    if (confirm(`Are you sure you want to delete expense: "${expense.description}"?`)) {
      await deleteExpense(expense.id);
    }
  };

  const isLoading = loading && isInitialLoad;

  if (isLoading && expenses.length === 0) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-gray-600">Track and manage business expenses</p>
        </div>
        <Link href="/dashboard/management/finances/expenses/new">
          <Button variant="primary">Add New Expense</Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      {/* Expense Statistics - Safe to pass null stats */}
      <ExpenseStats stats={stats} loading={isLoading} />

      {/* Filters */}
      <FilterBar
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
        filters={filters}
        filterOptions={{
          statuses: ['draft', 'submitted', 'approved', 'rejected', 'paid'],
          categories: categories
        }}
        placeholder="Search expenses by description..."
      />

      {/* Expenses Table */}
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              All Expenses ({expenses.length})
            </h2>
          </div>

          <ExpenseTable
            expenses={expenses}
            loading={loading}
            onDelete={handleDeleteExpense}
          />

          {expenses.length === 0 && !loading && (
            <div className="text-center py-8">
              <div className="text-gray-500 text-lg mb-2">No expenses found</div>
              <p className="text-gray-600 mb-4">
                {filters.search ? 'Try adjusting your search terms' : 'Get started by recording your first expense'}
              </p>
              {!filters.search && (
                <Link href="/dashboard/management/finances/expenses/new">
                  <Button variant="primary">Record Your First Expense</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
