import Joi from 'joi';

export const createWalletSchema = Joi.object({
  name: Joi.string().max(200).required(),
  wallet_type: Joi.string().valid(
    'cash', 'bank', 'mobile_money', 'credit_card', 'savings', 'petty_cash', 'tithe'
  ).required(),
  current_balance: Joi.number().precision(2).min(0).default(0),
  description: Joi.string().max(1000).optional().allow(''),
  is_active: Joi.boolean().default(true)
});

export const updateWalletSchema = Joi.object({
  name: Joi.string().max(200).optional(),
  wallet_type: Joi.string().valid(
    'cash', 'bank', 'mobile_money', 'credit_card', 'savings', 'petty_cash', 'tithe'
  ).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  is_active: Joi.boolean().optional()
});

export const createWalletTransactionSchema = Joi.object({
  wallet_id: Joi.string().uuid().required(),
  transaction_type: Joi.string().valid('income', 'expense', 'transfer').required(),
  amount: Joi.number().precision(2).positive().required(),
  description: Joi.string().max(1000).required(),
  reference_type: Joi.string().max(50).optional().allow(''),
  reference_id: Joi.string().uuid().optional().allow('')
});

export const transferBetweenWalletsSchema = Joi.object({
  from_wallet_id: Joi.string().uuid().required(),
  to_wallet_id: Joi.string().uuid().required(),
  amount: Joi.number().precision(2).positive().required(),
  description: Joi.string().max(1000).optional().allow('Transfer between wallets')
});

export const walletQuerySchema = Joi.object({
  wallet_type: Joi.string().valid(
    'cash', 'bank', 'mobile_money', 'credit_card', 'savings', 'petty_cash', 'tithe'
  ).optional(),
  is_active: Joi.boolean().optional()
});
