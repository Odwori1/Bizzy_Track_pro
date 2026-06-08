// File: backend/app/schemas/refundSchemas.js
// UPDATED: Added decimal place validation for fractional quantities
// ENHANCED: Added restock fee support and validation

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
   * Refund Item Schema - Enhanced with decimal validation and restock fee support
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
    reason: Joi.string().max(500).optional().allow(null),
    restock_fee: Joi.number().min(0).default(0),
    restock_fee_percent: Joi.number().min(0).max(100).default(0)
  });

  /**
   * Create Refund Schema - Enhanced with restock fee support
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
    restock_fee: Joi.number().min(0).default(0),
    items: Joi.array().items(this.refundItemSchema).when('refund_type', {
      is: 'ITEM',
      then: Joi.array().min(1).required(),
      otherwise: Joi.array().optional()
    })
  }).custom((value, helpers) => {
    // Validate that total matches sum of components including restock fee
    const expectedTotal = value.subtotal_refunded - value.discount_refunded + 
                          value.tax_refunded - value.restock_fee;
    if (Math.abs(value.total_refunded - expectedTotal) > 0.01) {
      return helpers.error('any.custom', {
        message: `Total refunded (${value.total_refunded}) does not match calculation: subtotal (${value.subtotal_refunded}) - discount (${value.discount_refunded}) + tax (${value.tax_refunded}) - restock_fee (${value.restock_fee}) = ${expectedTotal}`
      });
    }

    // Validate that refund amount doesn't exceed original (business logic)
    // This will be checked in the service layer with actual transaction data

    // Validate restock fee doesn't exceed subtotal after discount
    const subtotalAfterDiscount = value.subtotal_refunded - value.discount_refunded;
    if (value.restock_fee > subtotalAfterDiscount) {
      return helpers.error('any.custom', {
        message: `Restock fee (${value.restock_fee}) cannot exceed subtotal after discount (${subtotalAfterDiscount})`
      });
    }

    // Validate item-level restock fees don't exceed item totals
    if (value.items && value.items.length > 0) {
      for (let i = 0; i < value.items.length; i++) {
        const item = value.items[i];
        const itemSubtotalAfterDiscount = item.subtotal_refunded - (item.discount_refunded || 0);
        
        if (item.restock_fee > itemSubtotalAfterDiscount) {
          return helpers.error('any.custom', {
            message: `Restock fee for item ${i + 1} (${item.restock_fee}) cannot exceed item subtotal after discount (${itemSubtotalAfterDiscount})`
          });
        }

        // If restock_fee_percent is provided, calculate and validate it matches restock_fee
        if (item.restock_fee_percent > 0) {
          const calculatedRestockFee = (item.subtotal_refunded * item.restock_fee_percent) / 100;
          if (Math.abs(item.restock_fee - calculatedRestockFee) > 0.01) {
            return helpers.error('any.custom', {
              message: `Item ${i + 1}: restock_fee (${item.restock_fee}) does not match calculated from restock_fee_percent (${item.restock_fee_percent}% = ${calculatedRestockFee})`
            });
          }
        }
      }
    }

    // Validate header-level restock fee consistency
    if (value.restock_fee > 0 && value.items && value.items.length > 0) {
      const totalItemRestockFees = value.items.reduce((sum, item) => sum + (item.restock_fee || 0), 0);
      if (Math.abs(value.restock_fee - totalItemRestockFees) > 0.01) {
        return helpers.error('any.custom', {
          message: `Header restock fee (${value.restock_fee}) does not match sum of item restock fees (${totalItemRestockFees})`
        });
      }
    }

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

      // Validate restock fee business rules
      if (value.restock_fee > 0 && value.refund_type === 'FULL') {
        // Check if restock fee is within allowed percentage (business specific)
        const restockFeePercentage = (value.restock_fee / value.subtotal_refunded) * 100;
        const maxRestockFeePercent = 25; // Default max 25% - could be configurable per business
        
        if (restockFeePercentage > maxRestockFeePercent) {
          return {
            valid: false,
            errors: [{ 
              field: 'restock_fee', 
              message: `Restock fee (${value.restock_fee}) exceeds maximum allowed (${maxRestockFeePercent}% of subtotal)`, 
              type: 'restock_fee.exceeds_limit' 
            }],
            value: null
          };
        }
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

  /**
   * Calculate restock fee from percentage
   */
  static calculateRestockFee(amount, percentage) {
    if (!percentage || percentage <= 0) return 0;
    return Number((amount * percentage / 100).toFixed(2));
  }

  /**
   * Validate and calculate restock fees for a refund
   * @param {Object} refundData - Refund data with items
   * @returns {Object} Updated refund data with calculated restock fees
   */
  static applyRestockFees(refundData) {
    let totalRestockFee = 0;
    const updatedItems = [];

    if (refundData.items && refundData.items.length > 0) {
      for (const item of refundData.items) {
        let itemRestockFee = item.restock_fee || 0;
        
        // Calculate from percentage if provided and fee not explicitly set
        if (item.restock_fee_percent > 0 && (!item.restock_fee || item.restock_fee === 0)) {
          const subtotalAfterDiscount = (item.subtotal_refunded || 0) - (item.discount_refunded || 0);
          itemRestockFee = this.calculateRestockFee(subtotalAfterDiscount, item.restock_fee_percent);
        }
        
        totalRestockFee += itemRestockFee;
        updatedItems.push({
          ...item,
          restock_fee: itemRestockFee,
          total_refunded: (item.total_refunded || 0) - itemRestockFee
        });
      }
    }

    // Apply header-level restock fee if specified and not already accounted in items
    const headerRestockFee = refundData.restock_fee || 0;
    const finalRestockFee = headerRestockFee > 0 ? headerRestockFee : totalRestockFee;

    return {
      ...refundData,
      restock_fee: finalRestockFee,
      items: updatedItems.length > 0 ? updatedItems : refundData.items,
      total_refunded: (refundData.total_refunded || 0) - finalRestockFee
    };
  }
}

export default RefundSchemas;
