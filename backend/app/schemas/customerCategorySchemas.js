import Joi from 'joi';

export const createCustomerCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required()
    .messages({
      'string.empty': 'Category name is required',
      'string.min': 'Category name must be at least 1 character',
      'string.max': 'Category name cannot exceed 100 characters'
    }),
  description: Joi.string().trim().max(500).allow('').optional(),
  color: Joi.string().trim().max(50).default('#3B82F6'),
  discount_percentage: Joi.number().min(0).max(100).precision(2).default(0)
    .messages({
      'number.min': 'Discount percentage cannot be negative',
      'number.max': 'Discount percentage cannot exceed 100%'
    })
});

export const updateCustomerCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(500).allow('').optional(),
  color: Joi.string().trim().max(50).optional(),
  discount_percentage: Joi.number().min(0).max(100).precision(2).optional(),
  is_active: Joi.boolean().optional()
});
