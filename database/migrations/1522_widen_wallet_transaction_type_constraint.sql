-- database/migrations/1522_widen_wallet_transaction_type_constraint.sql
ALTER TABLE wallet_transactions DROP CONSTRAINT wallet_transactions_transaction_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
  CHECK (transaction_type::text = ANY (ARRAY['income', 'expense', 'transfer', 'opening_balance']::text[]));
