import Joi from 'joi';

export const markAssetHireableSchema = Joi.object({
  hire_rate_per_day: Joi.number().positive().required().messages({
    'number.base': 'Hire rate must be a number',
    'number.positive': 'Hire rate must be positive',
    'any.required': 'Hire rate is required'
  }),
  deposit_amount: Joi.number().min(0).required().messages({
    'number.base': 'Deposit amount must be a number',
    'number.min': 'Deposit amount cannot be negative',
    'any.required': 'Deposit amount is required'
  }),
  minimum_hire_period: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'Minimum hire period must be a number',
    'number.integer': 'Minimum hire period must be an integer',
    'number.min': 'Minimum hire period must be at least 1 day'
  }),
  current_location: Joi.string().max(255).optional().messages({
    'string.max': 'Location cannot exceed 255 characters'
  }),
  condition_notes: Joi.string().optional()
});
