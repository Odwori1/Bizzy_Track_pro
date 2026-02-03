import Joi from 'joi';

/**
 * PRODUCTION-READY INVOICE SCHEMAS
 *
 * Features:
 * - ✅ Supports product_id and service_id
 * - ✅ Supports tax_category_code for manual items
 * - ✅ tax_rate is optional (calculated by tax engine)
 * - ✅ Backward compatible with manual tax rates
 * - ✅ AUTO-SET DEFAULT DATES in schema validation
 */

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

  // ========== FIXED: AUTO-SET DEFAULT DATES ==========
  // invoice_date: auto-set to today if not provided
  invoice_date: Joi.date().iso()
    .default(() => {
      const today = new Date();
      return today.toISOString().split('T')[0]; // Return date-only string
    })
    .messages({
      'date.format': 'Invoice date must be in ISO format (YYYY-MM-DD)'
    }),

  // due_date: auto-set to 30 days after invoice_date
  due_date: Joi.date().iso().greater(Joi.ref('invoice_date'))
    .default((parent) => {
      const invoiceDate = new Date(parent.invoice_date);
      invoiceDate.setDate(invoiceDate.getDate() + 30);
      return invoiceDate.toISOString().split('T')[0]; // Return date-only string
    })
    .messages({
      'date.greater': 'Due date must be after invoice date',
      'date.format': 'Due date must be in ISO format (YYYY-MM-DD)'
    }),
  // ========== END FIX ==========

  tax_rate: Joi.number().min(0).max(100).optional()
    .messages({
      'number.min': 'Tax rate must be at least 0',
      'number.max': 'Tax rate cannot exceed 100'
    }),
  discount_amount: Joi.number().min(0).optional().default(0),
  notes: Joi.string().allow('').optional(),
  terms: Joi.string().allow('').optional(),

  // ✅ UPDATED: Support for products, services, and tax categories
  line_items: Joi.array().items(
    Joi.object({
      // Product or service reference (at least one should be provided for automatic tax)
      product_id: Joi.string().uuid().optional()
        .messages({
          'string.guid': 'Valid product ID is required'
        }),
      service_id: Joi.string().uuid().optional()
        .messages({
          'string.guid': 'Valid service ID is required'
        }),

      // ✅ FIXED: Make description optional if product_id or service_id is provided
      description: Joi.string().min(1).max(500)
        .when('product_id', { 
          is: Joi.exist(), 
          then: Joi.optional(), 
          otherwise: Joi.required() 
        })
        .when('service_id', { 
          is: Joi.exist(), 
          then: Joi.optional(), 
          otherwise: Joi.required() 
        })
        .messages({
          'string.min': 'Description is required',
          'string.max': 'Description cannot exceed 500 characters'
        }),

      // Quantity and price
      quantity: Joi.number().min(0.01).default(1)
        .messages({
          'number.min': 'Quantity must be greater than 0'
        }),
      unit_price: Joi.number().min(0).required()
        .messages({
          'number.min': 'Unit price must be at least 0',
          'any.required': 'Unit price is required'
        }),

      // ✅ NEW: Tax category for manual items (optional - for items without product_id/service_id)
      tax_category_code: Joi.string()
        .valid(
          'STANDARD_GOODS',
          'SERVICES',
          'PHARMACEUTICALS',
          'DIGITAL_SERVICES',
          'AGRICULTURAL',
          'ESSENTIAL_GOODS',
          'EXPORT_GOODS',
          'FINANCIAL_SERVICES',
          'EDUCATION_SERVICES'
        )
        .optional()
        .messages({
          'any.only': 'Invalid tax category code'
        }),

      // ✅ UPDATED: Tax rate is now optional (calculated automatically)
      // Only use this for manual override or legacy compatibility
      tax_rate: Joi.number().min(0).max(100).optional()
        .messages({
          'number.min': 'Tax rate must be at least 0',
          'number.max': 'Tax rate cannot exceed 100'
        })
    })
    // ✅ Custom validation: Either product_id, service_id, or tax_category_code should be provided
    .custom((value, helpers) => {
      if (!value.product_id && !value.service_id && !value.tax_category_code && value.tax_rate === undefined) {
        return helpers.message(
          'Line item must have either product_id, service_id, tax_category_code, or tax_rate'
        );
      }
      return value;
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
  status: Joi.string()
    .valid('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')
    .optional()
    .messages({
      'any.only': 'Status must be one of: draft, sent, partially_paid, paid, overdue, cancelled'
    })
});

export const recordPaymentSchema = Joi.object({
  amount: Joi.number().min(0.01).required()
    .messages({
      'number.min': 'Payment amount must be greater than 0',
      'any.required': 'Payment amount is required'
    }),
  payment_method: Joi.string()
    .valid('cash', 'bank_transfer', 'credit_card', 'mobile_money', 'cheque', 'other')
    .required()
    .messages({
      'any.only': 'Payment method must be one of: cash, bank_transfer, credit_card, mobile_money, cheque, other',
      'any.required': 'Payment method is required'
    }),
  payment_date: Joi.date().iso().default(() => new Date().toISOString()),
  notes: Joi.string().allow('').optional()
});

/**
 * ✅ NEW: Update invoice status schema
 */
export const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')
    .required()
    .messages({
      'any.only': 'Status must be one of: draft, sent, partially_paid, paid, overdue, cancelled',
      'any.required': 'Status is required'
    })
});
