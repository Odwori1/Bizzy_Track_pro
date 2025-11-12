import Joi from 'joi';

export const createDiscountRuleSchema = Joi.object({
  category_id: Joi.string().uuid().required(),
  service_id: Joi.string().uuid().required(),
  discount_type: Joi.string().valid('percentage', 'fixed').required(),
  discount_value: Joi.number().min(0).precision(2).required(),
  min_amount: Joi.number().min(0).precision(2).default(0),
  max_discount: Joi.number().min(0).precision(2).optional(),
  valid_from: Joi.date().optional(),
  valid_until: Joi.date().optional()
});

export const updateDiscountRuleSchema = Joi.object({
  discount_type: Joi.string().valid('percentage', 'fixed').optional(),
  discount_value: Joi.number().min(0).precision(2).optional(),
  min_amount: Joi.number().min(0).precision(2).optional(),
  max_discount: Joi.number().min(0).precision(2).optional(),
  is_active: Joi.boolean().optional(),
  valid_from: Joi.date().optional(),
  valid_until: Joi.date().optional()
});
