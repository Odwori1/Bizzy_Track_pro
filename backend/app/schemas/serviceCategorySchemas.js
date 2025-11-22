import Joi from 'joi';

export const createServiceCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required()
    .messages({
      'string.empty': 'Category name is required',
      'string.min': 'Category name must be at least 1 character',
      'string.max': 'Category name cannot exceed 100 characters'
    }),
  description: Joi.string().trim().max(500).allow('').optional(),
  color: Joi.string().trim().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  sort_order: Joi.number().integer().min(0).default(0).optional()
});

export const updateServiceCategorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  description: Joi.string().trim().max(500).allow('').optional(),
  color: Joi.string().trim().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional(),
  sort_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional()
});
