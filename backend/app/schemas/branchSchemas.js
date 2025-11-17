import Joi from 'joi';

export const createBranchSchema = Joi.object({
  name: Joi.string().required().max(255),
  code: Joi.string().required().max(50),
  address: Joi.string().allow('').optional(),
  city: Joi.string().allow('').optional().max(100),
  state: Joi.string().allow('').optional().max(100),
  country: Joi.string().default('US').max(100),
  postal_code: Joi.string().allow('').optional().max(20),
  phone: Joi.string().allow('').optional().max(50),
  email: Joi.string().email().allow('').optional().max(255),
  manager_id: Joi.string().uuid().optional(),
  timezone: Joi.string().default('UTC'),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional()
});

export const updateBranchSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  code: Joi.string().max(50).optional(),
  address: Joi.string().allow('').optional(),
  city: Joi.string().allow('').optional().max(100),
  state: Joi.string().allow('').optional().max(100),
  country: Joi.string().max(100).optional(),
  postal_code: Joi.string().allow('').optional().max(20),
  phone: Joi.string().allow('').optional().max(50),
  email: Joi.string().email().allow('').optional().max(255),
  manager_id: Joi.string().uuid().optional(),
  timezone: Joi.string().optional(),
  latitude: Joi.number().min(-90).max(90).optional(),
  longitude: Joi.number().min(-180).max(180).optional(),
  is_active: Joi.boolean().optional()
});

export const createBranchPermissionSetSchema = Joi.object({
  branch_id: Joi.string().uuid().required(),
  name: Joi.string().required().max(255),
  description: Joi.string().allow('').optional(),
  permissions: Joi.array().items(Joi.string()).default([])
});

export const createCrossBranchAccessSchema = Joi.object({
  from_branch_id: Joi.string().uuid().required(),
  to_branch_id: Joi.string().uuid().required(),
  access_type: Joi.string().valid('view', 'edit', 'transfer', 'manage').required(),
  description: Joi.string().allow('').optional()
});

export const assignUserToBranchSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  branch_id: Joi.string().uuid().required(),
  is_primary: Joi.boolean().default(false),
  assigned_permissions: Joi.array().items(Joi.string()).default([])
});
