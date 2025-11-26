export type ExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';

export interface Expense {
  id: string;
  business_id: string;
  category_id: string;
  wallet_id: string;
  amount: number;
  description: string;
  expense_date: string | {  // Updated to handle both string and object
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  receipt_url?: string;
  status: ExpenseStatus;
  approved_by?: string;
  approved_at?: string;
  created_by: string;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at?: string;
  category_name?: string;
  wallet_name?: string;
}

export interface ExpenseCategory {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  color?: string;
  expense_count?: number;
  created_at: string;
}

export interface ExpenseStats {
  total_expenses: number;
  total_amount: number;
  pending_expenses: number;
  approved_expenses: number;
  categories_breakdown: Array<{
    category_name: string;
    total_amount: number;
    expense_count: number;
  }>;
}

export interface ExpenseFilters {
  category_id?: string;
  status?: ExpenseStatus;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateExpenseData {
  category_id: string;
  wallet_id: string;
  amount: number;
  description: string;
  expense_date: string;
  receipt_url?: string;
  status: ExpenseStatus;
}

export interface UpdateExpenseData extends Partial<CreateExpenseData> {}

// NEW: Category CRUD Data Types
export interface CreateExpenseCategoryData {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateExpenseCategoryData extends Partial<CreateExpenseCategoryData> {}
