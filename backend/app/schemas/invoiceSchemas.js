import Joi from 'joi';

export const createInvoiceSchema = Joi.object({
  job_id: Joi.string().uuid().optional()
    .messages({
      'string.guid': 'Valid job ID is required'
    }),
  customer_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid customer ID is required',
      'any.required': 'Customer ID is required'
    }),
  invoice_date: Joi.date().iso().default(() => new Date().toISOString()),
  due_date: Joi.date().iso().greater(Joi.ref('invoice_date')).required()
    .messages({
      'date.greater': 'Due date must be after invoice date',
      'any.required': 'Due date is required'
    }),
  tax_rate: Joi.number().min(0).max(100).default(0),
  discount_amount: Joi.number().min(0).optional().default(0),
  notes: Joi.string().allow('').optional(),
  terms: Joi.string().allow('').optional(),
  line_items: Joi.array().items(
    Joi.object({
      service_id: Joi.string().uuid().optional(),
      description: Joi.string().min(1).max(500).required(),
      quantity: Joi.number().min(0.01).default(1),
      unit_price: Joi.number().min(0).required(),
      tax_rate: Joi.number().min(0).max(100).default(0)
    })
  ).min(1).required()
    .messages({
      'array.min': 'At least one line item is required',
      'any.required': 'Line items are required'
    })
});

export const updateInvoiceSchema = Joi.object({
  due_date: Joi.date().iso().optional(),
  tax_rate: Joi.number().min(0).max(100).optional(),
  discount_amount: Joi.number().min(0).optional(),
  notes: Joi.string().allow('').optional(),
  terms: Joi.string().allow('').optional(),
  status: Joi.string().valid('draft', 'sent', 'paid', 'overdue', 'cancelled').optional()
});

export const recordPaymentSchema = Joi.object({
  amount: Joi.number().min(0.01).required()
    .messages({
      'number.min': 'Payment amount must be greater than 0',
      'any.required': 'Payment amount is required'
    }),
  payment_method: Joi.string().valid('cash', 'bank_transfer', 'credit_card', 'mobile_money').required()
    .messages({
      'any.only': 'Payment method must be one of: cash, bank_transfer, credit_card, mobile_money',
      'any.required': 'Payment method is required'
    }),
  payment_date: Joi.date().iso().default(() => new Date().toISOString()),
  notes: Joi.string().allow('').optional()
});
