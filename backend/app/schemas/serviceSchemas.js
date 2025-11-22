import Joi from 'joi';

export const createServiceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required()
    .messages({
      'string.empty': 'Service name is required',
      'string.min': 'Service name must be at least 1 character',
      'string.max': 'Service name cannot exceed 200 characters'
    }),
  description: Joi.string().trim().max(1000).allow('').optional(),
  base_price: Joi.number().precision(2).min(0).required()
    .messages({
      'number.base': 'Base price must be a number',
      'number.min': 'Base price cannot be negative'
    }),
  duration_minutes: Joi.number().integer().min(1).max(1440).required()
    .messages({
      'number.base': 'Duration must be a number',
      'number.min': 'Duration must be at least 1 minute',
      'number.max': 'Duration cannot exceed 1440 minutes (24 hours)'
    }),
  category: Joi.string().trim().max(100).allow('').optional(),
  service_category_id: Joi.string().uuid().allow(null).optional(),
  is_active: Joi.boolean().default(true).optional()
});

export const updateServiceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().trim().max(1000).allow('').optional(),
  base_price: Joi.number().precision(2).min(0).optional(),
  duration_minutes: Joi.number().integer().min(1).max(1440).optional(),
  category: Joi.string().trim().max(100).allow('').optional(),
  service_category_id: Joi.string().uuid().allow(null).optional(),
  is_active: Joi.boolean().optional()
});
