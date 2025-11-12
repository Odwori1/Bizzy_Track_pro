import Joi from 'joi';

export const createServiceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required()
    .messages({
      'string.empty': 'Service name is required',
      'string.min': 'Service name must be at least 1 character',
      'string.max': 'Service name cannot exceed 200 characters'
    }),
  description: Joi.string().trim().allow('').optional(),
  base_price: Joi.number().min(0).precision(2).required()
    .messages({
      'number.min': 'Base price cannot be negative',
      'number.base': 'Base price must be a valid number'
    }),
  duration_minutes: Joi.number().integer().min(1).max(1440).default(60)
    .messages({
      'number.min': 'Duration must be at least 1 minute',
      'number.max': 'Duration cannot exceed 1440 minutes (24 hours)'
    }),
  category: Joi.string().trim().max(100).default('General')
});

export const updateServiceSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().trim().allow('').optional(),
  base_price: Joi.number().min(0).precision(2).optional(),
  duration_minutes: Joi.number().integer().min(1).max(1440).optional(),
  category: Joi.string().trim().max(100).optional(),
  is_active: Joi.boolean().optional()
});
