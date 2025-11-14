import Joi from 'joi';

export const createPackageSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required()
    .messages({
      'string.empty': 'Package name is required',
      'string.min': 'Package name must be at least 1 character',
      'string.max': 'Package name cannot exceed 200 characters'
    }),
  description: Joi.string().trim().allow('').optional(),
  base_price: Joi.number().min(0).precision(2).required()
    .messages({
      'number.min': 'Base price cannot be negative',
      'number.base': 'Base price must be a valid number'
    }),
  duration_minutes: Joi.number().integer().min(1).max(1440).required()
    .messages({
      'number.min': 'Duration must be at least 1 minute',
      'number.max': 'Duration cannot exceed 1440 minutes (24 hours)'
    }),
  category: Joi.string().trim().max(100).default('General'),
  is_customizable: Joi.boolean().default(false),
  min_services: Joi.number().integer().min(1).default(1),
  max_services: Joi.number().integer().min(1).optional(),
  services: Joi.array().items(
    Joi.object({
      service_id: Joi.string().uuid().required(),
      is_required: Joi.boolean().default(false),
      default_quantity: Joi.number().integer().min(1).default(1),
      max_quantity: Joi.number().integer().min(1).optional(),
      package_price: Joi.number().min(0).precision(2).optional()
    })
  ).min(1).required()
});

export const updatePackageSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().trim().allow('').optional(),
  base_price: Joi.number().min(0).precision(2).optional(),
  duration_minutes: Joi.number().integer().min(1).max(1440).optional(),
  category: Joi.string().trim().max(100).optional(),
  is_customizable: Joi.boolean().optional(),
  min_services: Joi.number().integer().min(1).optional(),
  max_services: Joi.number().integer().min(1).optional(),
  is_active: Joi.boolean().optional()
});

export const addServiceToPackageSchema = Joi.object({
  service_id: Joi.string().uuid().required(),
  is_required: Joi.boolean().default(false),
  default_quantity: Joi.number().integer().min(1).default(1),
  max_quantity: Joi.number().integer().min(1).optional(),
  package_price: Joi.number().min(0).precision(2).optional()
});
