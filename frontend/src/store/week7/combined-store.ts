import { useInventoryStore } from './inventory-store';
import { useWalletStore } from './wallet-store';
import { useExpenseStore } from './expense-store';
import { useFinancialStore } from './financial-store';

export const useWeek7Store = () => {
  const inventory = useInventoryStore();
  const wallets = useWalletStore();
  const expenses = useExpenseStore();
  const financial = useFinancialStore();

  return {
    inventory,
    wallets,
    expenses,
    financial,
    
    // Combined loading state
    loading: inventory.loading || wallets.loading || expenses.loading || financial.loading,
    
    // Combined error state
    error: inventory.error || wallets.error || expenses.error || financial.error,
    
    // Combined refresh function
    refreshAll: () => {
      inventory.fetchItems();
      inventory.fetchStats();
      wallets.fetchWallets();
      wallets.fetchStats();
      expenses.fetchExpenses();
      expenses.fetchStats();
      financial.fetchFinancialReport();
    },
  };
};
