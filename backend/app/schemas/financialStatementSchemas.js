// File: backend/app/schemas/financialStatementSchemas.js
// Pattern follows: openingBalanceSchemas.js
// Purpose: Request validation for financial statement endpoints

import Joi from 'joi';
import { log } from '../utils/logger.js';

export class FinancialStatementSchemas {

    static profitLossQuerySchema = Joi.object({
        start_date: Joi.date()
            .iso()
            .required()
            .messages({
                'date.iso': 'start_date must be a valid ISO date (YYYY-MM-DD)',
                'any.required': 'start_date is required'
            }),
        end_date: Joi.date()
            .iso()
            .min(Joi.ref('start_date'))
            .required()
            .messages({
                'date.iso': 'end_date must be a valid ISO date (YYYY-MM-DD)',
                'date.min': 'end_date must be on or after start_date',
                'any.required': 'end_date is required'
            }),
        compare_with_previous: Joi.boolean()
            .optional()
            .default(false)
    });

    static balanceSheetQuerySchema = Joi.object({
        as_of_date: Joi.date()
            .iso()
            .required()
            .messages({
                'date.iso': 'as_of_date must be a valid ISO date (YYYY-MM-DD)',
                'any.required': 'as_of_date is required'
            }),
        include_comparative: Joi.boolean()
            .optional()
            .default(false)
    });

    static cashFlowQuerySchema = Joi.object({
        start_date: Joi.date()
            .iso()
            .required()
            .messages({
                'date.iso': 'start_date must be a valid ISO date (YYYY-MM-DD)',
                'any.required': 'start_date is required'
            }),
        end_date: Joi.date()
            .iso()
            .min(Joi.ref('start_date'))
            .required()
            .messages({
                'date.iso': 'end_date must be a valid ISO date (YYYY-MM-DD)',
                'date.min': 'end_date must be on or after start_date',
                'any.required': 'end_date is required'
            })
    });

    static trialBalanceQuerySchema = Joi.object({
        as_of_date: Joi.date()
            .iso()
            .optional()
            .default(() => new Date().toISOString().split('T')[0]),
        include_zero_balances: Joi.boolean()
            .optional()
            .default(false)
    });

    static summaryQuerySchema = Joi.object({
        start_date: Joi.date()
            .iso()
            .required()
            .messages({
                'date.iso': 'start_date must be a valid ISO date (YYYY-MM-DD)',
                'any.required': 'start_date is required'
            }),
        end_date: Joi.date()
            .iso()
            .min(Joi.ref('start_date'))
            .required()
            .messages({
                'date.iso': 'end_date must be a valid ISO date (YYYY-MM-DD)',
                'date.min': 'end_date must be on or after start_date',
                'any.required': 'end_date is required'
            })
    });

    static validateProfitLossQuery(data) {
        try {
            const { error, value } = this.profitLossQuerySchema.validate(data, {
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

                log.warn('Profit & Loss query validation failed:', { errors });
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

    static validateBalanceSheetQuery(data) {
        try {
            const { error, value } = this.balanceSheetQuerySchema.validate(data, {
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

    static validateCashFlowQuery(data) {
        try {
            const { error, value } = this.cashFlowQuerySchema.validate(data, {
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

    static validateTrialBalanceQuery(data) {
        try {
            const { error, value } = this.trialBalanceQuerySchema.validate(data || {}, {
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

    static validateSummaryQuery(data) {
        try {
            const { error, value } = this.summaryQuerySchema.validate(data, {
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

export default FinancialStatementSchemas;
