// File: backend/app/schemas/accountingSchemas.js
import Joi from 'joi';
import { log } from '../utils/logger.js';

/**
 * GAAP-COMPLIANT ACCOUNTING VALIDATION SCHEMAS
 * CORRECTED: Uses line_type instead of normal_balance to match actual database schema
 */
export class AccountingSchemas {
  /**
   * Journal Entry Line Validation
   * CORRECTED: Uses line_type not normal_balance
   */
  static journalEntryLineSchema = Joi.object({
    account_code: Joi.string()
      .pattern(/^\d{4}$/)
      .required()
      .messages({
        'string.pattern.base': 'Account code must be a 4-digit number (e.g., 1110, 4100)',
        'any.required': 'Account code is required'
      }),

    description: Joi.string()
      .max(500)
      .required()
      .messages({
        'string.max': 'Description must not exceed 500 characters',
        'any.required': 'Description is required'
      }),

    amount: Joi.number()
      .positive()
      .precision(4)
      .required()
      .messages({
        'number.positive': 'Amount must be positive',
        'number.precision': 'Amount must have maximum 4 decimal places',
        'any.required': 'Amount is required'
      }),

    line_type: Joi.string()  // CORRECTED: line_type not normal_balance
      .valid('debit', 'credit')
      .required()
      .messages({
        'any.only': 'Line type must be either "debit" or "credit"',
        'any.required': 'Line type is required'
      })
  });

  /**
   * Complete Journal Entry Validation
   * CORRECTED: Uses line_type and validates debits = credits
   */
  static journalEntrySchema = Joi.object({
    description: Joi.string()
      .max(1000)
      .required()
      .messages({
        'string.max': 'Description must not exceed 1000 characters',
        'any.required': 'Description is required'
      }),

    journal_date: Joi.date()  // CORRECTED: journal_date not transaction_date
      .max('now')
      .default(() => new Date().toISOString().split('T')[0])
      .messages({
        'date.max': 'Journal date cannot be in the future',
        'date.format': 'Journal date must be a valid date (YYYY-MM-DD)'
      }),

    reference_type: Joi.string()
      .valid(
        'pos_transaction',
        'purchase_order',
        'invoice',
        'expense',
        'depreciation',
        'adjustment',
        'manual_entry'
      )
      .required()
      .messages({
        'any.only': 'Invalid reference type',
        'any.required': 'Reference type is required'
      }),

    reference_id: Joi.string()
      .uuid()
      .allow(null, '')
      .messages({
        'string.guid': 'Reference ID must be a valid UUID'
      }),

    lines: Joi.array()
      .items(this.journalEntryLineSchema)
      .min(2)
      .required()
      .custom((value, helpers) => {
        // GAAP RULE: Debits must equal Credits
        const totalDebits = value
          .filter(line => line.line_type === 'debit')  // CORRECTED: line_type
          .reduce((sum, line) => sum + parseFloat(line.amount), 0);

        const totalCredits = value
          .filter(line => line.line_type === 'credit')  // CORRECTED: line_type
          .reduce((sum, line) => sum + parseFloat(line.amount), 0);

        // Accounting tolerance
        if (Math.abs(totalDebits - totalCredits) > 0.001) {
          return helpers.error('any.custom', {
            message: `Debits (${totalDebits.toFixed(2)}) do not equal Credits (${totalCredits.toFixed(2)})`
          });
        }

        // Validate we have both debit and credit lines
        const hasDebit = value.some(line => line.line_type === 'debit');
        const hasCredit = value.some(line => line.line_type === 'credit');

        if (!hasDebit || !hasCredit) {
          return helpers.error('any.custom', {
            message: 'Journal entry must have at least one debit line and one credit line'
          });
        }

        return value;
      })
      .messages({
        'array.min': 'Journal entry must have at least 2 lines (debit and credit)',
        'any.required': 'Journal entry lines are required',
        'any.custom': 'GAAP validation error'
      })
  });

  /**
   * Trial Balance Report Validation
   */
  static trialBalanceSchema = Joi.object({
    start_date: Joi.date()
      .max(Joi.ref('end_date'))
      .messages({
        'date.max': 'Start date cannot be after end date'
      }),

    end_date: Joi.date()
      .max('now')
      .messages({
        'date.max': 'End date cannot be in the future'
      })
  });

  /**
   * General Ledger Validation
   * UPDATED: account_code made optional since it comes from path parameter
   */
  static generalLedgerSchema = Joi.object({
    account_code: Joi.string().optional()  // Comes from path parameter, not query
      .pattern(/^\d{4}$/)
      .messages({
        'string.pattern.base': 'Account code must be a 4-digit number'
      }),

    start_date: Joi.date()
      .max(Joi.ref('end_date'))
      .messages({
        'date.max': 'Start date cannot be after end date'
      }),

    end_date: Joi.date()
      .max('now')
  });

  /**
   * Inventory Valuation Validation
   */
  static inventoryValuationSchema = Joi.object({
    method: Joi.string()
      .valid('fifo', 'average')
      .default('fifo')
      .messages({
        'any.only': 'Valuation method must be either "fifo" or "average"'
      }),

    as_of_date: Joi.date()
      .max('now')
      .default(() => new Date().toISOString().split('T')[0])
  });

  /**
   * COGS Report Validation
   */
  static cogsReportSchema = Joi.object({
    start_date: Joi.date()
      .required()
      .max(Joi.ref('end_date'))
      .messages({
        'date.max': 'Start date cannot be after end date',
        'any.required': 'Start date is required'
      }),

    end_date: Joi.date()
      .required()
      .max('now')
      .messages({
        'date.max': 'End date cannot be in the future',
        'any.required': 'End date is required'
      })
  });

  /**
   * Inventory Sync Schema - NEW: Missing schema that routes reference
   */
  static inventorySyncSchema = Joi.object({
    source: Joi.string()
      .valid('product', 'inventory', 'average')
      .default('inventory')
      .messages({
        'any.only': 'Source must be "product", "inventory", or "average"'
      })
  });

  /**
   * Validate journal entry data
   */
  static validateJournalEntry(data) {
    try {
      const { error, value } = this.journalEntrySchema.validate(data, {
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

        log.warn('Journal entry validation failed:', { errors });
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

export default AccountingSchemas;
