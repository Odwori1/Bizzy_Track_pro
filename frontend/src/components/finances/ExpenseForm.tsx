'use client';

import { useState } from 'react';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { useWallets } from '@/hooks/week7/useWallets';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/week7/FormInput';
import { FormSelect } from '@/components/ui/week7/FormSelect';
import { CreateExpenseData, ExpenseStatus } from '@/types/week7';

interface ExpenseFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: Partial<CreateExpenseData>;
}

export function ExpenseForm({ onSuccess, onCancel, initialData }: ExpenseFormProps) {
  const { createExpense, categories, loading } = useExpenses();
  const { wallets } = useWallets();
  
  const [formData, setFormData] = useState<CreateExpenseData>({
    category_id: initialData?.category_id || '',
    wallet_id: initialData?.wallet_id || '',
    amount: initialData?.amount || 0,
    description: initialData?.description || '',
    expense_date: initialData?.expense_date || new Date().toISOString().split('T')[0],
    status: initialData?.status || 'submitted',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createExpense(formData);
    if (result.success && onSuccess) {
      onSuccess();
    }
  };

  const handleChange = (field: keyof CreateExpenseData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
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
        ]}
      />

      <div className="flex justify-end space-x-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Creating...' : 'Create Expense'}
        </Button>
      </div>
    </form>
  );
}
