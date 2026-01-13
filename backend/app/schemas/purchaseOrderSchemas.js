import Joi from 'joi';

export const createPurchaseOrderSchema = Joi.object({
  supplier_id: Joi.string().uuid().required(),
  order_date: Joi.date().required(),
  expected_delivery_date: Joi.date().optional(),
  notes: Joi.string().max(1000).optional().allow(''),
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().optional().allow(null),
      inventory_item_id: Joi.string().uuid().optional().allow(null),
      item_name: Joi.string().max(255).required(),
      quantity: Joi.number().integer().min(1).required(),
      unit_cost: Joi.number().precision(2).min(0).required(),
      total_cost: Joi.number().precision(2).min(0).required()
    })
  ).min(1).required()
});

export const updatePurchaseOrderSchema = Joi.object({
  status: Joi.string().valid('draft', 'sent', 'confirmed', 'received', 'cancelled').optional(),
  expected_delivery_date: Joi.date().optional(),
  notes: Joi.string().max(1000).optional().allow('')
});

export const purchaseOrderQuerySchema = Joi.object({
  supplier_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('draft', 'sent', 'confirmed', 'received', 'cancelled').optional(),
  start_date: Joi.date().optional(),
  end_date: Joi.date().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

// ============================================================================
// NEW: PAYMENT SCHEMAS
// ============================================================================

export const approvePurchaseOrderSchema = Joi.object({
  // No body needed, just ID in params
}).unknown(false);

export const receivePurchaseOrderSchema = Joi.object({
  // No body needed, just ID in params
}).unknown(false);

export const payPurchaseOrderSchema = Joi.object({
  amount: Joi.number().precision(2).min(0.01).required(),
  payment_method: Joi.string().valid('cash', 'bank', 'mobile_money', 'accounts_payable').required(),
  wallet_id: Joi.string().uuid().when('payment_method', {
    is: Joi.not('accounts_payable'),
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  payment_date: Joi.date().optional(),
  reference_number: Joi.string().max(100).optional(),
  notes: Joi.string().max(1000).optional().allow('')
});

export const purchaseOrderPaymentQuerySchema = Joi.object({
  start_date: Joi.date().optional(),
  end_date: Joi.date().optional(),
  payment_method: Joi.string().valid('cash', 'bank', 'mobile_money', 'accounts_payable').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
