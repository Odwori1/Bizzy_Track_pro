import Joi from 'joi';

export const createJobSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required()
    .messages({
      'string.empty': 'Job title is required',
      'string.min': 'Job title must be at least 1 character',
      'string.max': 'Job title cannot exceed 200 characters'
    }),
  description: Joi.string().allow('').optional(),
  customer_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid customer ID is required',
      'any.required': 'Customer ID is required'
    }),
  service_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid service ID is required',
      'any.required': 'Service ID is required'
    }),
  scheduled_date: Joi.date().iso().greater('now').optional(),
  estimated_duration_minutes: Joi.number().integer().min(1).max(480).optional(),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  assigned_to: Joi.string().uuid().optional()
});

export const updateJobSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().allow('').optional(),
  scheduled_date: Joi.date().iso().optional(),
  estimated_duration_minutes: Joi.number().integer().min(1).max(480).optional(),
  actual_duration_minutes: Joi.number().integer().min(1).max(480).optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional(),
  assigned_to: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled').optional(),
  discount_amount: Joi.number().precision(2).min(0).optional()
});

export const updateJobStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled').required(),
  notes: Joi.string().allow('').optional()
});
