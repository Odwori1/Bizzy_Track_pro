import Joi from 'joi';

export const createPOSTransactionSchema = Joi.object({
  customer_id: Joi.string().uuid().optional().allow(null),
  transaction_date: Joi.date().optional(),
  total_amount: Joi.number().precision(2).min(0).required(),
  tax_amount: Joi.number().precision(2).min(0).default(0),
  discount_amount: Joi.number().precision(2).min(0).default(0),
  final_amount: Joi.number().precision(2).min(0).required(),
  payment_method: Joi.string().valid('cash', 'card', 'mobile_money', 'credit', 'multiple').required(),
  payment_status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').default('completed'),
  status: Joi.string().valid('pending', 'completed', 'cancelled', 'refunded').default('completed'),
  notes: Joi.string().max(1000).optional().allow(''),
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().optional().allow(null),
      inventory_item_id: Joi.string().uuid().optional().allow(null),
      service_id: Joi.string().uuid().optional().allow(null),
      equipment_id: Joi.string().uuid().optional().allow(null),  // NEW: Support for equipment hire
      item_type: Joi.string().valid('product', 'service', 'equipment_hire').required(), // UPDATED: Added 'equipment_hire'
      item_name: Joi.string().max(255).required(),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().precision(2).min(0).required(),
      total_price: Joi.number().precision(2).min(0).required(),
      discount_amount: Joi.number().precision(2).min(0).default(0)
    })
  ).min(1).required()
});

export const updatePOSTransactionSchema = Joi.object({
  customer_id: Joi.string().uuid().optional().allow(null),
  payment_status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
  status: Joi.string().valid('pending', 'completed', 'cancelled', 'refunded').optional(),
  notes: Joi.string().max(1000).optional().allow('')
});

export const posQuerySchema = Joi.object({
  customer_id: Joi.string().uuid().optional(),
  payment_method: Joi.string().valid('cash', 'card', 'mobile_money', 'credit', 'multiple').optional(),
  payment_status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
  status: Joi.string().valid('pending', 'completed', 'cancelled', 'refunded').optional(),
  start_date: Joi.date().optional(),
  end_date: Joi.date().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
