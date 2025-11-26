import { useExpenseStore } from '@/store/week7';
import { CreateExpenseData, UpdateExpenseData, CreateExpenseCategoryData, UpdateExpenseCategoryData } from '@/types/week7';

export const useExpenses = () => {
  const store = useExpenseStore();

  return {
    // State
    expenses: store.expenses,
    categories: store.categories,
    stats: store.stats,
    loading: store.loading,
    error: store.error,
    filters: store.filters,

    // Actions
    setFilters: store.setFilters,
    fetchExpenses: store.fetchExpenses,
    fetchCategories: store.fetchCategories,
    fetchStats: store.fetchStats,

    // Expense CRUD Operations
    createExpense: async (data: CreateExpenseData) => {
      return await store.createExpense(data);
    },

    updateExpense: async (id: string, data: UpdateExpenseData) => {
      return await store.updateExpense(id, data);
    },

    deleteExpense: async (id: string) => {
      return await store.deleteExpense(id);
    },

    // NEW: Status update function
    updateExpenseStatus: async (expenseId: string, newStatus: string) => {
      return await store.updateExpense(expenseId, { status: newStatus });
    },

    // Category CRUD Operations - ADDING MISSING METHODS
    createCategory: async (data: CreateExpenseCategoryData) => {
      return await store.createCategory(data);
    },

    updateCategory: async (id: string, data: UpdateExpenseCategoryData) => {
      return await store.updateCategory(id, data);
    },

    deleteCategory: async (id: string) => {
      return await store.deleteCategory(id);
    },

    clearError: store.clearError,

    // Derived data
    pendingExpenses: store.expenses.filter(expense =>
      expense.status === 'pending'
    ),

    approvedExpenses: store.expenses.filter(expense =>
      expense.status === 'approved'
    ),

    totalExpensesAmount: store.expenses.reduce((total, expense) =>
      total + expense.amount, 0
    ),

    // Utility functions
    getExpenseById: (id: string) => {
      return store.expenses.find(expense => expense.id === id);
    },

    getExpensesByCategory: (categoryId: string) => {
      return store.expenses.filter(expense => expense.category_id === categoryId);
    },

    getExpensesByStatus: (status: string) => {
      return store.expenses.filter(expense => expense.status === status);
    },

    getExpensesByDateRange: (startDate: string, endDate: string) => {
      return store.expenses.filter(expense => {
        const expenseDate = new Date(expense.expense_date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return expenseDate >= start && expenseDate <= end;
      });
    }
  };
};
