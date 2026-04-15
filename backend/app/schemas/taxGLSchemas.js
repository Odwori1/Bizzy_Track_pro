// File: backend/app/schemas/taxGLSchemas.js
// Pattern follows: openingBalanceSchemas.js
// Purpose: Request validation for tax GL endpoints

import Joi from 'joi';
import { log } from '../utils/logger.js';

export class TaxGLSchemas {

    static batchPostSchema = Joi.object({
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

    static unpostedQuerySchema = Joi.object({
        start_date: Joi.date().iso().optional(),
        end_date: Joi.date().iso().min(Joi.ref('start_date')).optional()
    });

    static liabilityReportQuerySchema = Joi.object({
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

    static validateBatchPost(data) {
        try {
            const { error, value } = this.batchPostSchema.validate(data, {
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

                log.warn('Batch post validation failed:', { errors });
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

    static validateUnpostedQuery(data) {
        try {
            const { error, value } = this.unpostedQuerySchema.validate(data || {}, {
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

    static validateLiabilityReportQuery(data) {
        try {
            const { error, value } = this.liabilityReportQuerySchema.validate(data, {
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

export default TaxGLSchemas;
