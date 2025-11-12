import Joi from 'joi';

export const createCustomerSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(100).required()
    .messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 1 character',
      'string.max': 'First name cannot exceed 100 characters'
    }),
  last_name: Joi.string().trim().min(1).max(100).required()
    .messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 1 character',
      'string.max': 'Last name cannot exceed 100 characters'
    }),
  email: Joi.string().email().allow('').optional(),
  phone: Joi.string().trim().max(50).allow('').optional(),
  company_name: Joi.string().trim().max(255).allow('').optional(),
  tax_number: Joi.string().trim().max(100).allow('').optional(),
  category_id: Joi.string().uuid().allow(null).optional(),
  address: Joi.object({
    street: Joi.string().allow('').optional(),
    city: Joi.string().allow('').optional(),
    state: Joi.string().allow('').optional(),
    postal_code: Joi.string().allow('').optional(),
    country: Joi.string().allow('').optional()
  }).optional(),
  notes: Joi.string().allow('').optional()
});

export const updateCustomerSchema = Joi.object({
  first_name: Joi.string().trim().min(1).max(100).optional(),
  last_name: Joi.string().trim().min(1).max(100).optional(),
  email: Joi.string().email().allow('').optional(),
  phone: Joi.string().trim().max(50).allow('').optional(),
  company_name: Joi.string().trim().max(255).allow('').optional(),
  tax_number: Joi.string().trim().max(100).allow('').optional(),
  category_id: Joi.string().uuid().allow(null).optional(),
  address: Joi.object({
    street: Joi.string().allow('').optional(),
    city: Joi.string().allow('').optional(),
    state: Joi.string().allow('').optional(),
    postal_code: Joi.string().allow('').optional(),
    country: Joi.string().allow('').optional()
  }).optional(),
  notes: Joi.string().allow('').optional(),
  is_active: Joi.boolean().optional()
});
