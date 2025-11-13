import Joi from 'joi';

export const createUserFeatureToggleSchema = Joi.object({
  user_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid user ID is required',
      'any.required': 'User ID is required'
    }),
  permission_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid permission ID is required',
      'any.required': 'Permission ID is required'
    }),
  is_allowed: Joi.boolean().default(false),
  conditions: Joi.object({
    max_discount: Joi.number().min(0).optional(),
    time_restriction: Joi.string().pattern(/^\d{1,2}-\d{1,2}$/).optional(), // "9-17" format
    amount_limit: Joi.number().min(0).optional(),
    location_restriction: Joi.string().optional()
  }).optional(),
  expires_at: Joi.date().iso().greater('now').optional()
});

export const updateUserFeatureToggleSchema = Joi.object({
  is_allowed: Joi.boolean().optional(),
  conditions: Joi.object({
    max_discount: Joi.number().min(0).optional(),
    time_restriction: Joi.string().pattern(/^\d{1,2}-\d{1,2}$/).optional(),
    amount_limit: Joi.number().min(0).optional(),
    location_restriction: Joi.string().optional()
  }).optional(),
  expires_at: Joi.date().iso().greater('now').optional().allow(null)
});
