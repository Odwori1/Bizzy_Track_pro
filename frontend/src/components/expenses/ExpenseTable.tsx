'use client';

import { Expense } from '@/types/week7';
import Link from 'next/link';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

interface ExpenseTableProps {
  expenses: Expense[];
  loading?: boolean;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
  onStatusUpdate?: (expenseId: string, newStatus: string) => void;
}

export function ExpenseTable({ expenses, loading = false, onEdit, onDelete, onStatusUpdate }: ExpenseTableProps) {
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      paid: 'bg-purple-100 text-purple-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateInput: any) => {
    console.log('Raw date input:', dateInput); // Debug log

    try {
      let dateString: string;

      // Handle different date input formats from backend
      if (typeof dateInput === 'string') {
        // If it's already a string, use it directly
        dateString = dateInput;
      } else if (dateInput && typeof dateInput === 'object') {
        // If it's an object with multiple date formats (current backend format)
        // Use UTC first, then fallback to other formats
        dateString = dateInput.utc || dateInput.local || dateInput.iso_local || dateInput.formatted;

        // If we still don't have a valid string, try to stringify
        if (!dateString) {
          dateString = JSON.stringify(dateInput);
        }
      } else {
        console.warn('Unexpected date format:', dateInput);
        return 'Invalid Date';
      }

      console.log('Processing date string:', dateString); // Debug log

      // Create date object
      const date = new Date(dateString);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date after parsing:', dateString);
        return 'Invalid Date';
      }

      // Format the date properly
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error, 'Date input:', dateInput);
      return 'Invalid Date';
    }
  };

  const handleStatusChange = async (expenseId: string, newStatus: string) => {
    if (onStatusUpdate) {
      await onStatusUpdate(expenseId, newStatus);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Category
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Amount
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {expenses.map((expense) => (
            <tr key={expense.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {expense.description}
                </div>
                <div className="text-sm text-gray-500">
                  {expense.wallet_name}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {expense.category_name || 'Uncategorized'}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {format(Number(expense.amount))} {/* ✅ CORRECT: Using format function */}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(expense.expense_date)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <select
                  value={expense.status}
                  onChange={(e) => handleStatusChange(expense.id, e.target.value)}
                  className={`text-xs font-semibold rounded-full px-2 py-1 border-0 focus:ring-2 focus:ring-blue-500 ${getStatusColor(expense.status)}`}
                >
                  <option value="pending">PENDING</option>
                  <option value="approved">APPROVED</option>
                  <option value="rejected">REJECTED</option>
                  <option value="paid">PAID</option>
                </select>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <Link
                  href={`/dashboard/management/finances/expenses/${expense.id}`}
                  className="text-blue-600 hover:text-blue-900"
                >
                  View
                </Link>
                <Link
                  href={`/dashboard/management/finances/expenses/${expense.id}/edit`}
                  className="text-indigo-600 hover:text-indigo-900"
                >
                  Edit
                </Link>
                {onDelete && (
                  <button
                    onClick={() => onDelete(expense)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {expenses.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No expenses found
        </div>
      )}
    </div>
  );
}
