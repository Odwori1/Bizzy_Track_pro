// Enhanced Payment & Wallet Types
export interface PaymentRecord {
  id: string;
  sale_id: string;
  business_id: string;
  amount: number;
  payment_method: string;        // cash, mobile_money, card, credit
  wallet_id: string;             // SPECIFIC wallet used
  wallet_name: string;           // For reporting
  wallet_type: string;           // cash, mobile_money, card, credit
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  transaction_reference?: string;
  processed_by: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  business_id: string;
  name: string;
  wallet_type: 'cash' | 'mobile_money' | 'card' | 'bank' | 'credit';
  current_balance: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethodConfig {
  method: string;                // cash, mobile_money, card, credit
  label: string;                 // "Cash", "Mobile Money", "Card", "Credit"
  wallets: Wallet[];             // Available wallets for this method
  default_wallet_id?: string;    // Default wallet for this method
}
