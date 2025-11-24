import Joi from 'joi';

export const createEquipmentAssetSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  hire_rate_per_day: Joi.number().precision(2).positive().required(),
  hire_rate_per_week: Joi.number().precision(2).positive().optional(),
  hire_rate_per_month: Joi.number().precision(2).positive().optional(),
  minimum_hire_period: Joi.number().integer().min(1).default(1),
  deposit_amount: Joi.number().precision(2).min(0).default(0),
  is_available: Joi.boolean().default(true),
  is_hireable: Joi.boolean().default(true),
  current_location: Joi.string().max(255).optional().allow(''),
  specifications: Joi.object().optional(),
  photos: Joi.array().items(Joi.string()).optional(),
  condition_notes: Joi.string().max(1000).optional().allow(''),
  operational_instructions: Joi.string().max(2000).optional().allow('')
});

export const createHireBookingSchema = Joi.object({
  equipment_asset_id: Joi.string().uuid().required(),
  customer_id: Joi.string().uuid().required(),
  job_id: Joi.string().uuid().optional().allow(null),
  hire_start_date: Joi.date().required(),
  hire_end_date: Joi.date().required().greater(Joi.ref('hire_start_date')),
  hire_rate: Joi.number().precision(2).positive().optional(),
  deposit_paid: Joi.number().precision(2).min(0).default(0),
  pre_hire_condition: Joi.string().max(1000).optional().allow('')
});

export const updateHireBookingSchema = Joi.object({
  status: Joi.string().valid('reserved', 'confirmed', 'active', 'completed', 'cancelled').optional(),
  hire_start_date: Joi.date().optional(),
  hire_end_date: Joi.date().optional().greater(Joi.ref('hire_start_date')),
  hire_rate: Joi.number().precision(2).positive().optional(),
  deposit_paid: Joi.number().precision(2).min(0).optional(),
  pre_hire_condition: Joi.string().max(1000).optional().allow(''),
  post_hire_condition: Joi.string().max(1000).optional().allow(''),
  actual_return_date: Joi.date().optional(),
  damage_notes: Joi.string().max(1000).optional().allow(''),
  damage_charges: Joi.number().precision(2).min(0).optional(),
  deposit_returned: Joi.number().precision(2).min(0).optional(),
  final_amount: Joi.number().precision(2).optional()
});
