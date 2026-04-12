// File: backend/app/schemas/openingBalanceSchemas.js
// Pattern follows: refundSchemas.js

import Joi from 'joi';
import { log } from '../utils/logger.js';

export class OpeningBalanceSchemas {

    /**
     * Set Opening Balance Schema
     */
    static setBalanceSchema = Joi.object({
        account_code: Joi.string()
            .pattern(/^[0-9]{4}$/)
            .required()
            .messages({
                'string.pattern.base': 'Account code must be a 4-digit number (e.g., 1110)',
                'any.required': 'Account code is required'
            }),
        amount: Joi.number()
            .min(0)
            .precision(2)
            .required()
            .messages({
                'number.min': 'Amount cannot be negative',
                'any.required': 'Amount is required'
            }),
        balance_type: Joi.string()
            .valid('debit', 'credit')
            .required()
            .messages({
                'any.only': 'Balance type must be either "debit" or "credit"',
                'any.required': 'Balance type is required'
            }),
        as_of_date: Joi.date()
            .iso()
            .optional()
            .default(() => new Date().toISOString().split('T')[0]),
        notes: Joi.string()
            .max(500)
            .optional()
            .allow(null, '')
    });

    /**
     * Initialize Business Schema
     */
    static initializeBusinessSchema = Joi.object({
        fiscal_year_start: Joi.date()
            .iso()
            .optional()
            .messages({
                'date.iso': 'Fiscal year start must be a valid ISO date (YYYY-MM-DD)'
            }),
        currency_code: Joi.string()
            .length(3)
            .uppercase()
            .optional()
            .default('UGX')
            .messages({
                'string.length': 'Currency code must be 3 characters (e.g., UGX, USD)'
            })
    });

    /**
     * Validate Opening Balances Schema
     */
    static validateBalancesSchema = Joi.object({
        as_of_date: Joi.date()
            .iso()
            .optional()
            .default(() => new Date().toISOString().split('T')[0])
    });

    /**
     * Post Opening Balances Schema
     */
    static postBalancesSchema = Joi.object({
        as_of_date: Joi.date()
            .iso()
            .optional()
            .default(() => new Date().toISOString().split('T')[0])
    });

    /**
     * Delete Opening Balance Schema
     */
    static deleteBalanceSchema = Joi.object({
        as_of_date: Joi.date()
            .iso()
            .optional()
            .default(() => new Date().toISOString().split('T')[0])
    });

    /**
     * Validate set opening balance request
     */
    static validateSetBalance(data) {
        try {
            const { error, value } = this.setBalanceSchema.validate(data, {
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

                log.warn('Opening balance validation failed:', { errors });
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
     * Validate initialize business request
     */
    static validateInitializeBusiness(data) {
        try {
            const { error, value } = this.initializeBusinessSchema.validate(data || {}, {
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
     * Validate validate balances request
     */
    static validateValidateBalances(data) {
        try {
            const { error, value } = this.validateBalancesSchema.validate(data || {}, {
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
     * Validate post balances request
     */
    static validatePostBalances(data) {
        try {
            const { error, value } = this.postBalancesSchema.validate(data || {}, {
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
     * Validate delete balance request
     */
    static validateDeleteBalance(data) {
        try {
            const { error, value } = this.deleteBalanceSchema.validate(data || {}, {
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

export default OpeningBalanceSchemas;
