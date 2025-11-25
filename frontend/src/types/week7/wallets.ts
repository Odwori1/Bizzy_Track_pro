export type WalletType = 'cash' | 'bank' | 'mobile_money' | 'credit_card' | 'savings' | 'petty_cash' | 'tithe';

export interface Wallet {
  id: string;
  business_id: string;
  name: string;
  wallet_type: WalletType;
  current_balance: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface WalletTransaction {
  id: string;
  business_id: string;
  wallet_id: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number;
  balance_after: number;
  description: string;
  reference_type?: string;
  reference_id?: string;
  created_by: string;
  created_at: {
    utc: string;
    local: string;
    iso_local: string;
    formatted: string;
    timestamp: number;
  };
  wallet_name?: string;
  wallet_type?: string;
}

export interface WalletStats {
  total_balance: number;
  total_wallets: number;
  active_wallets: number;
  wallet_types: Array<{
    wallet_type: string;
    type_count: number;
    type_balance: number;
  }>;
}

export interface WalletFilters {
  wallet_type?: WalletType;
  is_active?: boolean;
}

export interface TransactionFilters {
  transaction_type?: 'income' | 'expense' | 'transfer';
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export interface CreateWalletData {
  name: string;
  wallet_type: WalletType;
  current_balance: number;
  description?: string;
  is_active: boolean;
}

export interface CreateTransactionData {
  wallet_id: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  description: string;
  reference_type?: string;
  reference_id?: string;
}
