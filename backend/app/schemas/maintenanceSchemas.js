import Joi from 'joi';

export const createMaintenanceSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  maintenance_type: Joi.string().valid('routine', 'repair', 'inspection', 'emergency', 'preventive').required(),
  maintenance_date: Joi.date().required(),
  description: Joi.string().max(1000).optional().allow(''),
  cost: Joi.number().precision(2).min(0).default(0),
  technician: Joi.string().max(255).optional().allow(''),
  next_maintenance_date: Joi.date().optional(),
  status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').default('scheduled')
});

export const updateMaintenanceSchema = Joi.object({
  maintenance_type: Joi.string().valid('routine', 'repair', 'inspection', 'emergency', 'preventive').optional(),
  maintenance_date: Joi.date().optional(),
  description: Joi.string().max(1000).optional().allow(''),
  cost: Joi.number().precision(2).min(0).optional(),
  technician: Joi.string().max(255).optional().allow(''),
  next_maintenance_date: Joi.date().optional(),
  status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional()
});
