import Joi from 'joi';

export const createFixedAssetSchema = Joi.object({
  asset_code: Joi.string().max(50).optional(),
  asset_name: Joi.string().max(200).required(),
  category: Joi.string().valid('property', 'vehicle', 'furniture', 'electronics', 'machinery', 'equipment', 'intangible', 'other').required(),
  description: Joi.string().max(1000).optional().allow(''),
  purchase_date: Joi.date().required(),
  purchase_price: Joi.number().precision(2).positive().required(),
  supplier: Joi.string().max(255).optional().allow(''),
  invoice_reference: Joi.string().max(100).optional().allow(''),
  current_value: Joi.number().precision(2).positive().optional(),
  depreciation_method: Joi.string().valid('straight_line', 'reducing_balance').default('straight_line'),
  depreciation_rate: Joi.number().min(0).max(100).default(0),
  useful_life_years: Joi.number().integer().min(1).default(5),
  salvage_value: Joi.number().precision(2).min(0).default(0),
  location: Joi.string().max(255).optional().allow(''),
  condition_status: Joi.string().valid('excellent', 'good', 'fair', 'poor', 'broken').default('excellent'),
  serial_number: Joi.string().max(100).optional().allow(''),
  model: Joi.string().max(100).optional().allow(''),
  insurance_details: Joi.object().optional(),
  maintenance_schedule: Joi.string().valid('none', 'monthly', 'quarterly', 'biannual', 'annual').default('none'),
  last_maintenance_date: Joi.date().optional(),
  next_maintenance_date: Joi.date().optional()
});

export const updateFixedAssetSchema = Joi.object({
  asset_name: Joi.string().max(200).optional(),
  category: Joi.string().valid('property', 'vehicle', 'furniture', 'electronics', 'machinery', 'equipment', 'intangible', 'other').optional(),
  description: Joi.string().max(1000).optional().allow(''),
  current_value: Joi.number().precision(2).positive().optional(),
  location: Joi.string().max(255).optional().allow(''),
  condition_status: Joi.string().valid('excellent', 'good', 'fair', 'poor', 'broken').optional(),
  insurance_details: Joi.object().optional(),
  maintenance_schedule: Joi.string().valid('none', 'monthly', 'quarterly', 'biannual', 'annual').optional(),
  next_maintenance_date: Joi.date().optional()
});
