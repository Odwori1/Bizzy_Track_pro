import Joi from 'joi';

export const createExpenseCategorySchema = Joi.object({
  name: Joi.string().max(200).required(),
  description: Joi.string().max(1000).optional().allow(''),
  is_active: Joi.boolean().default(true)
});

export const updateExpenseCategorySchema = Joi.object({
  name: Joi.string().max(200).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  is_active: Joi.boolean().optional()
});

export const createExpenseSchema = Joi.object({
  category_id: Joi.string().uuid().required(),
  wallet_id: Joi.string().uuid().optional(), // Optional for pending expenses
  amount: Joi.number().precision(2).positive().required(),
  description: Joi.string().max(1000).required(),
  expense_date: Joi.date().required(),
  receipt_url: Joi.string().uri().optional().allow(''),
  status: Joi.string().valid('pending', 'approved', 'rejected', 'paid').default('pending')
});

export const updateExpenseSchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  wallet_id: Joi.string().uuid().optional(),
  amount: Joi.number().precision(2).positive().optional(),
  description: Joi.string().max(1000).optional(),
  expense_date: Joi.date().optional(),
  receipt_url: Joi.string().uri().optional().allow(''),
  status: Joi.string().valid('pending', 'approved', 'rejected', 'paid').optional()
});

export const approveExpenseSchema = Joi.object({
  status: Joi.string().valid('approved', 'rejected').required(),
  notes: Joi.string().max(1000).optional().allow('')
});

export const expenseQuerySchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'approved', 'rejected', 'paid').optional(),
  wallet_id: Joi.string().uuid().optional(),
  start_date: Joi.date().optional(),
  end_date: Joi.date().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

// Expense Payment Schema
export const payExpenseSchema = Joi.object({
  payment_method: Joi.string()
    .valid('cash', 'mobile_money', 'bank_transfer', 'card')
    .required()
    .messages({
      'any.required': 'Payment method is required',
      'string.empty': 'Payment method cannot be empty',
      'any.only': 'Payment method must be one of: cash, mobile_money, bank_transfer, card'
    }),
  reference_number: Joi.string()
    .max(100)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Reference number cannot exceed 100 characters'
    })
});
