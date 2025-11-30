'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import Link from 'next/link';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

export default function ExpenseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getExpenseById } = useExpenses();
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const expenseId = params.id as string;

  useEffect(() => {
    const loadExpense = async () => {
      try {
        // First try to get from local state
        const localExpense = getExpenseById(expenseId);
        if (localExpense) {
          setExpense(localExpense);
        } else {
          // If not found locally, you might want to fetch from API
          // For now, we'll use the local state only
          console.warn('Expense not found in local state:', expenseId);
        }
      } catch (error) {
        console.error('Error loading expense:', error);
      } finally {
        setLoading(false);
      }
    };

    loadExpense();
  }, [expenseId, getExpenseById]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid Date';

      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Invalid Date';
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      paid: 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <Loading />;
  }

  if (!expense) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expense Not Found</h1>
            <p className="text-gray-600">The requested expense could not be found.</p>
          </div>
        </div>
        <Card>
          <div className="p-6 text-center">
            <p className="text-gray-500 mb-4">Expense with ID {expenseId} was not found.</p>
            <Link href="/dashboard/management/finances/expenses">
              <Button variant="primary">Back to Expenses</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expense Details</h1>
          <p className="text-gray-600">View expense information</p>
        </div>
        <div className="flex space-x-3">
          <Link href="/dashboard/management/finances/expenses">
            <Button variant="outline">Back to Expenses</Button>
          </Link>
          <Link href={`/dashboard/management/finances/expenses/${expenseId}/edit`}>
            <Button variant="primary">Edit Expense</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expense Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Expense Information</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Description</label>
                    <p className="text-lg font-semibold text-gray-900">{expense.description}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Amount</label>
                    <p className="text-lg font-semibold text-red-600">
                      {format(Number(expense.amount))} {/* ✅ CORRECT: Using format function */}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Category</label>
                    <p className="text-gray-900">{expense.category_name || 'Uncategorized'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Wallet</label>
                    <p className="text-gray-900">{expense.wallet_name || 'Not specified'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Expense Date</label>
                    <p className="text-gray-900">{formatDate(expense.expense_date)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Status</label>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(expense.status)}`}>
                      {expense.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {expense.receipt_url && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Receipt URL</label>
                    <p className="text-gray-900">
                      <a
                        href={expense.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Receipt
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Additional Information */}
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Additional Information</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-600">Created</label>
                  <p className="text-gray-900">
                    {expense.created_at ? formatDate(expense.created_at.utc || expense.created_at) : 'Unknown'}
                  </p>
                </div>

                {expense.approved_by && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Approved By</label>
                    <p className="text-gray-900">{expense.approved_by_name || expense.approved_by}</p>
                  </div>
                )}

                {expense.approved_at && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Approved At</label>
                    <p className="text-gray-900">{formatDate(expense.approved_at)}</p>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Actions</h2>
              <div className="space-y-2">
                <Link href={`/dashboard/management/finances/expenses/${expenseId}/edit`} className="block">
                  <Button variant="outline" className="w-full justify-center">
                    Edit Expense
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-center">
                  Print Receipt
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
