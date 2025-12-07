export interface FinancialReport {
  summary: {
    total_income: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
  };
  income_breakdown: Array<{
    total_income: string;
    transaction_count: string;
    wallet_type: string;
    month: string;
    year: string;
  }>;
  expense_breakdown: Array<{
    total_expenses: string;
    expense_count: string;
    category_name: string;
    month: string;
    year: string;
  }>;
  wallet_balances: Array<{
    name: string;
    wallet_type: string;
    current_balance: string;
  }>;
  period: {
    start_date?: string;
    end_date?: string;
  };
}

export interface ProfitLossReport {
  revenue: {
    total_income: number;
    breakdown: any[];
  };
  expenses: {
    total_expenses: number;
    breakdown: any[];
  };
  net_profit: number;
  profit_margin: number;
  period: {
    start_date: string;
    end_date: string;
  };
}

export interface CashFlowReport {
  period: string;
  total_income: string;
  total_expenses: string;
  net_cash_flow: string;
}

export interface BalanceSheet {
  assets: {
    current_assets: {
      cash_and_equivalents: number;
      accounts_receivable: number;
      inventory: number;
      total_current_assets: number;
    };
    fixed_assets: {
      property_equipment: number;
      total_fixed_assets: number;
    };
    total_assets: number;
  };
  liabilities: {
    current_liabilities: {
      accounts_payable: number;
      short_term_debt: number;
      total_current_liabilities: number;
    };
    long_term_liabilities: {
      long_term_debt: number;
      total_long_term_liabilities: number;
    };
    total_liabilities: number;
  };
  equity: {
    retained_earnings: number;
    common_stock: number;
    total_equity: number;
  };
  verification: {
    total_assets: number;
    total_liabilities_and_equity: number;
    balanced: boolean;
  };
  period: {
    start_date: string;
    end_date: string;
    as_of_date: string;
  };
}

export interface TitheCalculation {
  enabled: boolean;
  calculation_basis: string;
  net_profit: number;
  tithe_percentage: number;
  tithe_amount: number;
  period: {
    start_date?: string;
    end_date?: string;
  };
  financial_summary?: {
    total_income: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
  };
}

export interface ReportFilters {
  start_date: string;
  end_date: string;
}

// NEW: Quick Reports Types
export interface MonthlySummary {
  current_month: {
    income: number;
    expenses: number;
    net_profit: number;
    profit_margin: number;
  };
  previous_month: {
    income: number;
    expenses: number;
    net_profit: number;
    profit_margin: number;
  };
  trends: {
    income: number;
    expenses: number;
    profit: number;
  };
  period: {
    current_month: string;
    previous_month: string;
  };
}

export interface ExpenseCategory {
  category: string;
  amount: number;
  count: number;
  average: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  amount: number;
}

export interface ExpenseAnalysis {
  categories: ExpenseCategory[];
  summary: {
    total_expenses: number;
    category_count: number;
    average_per_category: number;
  };
  trends: {
    monthly: MonthlyTrend[];
  };
  period: {
    start_date: string;
    end_date: string;
  };
}

export interface RevenueSource {
  source: string;
  amount: number;
  count: number;
  average: number;
  percentage: number;
}

export interface RevenueTrend {
  month: string;
  revenue: number;
}

export interface RevenueReport {
  sources: RevenueSource[];
  summary: {
    total_revenue: number;
    source_count: number;
    average_per_source: number;
  };
  trends: {
    monthly: RevenueTrend[];
  };
  period: {
    start_date: string;
    end_date: string;
  };
}

// ============================================
// ACCOUNTING SYSTEM TYPES
// ============================================

export interface JournalEntryLine {
  id: string;
  business_id: string;
  journal_entry_id: string;
  account_id: string;
  line_type: 'debit' | 'credit';
  amount: string; // Note: Backend returns as string
  description: string;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  account_code: string;
  account_name: string;
  account_type: string;
}

export interface JournalEntry {
  id: string;
  business_id: string;
  journal_date: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  reference_number: string;
  reference_type: 'pos_transaction' | 'expense' | 'manual';
  reference_id: string;
  description: string;
  total_amount: string; // Note: Backend returns as string
  status: string;
  created_by: string;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  updated_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  posted_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  voided_at: any;
  migration_batch_id: any;
  migration_source_table: any;
  migration_source_id: any;
  created_by_name: string;
  lines: JournalEntryLine[];
  line_count: number;
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
}

export interface JournalEntriesResponse {
  entries: JournalEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AccountingProfitLoss {
  period: {
    start_date: string;
    end_date: string;
  };
  revenue: {
    total: number;
    breakdown: Array<{
      account_code: string;
      account_name: string;
      amount: number;
    }>;
  };
  cogs: {
    total: number;
    breakdown: Array<{
      account_code: string;
      account_name: string;
      amount: number;
    }>;
  };
  operating_expenses: {
    total: number;
    breakdown: Array<{
      account_code: string;
      account_name: string;
      amount: number;
    }>;
  };
  gross_profit: number;
  gross_margin: number;
  net_profit: number;
  net_margin: number;
  _metadata: {
    journal_entry_count: number;
    transaction_count: number;
    data_source: string;
  };
}

export interface TrialBalance {
  // We'll add this later when we implement trial balance
}

export interface GeneralLedger {
  // We'll add this later when we implement general ledger
}
