'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useExpenses } from '@/hooks/week7/useExpenses';
import { useWallets } from '@/hooks/week7/useWallets';
import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { CreateExpenseData } from '@/types/week7';
import { Loading } from '@/components/ui/Loading';

export default function NewExpensePage() {
  const router = useRouter();
  const { 
    categories, 
    loading: categoriesLoading, 
    fetchCategories,
    createExpense 
  } = useExpenses();
  
  const { 
    wallets, 
    loading: walletsLoading, 
    fetchWallets 
  } = useWallets();

  useEffect(() => {
    fetchCategories();
    fetchWallets();
  }, [fetchCategories, fetchWallets]);

  const handleSubmit = async (data: CreateExpenseData) => {
    const result = await createExpense(data);
    
    if (result.success) {
      router.push('/dashboard/management/finances/expenses');
    } else {
      alert(result.error || 'Failed to create expense');
    }
  };

  if (categoriesLoading || walletsLoading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add New Expense</h1>
          <p className="text-gray-600">Record a new business expense</p>
        </div>
      </div>

      <ExpenseForm
        categories={categories}
        wallets={wallets}
        onSubmit={handleSubmit}
        loading={categoriesLoading || walletsLoading}
      />
    </div>
  );
}
