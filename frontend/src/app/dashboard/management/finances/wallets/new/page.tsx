'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallets } from '@/hooks/week7/useWallets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FormInput } from '@/components/ui/week7/FormInput';
import { FormSelect } from '@/components/ui/week7/FormSelect';

export default function NewWalletPage() {
  const router = useRouter();
  const { createWallet, loading } = useWallets();
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'cash',
    balance: 0,
    currency: 'USD',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createWallet(formData);
    if (result.success) {
      router.push('/dashboard/management/finances/wallets');
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Wallet</h1>
          <p className="text-gray-600">Add a new wallet for managing funds</p>
        </div>
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>

      <Card>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                label="Wallet Name"
                value={formData.name}
                onChange={(value) => handleChange('name', value)}
                required
                placeholder="e.g., Cash Wallet, Bank Account"
              />

              <FormSelect
                label="Wallet Type"
                value={formData.type}
                onChange={(value) => handleChange('type', value)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'bank', label: 'Bank Account' },
                  { value: 'digital', label: 'Digital Wallet' },
                  { value: 'credit', label: 'Credit Card' },
                ]}
                required
              />

              <FormInput
                label="Initial Balance"
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(value) => handleChange('balance', parseFloat(value) || 0)}
                required
              />

              <FormSelect
                label="Currency"
                value={formData.currency}
                onChange={(value) => handleChange('currency', value)}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'EUR', label: 'EUR' },
                  { value: 'GBP', label: 'GBP' },
                ]}
                required
              />
            </div>

            <FormInput
              label="Description"
              type="text"
              value={formData.description}
              onChange={(value) => handleChange('description', value)}
              placeholder="Optional description for this wallet"
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Wallet'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
