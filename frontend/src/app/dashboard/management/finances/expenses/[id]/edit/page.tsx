'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { useWallets } from '@/hooks/week7/useWallets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { FormInput } from '@/components/ui/week7/FormInput';
import { FormSelect } from '@/components/ui/week7/FormSelect';
import { ExpenseStatus } from '@/types/week7';

export default function EditExpensePage() {
  const params = useParams();
  const router = useRouter();
  const { getExpenseById, categories, updateExpense, loading } = useExpenses();
  const { wallets } = useWallets();
  
  const expenseId = params.id as string;
  const expense = getExpenseById(expenseId);

  const [formData, setFormData] = useState({
    category_id: '',
    wallet_id: '',
    amount: 0,
    description: '',
    expense_date: '',
    status: 'submitted' as ExpenseStatus,
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        category_id: expense.category_id || '',
        wallet_id: expense.wallet_id || '',
        amount: expense.amount || 0,
        description: expense.description || '',
        expense_date: expense.expense_date || new Date().toISOString().split('T')[0],
        status: expense.status || 'submitted',
      });
    }
  }, [expense]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await updateExpense(expenseId, formData);
    if (result.success) {
      router.push(`/dashboard/management/finances/expenses`);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading && !expense) return <Loading />;
  if (!expense) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500">Expense not found</div>
        <Button onClick={() => router.back()} className="mt-2">
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Expense</h1>
          <p className="text-gray-600">Update expense details</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <Card>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormSelect
                label="Category"
                value={formData.category_id}
                onChange={(value) => handleChange('category_id', value)}
                options={categories.map(cat => ({ value: cat.id, label: cat.name }))}
                required
              />

              <FormSelect
                label="Wallet"
                value={formData.wallet_id}
                onChange={(value) => handleChange('wallet_id', value)}
                options={wallets.map(wallet => ({ value: wallet.id, label: wallet.name }))}
                required
              />

              <FormInput
                label="Amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(value) => handleChange('amount', parseFloat(value))}
                required
              />

              <FormInput
                label="Date"
                type="date"
                value={formData.expense_date}
                onChange={(value) => handleChange('expense_date', value)}
                required
              />
            </div>

            <FormInput
              label="Description"
              type="text"
              value={formData.description}
              onChange={(value) => handleChange('description', value)}
              required
            />

            <FormSelect
              label="Status"
              value={formData.status}
              onChange={(value) => handleChange('status', value as ExpenseStatus)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'submitted', label: 'Submitted' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'paid', label: 'Paid' },
              ]}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Updating...' : 'Update Expense'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
