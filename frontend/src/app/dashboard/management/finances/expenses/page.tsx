'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { ExpenseStats } from '@/components/expenses/ExpenseStats';
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
  const [searchTerm, setSearchTerm] = useState('');

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
    setSearchTerm(searchTerm);
  };

  const handleFilterChange = (newFilters: any) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    fetchExpenses(updatedFilters);
  };

  const filteredExpenses = expenses.filter(expense => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      (expense.description?.toLowerCase() || '').includes(searchLower) ||
      (expense.category_name?.toLowerCase() || '').includes(searchLower) ||
      (expense.wallet_name?.toLowerCase() || '').includes(searchLower)
    );
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        <div className="flex space-x-3">
          {/* NEW: Manage Categories Button */}
          <Link href="/dashboard/management/finances/expenses/categories">
            <Button variant="outline">Manage Categories</Button>
          </Link>
          {/* Existing Add New Expense Button */}
          <Link href="/dashboard/management/finances/expenses/new">
            <Button variant="primary">Add New Expense</Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 text-sm">{error}</div>
        </div>
      )}

      <ExpenseStats stats={stats} loading={isLoading} />

      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {filters.status || filters.category_id ? 'Filtered Expenses' : 'All Expenses'} ({filteredExpenses.length})
              {loading && <span className="text-sm text-gray-500 ml-2">Loading...</span>}
            </h2>

            <div className="flex space-x-2">
              <select
                className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.status || 'all'}
                onChange={(e) => handleFilterChange({
                  status: e.target.value === 'all' ? undefined : e.target.value
                })}
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
              </select>

              <select
                className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filters.category_id || 'all'}
                onChange={(e) => handleFilterChange({
                  category_id: e.target.value === 'all' ? undefined : e.target.value
                })}
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>

              <form onSubmit={handleSearchSubmit} className="flex">
                <Input
                  type="text"
                  placeholder="Search expenses..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-sm w-48"
                />
              </form>
            </div>
          </div>

          <ExpenseTable
            expenses={filteredExpenses}
            loading={loading}
            onDelete={handleDeleteExpense}
          />

          {filteredExpenses.length === 0 && !loading && (
            <div className="text-center py-8">
              <div className="text-gray-500 text-lg mb-2">No expenses found</div>
              <p className="text-gray-600 mb-4">
                {searchTerm || filters.status || filters.category_id ? 'Try adjusting your search or filter terms' : 'Get started by recording your first expense'}
              </p>
              {!searchTerm && !filters.status && !filters.category_id && (
                <div className="flex justify-center space-x-3">
                  <Link href="/dashboard/management/finances/expenses/categories">
                    <Button variant="outline">Manage Categories First</Button>
                  </Link>
                  <Link href="/dashboard/management/finances/expenses/new">
                    <Button variant="primary">Record Your First Expense</Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
