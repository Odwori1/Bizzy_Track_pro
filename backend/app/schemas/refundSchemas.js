// File: backend/app/schemas/refundSchemas.js
// UPDATED: Added decimal place validation for fractional quantities

import Joi from 'joi';
import { log } from '../utils/logger.js';

export class RefundSchemas {

  /**
   * Custom validator for decimal places
   */
  static validateDecimalPlaces(value, maxPlaces = 4) {
    if (!value) return true;
    const decimalPlaces = (value.toString().split('.')[1] || '').length;
    return decimalPlaces <= maxPlaces;
  }

  /**
   * Refund Item Schema - Enhanced with decimal validation
   */
  static refundItemSchema = Joi.object({
    original_line_item_id: Joi.string().uuid().required(),
    original_line_type: Joi.string().valid('POS_ITEM', 'INVOICE_LINE').required(),
    product_id: Joi.string().uuid().optional().allow(null),
    service_id: Joi.string().uuid().optional().allow(null),
    item_name: Joi.string().max(200).required(),
    quantity_refunded: Joi.number()
      .positive()
      .custom((value, helpers) => {
        if (!RefundSchemas.validateDecimalPlaces(value, 4)) {
          return helpers.error('any.custom', {
            message: 'Quantity cannot have more than 4 decimal places'
          });
        }
        return value;
      })
      .required(),
    unit_price: Joi.number().positive().required(),
    subtotal_refunded: Joi.number().positive().required(),
    discount_refunded: Joi.number().min(0).default(0),
    tax_refunded: Joi.number().min(0).default(0),
    total_refunded: Joi.number().positive().required(),
    reason: Joi.string().max(500).optional().allow(null)
  });

  /**
   * Create Refund Schema - Enhanced
   */
  static createRefundSchema = Joi.object({
    original_transaction_id: Joi.string().uuid().required(),
    original_transaction_type: Joi.string().valid('POS', 'INVOICE').required(),
    refund_type: Joi.string().valid('FULL', 'PARTIAL', 'ITEM').required(),
    refund_method: Joi.string().valid('CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT_NOTE', 'MOBILE_MONEY').required(),
    subtotal_refunded: Joi.number().positive().required(),
    discount_refunded: Joi.number().min(0).default(0),
    tax_refunded: Joi.number().min(0).default(0),
    total_refunded: Joi.number().positive().required(),
    refund_reason: Joi.string().max(500).required(),
    notes: Joi.string().max(1000).optional().allow(null),
    approval_threshold: Joi.number().min(0).default(10000),
    items: Joi.array().items(this.refundItemSchema).when('refund_type', {
      is: 'ITEM',
      then: Joi.array().min(1).required(),
      otherwise: Joi.array().optional()
    })
  }).custom((value, helpers) => {
    // Validate that total matches sum of components
    const expectedTotal = value.subtotal_refunded - value.discount_refunded + value.tax_refunded;
    if (Math.abs(value.total_refunded - expectedTotal) > 0.01) {
      return helpers.error('any.custom', {
        message: `Total refunded (${value.total_refunded}) does not match calculation: subtotal (${value.subtotal_refunded}) - discount (${value.discount_refunded}) + tax (${value.tax_refunded}) = ${expectedTotal}`
      });
    }
    
    // Validate that refund amount doesn't exceed original (business logic)
    // This will be checked in the service layer with actual transaction data
    
    return value;
  });

  /**
   * Update Refund Schema (for manual updates)
   */
  static updateRefundSchema = Joi.object({
    notes: Joi.string().max(1000).optional(),
    refund_method: Joi.string().valid('CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT_NOTE', 'MOBILE_MONEY').optional(),
    refund_reason: Joi.string().max(500).optional()
  }).min(1);

  /**
   * Reject Refund Schema
   */
  static rejectRefundSchema = Joi.object({
    reason: Joi.string().max(500).required()
  });

  /**
   * Validate create refund request
   */
  static validateCreateRefund(data) {
    try {
      const { error, value } = this.createRefundSchema.validate(data, {
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

        log.warn('Refund validation failed:', { errors });
        return { valid: false, errors, value: null };
      }

      // Additional business logic validation
      if (value.refund_type === 'FULL' && value.items && value.items.length > 0) {
        // For full refund, items are optional - we can refund all items
        // This is acceptable
      }

      if (value.refund_type === 'PARTIAL' && (!value.items || value.items.length === 0)) {
        return {
          valid: false,
          errors: [{ field: 'items', message: 'Items are required for partial refund', type: 'any.required' }],
          value: null
        };
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

  /**
   * Validate update refund request
   */
  static validateUpdateRefund(data) {
    try {
      const { error, value } = this.updateRefundSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));

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

  /**
   * Validate reject refund request
   */
  static validateRejectRefund(data) {
    try {
      const { error, value } = this.rejectRefundSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type
        }));

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

export default RefundSchemas;
