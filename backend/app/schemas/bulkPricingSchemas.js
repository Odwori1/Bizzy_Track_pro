import Joi from 'joi';

export const bulkUpdateServicesSchema = Joi.object({
  services: Joi.array().items(Joi.object({
    id: Joi.string().uuid().required(),
    name: Joi.string().max(200).required()
  })).min(1).max(1000).required(),
  update_type: Joi.string().valid('percentage_increase', 'percentage_decrease', 'fixed_increase', 'fixed_decrease', 'override').required(),
  value: Joi.number().required(),
  change_reason: Joi.string().max(500).required()
});

export const bulkUpdatePackagesSchema = Joi.object({
  packages: Joi.array().items(Joi.object({
    id: Joi.string().uuid().required(),
    name: Joi.string().max(200).required()
  })).min(1).max(1000).required(),
  update_type: Joi.string().valid('percentage_increase', 'percentage_decrease', 'fixed_increase', 'fixed_decrease', 'override').required(),
  value: Joi.number().required(),
  change_reason: Joi.string().max(500).required()
});

export const bulkPreviewSchema = Joi.object({
  services: Joi.array().items(Joi.object({
    id: Joi.string().uuid().required(),
    name: Joi.string().max(200).required()
  })).max(1000).default([]),
  packages: Joi.array().items(Joi.object({
    id: Joi.string().uuid().required(),
    name: Joi.string().max(200).required()
  })).max(1000).default([]),
  update_type: Joi.string().valid('percentage_increase', 'percentage_decrease', 'fixed_increase', 'fixed_decrease', 'override').required(),
  value: Joi.number().required()
});

export const bulkUpdateByCategorySchema = Joi.object({
  category: Joi.string().max(100).required(),
  update_type: Joi.string().valid('percentage_increase', 'percentage_decrease', 'fixed_increase', 'fixed_decrease', 'override').required(),
  value: Joi.number().required(),
  change_reason: Joi.string().max(500).required()
});

export const bulkUpdateAllSchema = Joi.object({
  entity_type: Joi.string().valid('services', 'packages', 'both').required(),
  update_type: Joi.string().valid('percentage_increase', 'percentage_decrease', 'fixed_increase', 'fixed_decrease', 'override').required(),
  value: Joi.number().required(),
  change_reason: Joi.string().max(500).required()
});
