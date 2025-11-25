'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/week7/FormInput';
import { FormSelect } from '@/components/ui/week7/FormSelect';
import { ExpenseCategory, CreateExpenseData, ExpenseStatus } from '@/types/week7';
import { Wallet } from '@/types/week7';

interface ExpenseFormProps {
  categories: ExpenseCategory[];
  wallets: Wallet[];
  onSubmit: (data: CreateExpenseData) => Promise<void>;
  loading?: boolean;
  initialData?: Partial<CreateExpenseData>;
}

export function ExpenseForm({ 
  categories, 
  wallets, 
  onSubmit, 
  loading = false,
  initialData 
}: ExpenseFormProps) {
  const [formData, setFormData] = useState<CreateExpenseData>({
    category_id: initialData?.category_id || '',
    wallet_id: initialData?.wallet_id || '',
    amount: initialData?.amount || 0,
    description: initialData?.description || '',
    expense_date: initialData?.expense_date || new Date().toISOString().split('T')[0],
    status: initialData?.status || 'draft',
    receipt_url: initialData?.receipt_url || ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.category_id) {
      newErrors.category_id = 'Category is required';
    }

    if (!formData.wallet_id) {
      newErrors.wallet_id = 'Wallet is required';
    }

    if (!formData.amount || formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.expense_date) {
      newErrors.expense_date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Failed to submit expense:', error);
    }
  };

  const handleChange = (field: keyof CreateExpenseData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const statusOptions: Array<{ value: ExpenseStatus; label: string }> = [
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'paid', label: 'Paid' }
  ];

  return (
    <Card>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Category */}
            <FormSelect
              label="Category"
              name="category_id"
              value={formData.category_id}
              onChange={(value) => handleChange('category_id', value)}
              options={categories.map(cat => ({ value: cat.id, label: cat.name }))}
              placeholder="Select a category"
              required
              error={errors.category_id}
            />

            {/* Wallet */}
            <FormSelect
              label="Wallet"
              name="wallet_id"
              value={formData.wallet_id}
              onChange={(value) => handleChange('wallet_id', value)}
              options={wallets.map(wallet => ({ value: wallet.id, label: wallet.name }))}
              placeholder="Select a wallet"
              required
              error={errors.wallet_id}
            />

            {/* Amount */}
            <FormInput
              label="Amount"
              name="amount"
              type="number"
              value={formData.amount}
              onChange={(value) => handleChange('amount', parseFloat(value) || 0)}
              placeholder="0.00"
              required
              error={errors.amount}
            />

            {/* Date */}
            <FormInput
              label="Expense Date"
              name="expense_date"
              type="date"
              value={formData.expense_date}
              onChange={(value) => handleChange('expense_date', value)}
              required
              error={errors.expense_date}
            />
          </div>

          {/* Description */}
          <FormInput
            label="Description"
            name="description"
            value={formData.description}
            onChange={(value) => handleChange('description', value)}
            placeholder="Enter expense description"
            required
            error={errors.description}
          />

          {/* Receipt URL */}
          <FormInput
            label="Receipt URL (Optional)"
            name="receipt_url"
            value={formData.receipt_url || ''}
            onChange={(value) => handleChange('receipt_url', value)}
            placeholder="https://example.com/receipt.jpg"
          />

          {/* Status */}
          <FormSelect
            label="Status"
            name="status"
            value={formData.status}
            onChange={(value) => handleChange('status', value as ExpenseStatus)}
            options={statusOptions}
          />

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Expense'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
