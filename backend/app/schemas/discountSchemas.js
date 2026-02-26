// File: backend/app/schemas/discountSchemas.js
import Joi from 'joi';
import { log } from '../utils/logger.js';

/**
 * DISCOUNT SYSTEM VALIDATION SCHEMAS
 * Following the pattern from AccountingSchemas
 */
export class DiscountSchemas {
  
  /**
   * Line Item Schema (used in multiple places)
   */
  static lineItemSchema = Joi.object({
    id: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Line item ID must be a valid UUID',
        'any.required': 'Line item ID is required'
      }),

    amount: Joi.number()
      .positive()
      .precision(2)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
        'number.precision': 'Amount must have maximum 2 decimal places',
        'any.required': 'Amount is required'
      }),

    quantity: Joi.number()
      .integer()
      .positive()
      .default(1)
      .messages({
        'number.integer': 'Quantity must be an integer',
        'number.positive': 'Quantity must be positive'
      }),

    type: Joi.string()
      .valid('product', 'service')
      .default('service')
      .messages({
        'any.only': 'Type must be either "product" or "service"'
      })
  });

  /**
   * Calculate Discount Schema
   * POST /api/discounts/calculate
   */
  static calculateSchema = Joi.object({
    customerId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Customer ID must be a valid UUID',
        'any.required': 'Customer ID is required'
      }),

    amount: Joi.number()
      .positive()
      .precision(2)
      .messages({
        'number.positive': 'Amount must be positive',
        'number.precision': 'Amount must have maximum 2 decimal places'
      }),

    subtotal: Joi.number()
      .positive()
      .precision(2)
      .messages({
        'number.positive': 'Subtotal must be positive',
        'number.precision': 'Subtotal must have maximum 2 decimal places'
      }),

    items: Joi.array()
      .items(this.lineItemSchema)
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one line item is required',
        'any.required': 'Items are required'
      }),

    promoCode: Joi.string()
      .max(50)
      .optional()
      .messages({
        'string.max': 'Promo code must not exceed 50 characters'
      }),

    transactionDate: Joi.date()
      .iso()
      .max('now')
      .default(() => new Date().toISOString().split('T')[0])
      .messages({
        'date.max': 'Transaction date cannot be in the future',
        'date.format': 'Transaction date must be a valid date (YYYY-MM-DD)'
      }),

    transactionId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Transaction ID must be a valid UUID'
      }),

    transactionType: Joi.string()
      .valid('POS', 'INVOICE')
      .default('POS')
      .messages({
        'any.only': 'Transaction type must be either POS or INVOICE'
      }),

    createAllocation: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'createAllocation must be a boolean'
      }),

    createJournalEntries: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'createJournalEntries must be a boolean'
      }),

    previewMode: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'previewMode must be a boolean'
      }),

    preApproved: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'preApproved must be a boolean'
      })
  })
  .xor('amount', 'subtotal')
  .messages({
    'object.xor': 'Either amount or subtotal must be provided, not both'
  });

  /**
   * Preview Discounts Schema
   * POST /api/discounts/preview
   */
  static previewSchema = Joi.object({
    customerId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Customer ID must be a valid UUID',
        'any.required': 'Customer ID is required'
      }),

    amount: Joi.number()
      .positive()
      .precision(2)
      .messages({
        'number.positive': 'Amount must be positive',
        'number.precision': 'Amount must have maximum 2 decimal places'
      }),

    subtotal: Joi.number()
      .positive()
      .precision(2)
      .messages({
        'number.positive': 'Subtotal must be positive',
        'number.precision': 'Subtotal must have maximum 2 decimal places'
      }),

    items: Joi.array()
      .items(this.lineItemSchema)
      .min(1)
      .optional(),

    promoCode: Joi.string()
      .max(50)
      .optional(),

    transactionDate: Joi.date()
      .iso()
      .max('now')
      .default(() => new Date().toISOString().split('T')[0])
  })
  .xor('amount', 'subtotal');

  /**
   * Available Discounts Schema
   * GET /api/discounts/available
   */
  static availableSchema = Joi.object({
    customerId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Customer ID must be a valid UUID',
        'any.required': 'Customer ID is required'
      }),

    amount: Joi.number()
      .positive()
      .precision(2)
      .optional(),

    categoryId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Category ID must be a valid UUID'
      }),

    serviceId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Service ID must be a valid UUID'
      })
  });

  /**
   * Create Promotion Schema
   * POST /api/discounts/promotions
   */
  static createPromotionSchema = Joi.object({
    promoCode: Joi.string()
      .max(50)
      .required()
      .pattern(/^[A-Z0-9_-]+$/)
      .messages({
        'string.max': 'Promo code must not exceed 50 characters',
        'string.pattern.base': 'Promo code must contain only uppercase letters, numbers, underscore, and hyphen',
        'any.required': 'Promo code is required'
      }),

    description: Joi.string()
      .max(500)
      .optional()
      .messages({
        'string.max': 'Description must not exceed 500 characters'
      }),

    discountType: Joi.string()
      .valid('PERCENTAGE', 'FIXED')
      .required()
      .messages({
        'any.only': 'Discount type must be either PERCENTAGE or FIXED',
        'any.required': 'Discount type is required'
      }),

    discountValue: Joi.number()
      .positive()
      .precision(2)
      .required()
      .messages({
        'number.positive': 'Discount value must be positive',
        'number.precision': 'Discount value must have maximum 2 decimal places',
        'any.required': 'Discount value is required'
      })
      .when('discountType', {
        is: 'PERCENTAGE',
        then: Joi.number().max(100).messages({
          'number.max': 'Percentage discount cannot exceed 100%'
        })
      }),

    minPurchase: Joi.number()
      .positive()
      .precision(2)
      .optional()
      .messages({
        'number.positive': 'Minimum purchase must be positive'
      }),

    maxUses: Joi.number()
      .integer()
      .positive()
      .optional()
      .messages({
        'number.integer': 'Max uses must be an integer',
        'number.positive': 'Max uses must be positive'
      }),

    perCustomerLimit: Joi.number()
      .integer()
      .positive()
      .optional()
      .messages({
        'number.integer': 'Per customer limit must be an integer',
        'number.positive': 'Per customer limit must be positive'
      }),

    validFrom: Joi.date()
      .iso()
      .required()
      .messages({
        'date.format': 'Valid from must be a valid date (YYYY-MM-DD)',
        'any.required': 'Valid from date is required'
      }),

    validTo: Joi.date()
      .iso()
      .greater(Joi.ref('validFrom'))
      .required()
      .messages({
        'date.format': 'Valid to must be a valid date (YYYY-MM-DD)',
        'date.greater': 'Valid to must be after valid from',
        'any.required': 'Valid to date is required'
      }),

    isActive: Joi.boolean()
      .default(true)
      .messages({
        'boolean.base': 'isActive must be a boolean'
      })
  });

  /**
   * Update Promotion Schema
   * PUT /api/discounts/promotions/:id
   */
  static updatePromotionSchema = Joi.object({
    description: Joi.string()
      .max(500)
      .optional(),

    discountValue: Joi.number()
      .positive()
      .precision(2)
      .optional(),

    minPurchase: Joi.number()
      .positive()
      .precision(2)
      .optional(),

    maxUses: Joi.number()
      .integer()
      .positive()
      .optional(),

    perCustomerLimit: Joi.number()
      .integer()
      .positive()
      .optional(),

    validFrom: Joi.date()
      .iso()
      .optional(),

    validTo: Joi.date()
      .iso()
      .greater(Joi.ref('validFrom'))
      .optional(),

    isActive: Joi.boolean()
      .optional()
  });

  /**
   * Validate Promo Code Schema
   * POST /api/discounts/promotions/validate
   */
  static validatePromoSchema = Joi.object({
    promoCode: Joi.string()
      .max(50)
      .required()
      .messages({
        'any.required': 'Promo code is required'
      }),

    amount: Joi.number()
      .positive()
      .precision(2)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
        'any.required': 'Amount is required'
      }),

    customerId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Customer ID must be a valid UUID',
        'any.required': 'Customer ID is required'
      })
  });

  /**
   * Create Early Payment Terms Schema
   * POST /api/discounts/early-payment/terms
   */
  static earlyPaymentSchema = Joi.object({
    termName: Joi.string()
      .max(50)
      .required()
      .messages({
        'string.max': 'Term name must not exceed 50 characters',
        'any.required': 'Term name is required'
      }),

    discountPercentage: Joi.number()
      .min(0)
      .max(100)
      .precision(2)
      .required()
      .messages({
        'number.min': 'Discount percentage must be at least 0',
        'number.max': 'Discount percentage cannot exceed 100',
        'number.precision': 'Discount percentage must have maximum 2 decimal places',
        'any.required': 'Discount percentage is required'
      }),

    discountDays: Joi.number()
      .integer()
      .min(0)
      .required()
      .messages({
        'number.integer': 'Discount days must be an integer',
        'number.min': 'Discount days must be at least 0',
        'any.required': 'Discount days is required'
      }),

    netDays: Joi.number()
      .integer()
      .positive()
      .required()
      .messages({
        'number.integer': 'Net days must be an integer',
        'number.positive': 'Net days must be positive',
        'any.required': 'Net days is required'
      }),

    isActive: Joi.boolean()
      .default(true)
  });

  /**
   * Assign Payment Terms Schema
   * POST /api/discounts/early-payment/assign
   */
  static assignTermsSchema = Joi.object({
    customerId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Customer ID must be a valid UUID',
        'any.required': 'Customer ID is required'
      }),

    termId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Term ID must be a valid UUID',
        'any.required': 'Term ID is required'
      })
  });

  /**
   * Calculate Early Payment Discount Schema
   * POST /api/discounts/early-payment/calculate
   */
  static calculateEarlyPaymentSchema = Joi.object({
    invoiceId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Invoice ID must be a valid UUID',
        'any.required': 'Invoice ID is required'
      }),

    paymentDate: Joi.date()
      .iso()
      .required()
      .messages({
        'date.format': 'Payment date must be a valid date (YYYY-MM-DD)',
        'any.required': 'Payment date is required'
      })
  });

  /**
   * Create Volume Discount Tier Schema
   * POST /api/discounts/volume/tiers
   */
  static volumeDiscountSchema = Joi.object({
    tierName: Joi.string()
      .max(50)
      .required()
      .messages({
        'string.max': 'Tier name must not exceed 50 characters',
        'any.required': 'Tier name is required'
      }),

    minQuantity: Joi.number()
      .integer()
      .positive()
      .optional()
      .messages({
        'number.integer': 'Minimum quantity must be an integer',
        'number.positive': 'Minimum quantity must be positive'
      }),

    minAmount: Joi.number()
      .positive()
      .precision(2)
      .optional()
      .messages({
        'number.positive': 'Minimum amount must be positive',
        'number.precision': 'Minimum amount must have maximum 2 decimal places'
      }),

    discountPercentage: Joi.number()
      .min(0)
      .max(100)
      .precision(2)
      .required()
      .messages({
        'number.min': 'Discount percentage must be at least 0',
        'number.max': 'Discount percentage cannot exceed 100',
        'any.required': 'Discount percentage is required'
      }),

    appliesTo: Joi.string()
      .valid('ALL', 'PRODUCTS', 'SERVICES', 'CATEGORY')
      .default('ALL')
      .messages({
        'any.only': 'Applies to must be ALL, PRODUCTS, SERVICES, or CATEGORY'
      }),

    targetCategoryId: Joi.string()
      .uuid()
      .when('appliesTo', {
        is: 'CATEGORY',
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.guid': 'Target category ID must be a valid UUID'
      }),

    isActive: Joi.boolean()
      .default(true)
  })
  .or('minQuantity', 'minAmount')
  .messages({
    'object.missing': 'Either minQuantity or minAmount must be provided'
  });

  /**
   * Calculate Volume Discount Schema
   * POST /api/discounts/volume/calculate
   */
  static calculateVolumeSchema = Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          id: Joi.string().uuid().required(),
          quantity: Joi.number().integer().positive().required(),
          amount: Joi.number().positive().precision(2).required(),
          categoryId: Joi.string().uuid().optional()
        })
      )
      .min(1)
      .required(),

    quantity: Joi.number()
      .integer()
      .positive()
      .optional(),

    amount: Joi.number()
      .positive()
      .precision(2)
      .optional(),

    categoryId: Joi.string()
      .uuid()
      .optional()
  });

  /**
   * Create Allocation Schema
   * POST /api/discounts/allocations
   */
  static allocationSchema = Joi.object({
    discountRuleId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Discount rule ID must be a valid UUID'
      }),

    promotionalDiscountId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Promotional discount ID must be a valid UUID'
      }),

    invoiceId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'Invoice ID must be a valid UUID'
      }),

    posTransactionId: Joi.string()
      .uuid()
      .optional()
      .messages({
        'string.guid': 'POS transaction ID must be a valid UUID'
      }),

    totalDiscountAmount: Joi.number()
      .positive()
      .precision(2)
      .required()
      .messages({
        'number.positive': 'Total discount amount must be positive',
        'any.required': 'Total discount amount is required'
      }),

    allocationMethod: Joi.string()
      .valid('PRO_RATA_AMOUNT', 'PRO_RATA_QUANTITY', 'MANUAL')
      .required()
      .messages({
        'any.only': 'Allocation method must be PRO_RATA_AMOUNT, PRO_RATA_QUANTITY, or MANUAL',
        'any.required': 'Allocation method is required'
      }),

    status: Joi.string()
      .valid('PENDING', 'APPLIED', 'VOID')
      .default('PENDING')
      .messages({
        'any.only': 'Status must be PENDING, APPLIED, or VOID'
      }),

    lines: Joi.array()
      .items(
        Joi.object({
          lineItemId: Joi.string().uuid().required(),
          lineType: Joi.string().valid('POS', 'INVOICE').required(),
          originalAmount: Joi.number().positive().precision(2).required(),
          discountAmount: Joi.number().min(0).precision(2).required(),
          allocationWeight: Joi.number().min(0).max(1).precision(4).optional()
        })
      )
      .min(1)
      .required()
      .custom((value, helpers) => {
        // Validate sum of discount amounts equals total
        const totalDiscount = value.reduce((sum, line) => sum + line.discountAmount, 0);
        const expectedTotal = helpers.state.ancestors[0]?.totalDiscountAmount;

        if (expectedTotal && Math.abs(totalDiscount - expectedTotal) > 0.01) {
          return helpers.error('any.custom', {
            message: `Sum of line discounts (${totalDiscount}) does not equal total discount amount (${expectedTotal})`
          });
        }
        return value;
      })
  })
  .xor('discountRuleId', 'promotionalDiscountId')
  .xor('invoiceId', 'posTransactionId')
  .messages({
    'object.xor': 'Either discountRuleId or promotionalDiscountId must be provided',
    'object.xor:invoiceId': 'Either invoiceId or posTransactionId must be provided'
  });

  /**
   * Void Allocation Schema
   * POST /api/discounts/allocations/:id/void
   */
  static voidAllocationSchema = Joi.object({
    reason: Joi.string()
      .max(500)
      .required()
      .messages({
        'string.max': 'Reason must not exceed 500 characters',
        'any.required': 'Reason is required'
      })
  });

  /**
   * Approve/Reject Schema
   * POST /api/discounts/approvals/:id/approve
   * POST /api/discounts/approvals/:id/reject
   */
  static approvalDecisionSchema = Joi.object({
    approverId: Joi.string()
      .uuid()
      .required()
      .messages({
        'string.guid': 'Approver ID must be a valid UUID',
        'any.required': 'Approver ID is required'
      }),

    reason: Joi.string()
      .max(500)
      .when('$decision', {
        is: 'reject',
        then: Joi.required(),
        otherwise: Joi.optional()
      })
      .messages({
        'string.max': 'Reason must not exceed 500 characters'
      })
  });

  /**
   * Date Range Schema (for reports)
   * GET endpoints with date filters
   */
  static dateRangeSchema = Joi.object({
    startDate: Joi.date()
      .iso()
      .required()
      .messages({
        'date.format': 'Start date must be a valid date (YYYY-MM-DD)',
        'any.required': 'Start date is required'
      }),

    endDate: Joi.date()
      .iso()
      .min(Joi.ref('startDate'))
      .max('now')
      .required()
      .messages({
        'date.format': 'End date must be a valid date (YYYY-MM-DD)',
        'date.min': 'End date must be after or equal to start date',
        'date.max': 'End date cannot be in the future',
        'any.required': 'End date is required'
      })
  });

  /**
   * Pagination Schema
   */
  static paginationSchema = Joi.object({
    page: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .messages({
        'number.integer': 'Page must be an integer',
        'number.min': 'Page must be at least 1'
      }),

    limit: Joi.number()
      .integer()
      .min(1)
      .max(100)
      .default(10)
      .messages({
        'number.integer': 'Limit must be an integer',
        'number.min': 'Limit must be at least 1',
        'number.max': 'Limit cannot exceed 100'
      })
  });

  /**
   * Bulk Import Schema
   */
  static bulkImportSchema = Joi.array()
    .items(Joi.object())
    .min(1)
    .max(1000)
    .messages({
      'array.min': 'At least one item must be provided',
      'array.max': 'Cannot import more than 1000 items at once'
    });

  /**
   * Validate method (following AccountingSchemas pattern)
   */
  static validate(schema, data) {
    try {
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));

        log.warn('Discount validation failed:', { errors });
        return { valid: false, errors, value: null };
      }

      return { valid: true, errors: null, value };
    } catch (validationError) {
      log.error('Unexpected validation error:', validationError);
      return {
        valid: false,
        errors: [{ field: 'validation', message: 'Internal validation error' }],
        value: null
      };
    }
  }
}

export default DiscountSchemas;
