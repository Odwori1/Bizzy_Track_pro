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
