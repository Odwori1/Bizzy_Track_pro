'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallets } from '@/hooks/week7/useWallets';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { useCurrency } from '@/lib/currency'; // ✅ CORRECT IMPORT

export default function WalletTransferPage() {
  const router = useRouter();
  const { wallets, loading, createTransaction, fetchWallets } = useWallets();
  const { format } = useCurrency(); // ✅ CORRECT HOOK USAGE

  const [formData, setFormData] = useState({
    fromWalletId: '',
    toWalletId: '',
    amount: '',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Validate form
      if (!formData.fromWalletId || !formData.toWalletId || !formData.amount) {
        setError('Please fill in all required fields');
        return;
      }

      if (formData.fromWalletId === formData.toWalletId) {
        setError('Cannot transfer to the same wallet');
        return;
      }

      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        setError('Please enter a valid amount');
        return;
      }

      // Find from wallet to check balance
      const fromWallet = wallets.find(w => w.id === formData.fromWalletId);
      if (fromWallet && parseFloat(fromWallet.current_balance) < amount) {
        setError('Insufficient balance in source wallet');
        return;
      }

      // Create transfer transaction
      await createTransaction({
        wallet_id: formData.fromWalletId,
        transaction_type: 'expense',
        amount: amount,
        description: formData.description || `Transfer to ${wallets.find(w => w.id === formData.toWalletId)?.name}`,
        reference_type: 'wallet_transfer',
        reference_id: formData.toWalletId
      });

      // Create receiving transaction
      await createTransaction({
        wallet_id: formData.toWalletId,
        transaction_type: 'income',
        amount: amount,
        description: formData.description || `Transfer from ${wallets.find(w => w.id === formData.fromWalletId)?.name}`,
        reference_type: 'wallet_transfer',
        reference_id: formData.fromWalletId
      });

      // Redirect to transactions page
      router.push('/dashboard/management/finances/wallets/transactions');

    } catch (err: any) {
      setError(err.message || 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transfer Between Wallets</h1>
          <p className="text-gray-600">Move funds between your business wallets</p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/dashboard/management/finances/wallets/transactions')}
        >
          View Transactions
        </Button>
      </div>

      <Card className="max-w-2xl">
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <div className="text-red-800 text-sm">{error}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* From Wallet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Wallet *
                </label>
                <select
                  name="fromWalletId"
                  value={formData.fromWalletId}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select source wallet</option>
                  {wallets.filter(w => w.is_active).map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} - {format(parseFloat(wallet.current_balance))} {/* ✅ CORRECT: Using format function */}
                    </option>
                  ))}
                </select>
              </div>

              {/* To Wallet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Wallet *
                </label>
                <select
                  name="toWalletId"
                  value={formData.toWalletId}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select destination wallet</option>
                  {wallets
                    .filter(w => w.is_active && w.id !== formData.fromWalletId)
                    .map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name} - {format(parseFloat(wallet.current_balance))} {/* ✅ CORRECT: Using format function */}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount *
              </label>
              <Input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Optional description for this transfer"
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Current Balances */}
            {(formData.fromWalletId || formData.toWalletId) && (
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Current Balances:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {formData.fromWalletId && (
                    <div>
                      <span className="font-medium">From:</span>{' '}
                      {wallets.find(w => w.id === formData.fromWalletId)?.name} - 
                      {format(parseFloat(wallets.find(w => w.id === formData.fromWalletId)?.current_balance || '0'))} {/* ✅ CORRECT: Using format function */}
                    </div>
                  )}
                  {formData.toWalletId && (
                    <div>
                      <span className="font-medium">To:</span>{' '}
                      {wallets.find(w => w.id === formData.toWalletId)?.name} - 
                      {format(parseFloat(wallets.find(w => w.id === formData.toWalletId)?.current_balance || '0'))} {/* ✅ CORRECT: Using format function */}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="submit"
                variant="primary"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Processing Transfer...' : 'Transfer Funds'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard/management/finances/wallets')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
