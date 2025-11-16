import Joi from 'joi';

export const createDepartmentSchema = Joi.object({
  name: Joi.string().max(255).required(),
  code: Joi.string().max(50).required(),
  description: Joi.string().max(1000).optional().allow(''),
  parent_department_id: Joi.string().uuid().optional().allow(null),
  cost_center_code: Joi.string().max(100).optional().allow(''),
  department_type: Joi.string().valid('sales', 'service', 'admin', 'production', 'support').required(),
  color_hex: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional().allow(''),
  sort_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true)
});

export const updateDepartmentSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  code: Joi.string().max(50).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  parent_department_id: Joi.string().uuid().optional().allow(null),
  cost_center_code: Joi.string().max(100).optional().allow(''),
  department_type: Joi.string().valid('sales', 'service', 'admin', 'production', 'support').optional(),
  color_hex: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional().allow(''),
  sort_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional()
});

export const createDepartmentRoleSchema = Joi.object({
  department_id: Joi.string().uuid().required(),
  name: Joi.string().max(255).required(),
  description: Joi.string().max(1000).optional().allow(''),
  base_role_id: Joi.string().uuid().optional().allow(null),
  permissions_template: Joi.object().optional(),
  is_template: Joi.boolean().default(true)
});

export const updateDepartmentRoleSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  base_role_id: Joi.string().uuid().optional().allow(null),
  permissions_template: Joi.object().optional(),
  is_template: Joi.boolean().optional()
});

export const createJobAssignmentSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  department_id: Joi.string().uuid().required(),
  assigned_to: Joi.string().uuid().optional().allow(null),
  assignment_type: Joi.string().valid('primary', 'collaboration', 'review').default('primary'),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  estimated_hours: Joi.number().precision(2).min(0).optional(),
  scheduled_start: Joi.date().optional(),
  scheduled_end: Joi.date().optional(),
  notes: Joi.string().max(1000).optional().allow(''),
  sla_deadline: Joi.date().optional()
});

export const updateJobAssignmentSchema = Joi.object({
  assigned_to: Joi.string().uuid().optional().allow(null),
  status: Joi.string().valid('assigned', 'in_progress', 'completed', 'blocked').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  actual_hours: Joi.number().precision(2).min(0).optional(),
  actual_start: Joi.date().optional(),
  actual_end: Joi.date().optional(),
  notes: Joi.string().max(1000).optional().allow('')
});

export const createWorkflowHandoffSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  from_department_id: Joi.string().uuid().required(),
  to_department_id: Joi.string().uuid().required(),
  handoff_to: Joi.string().uuid().optional().allow(null),
  handoff_notes: Joi.string().max(1000).optional().allow(''),
  required_actions: Joi.object().optional()
});

export const departmentQuerySchema = Joi.object({
  department_type: Joi.string().valid('sales', 'service', 'admin', 'production', 'support').optional(),
  is_active: Joi.boolean().optional(),
  include_children: Joi.boolean().default(false),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});

export const jobAssignmentQuerySchema = Joi.object({
  job_id: Joi.string().uuid().optional(),
  department_id: Joi.string().uuid().optional(),
  status: Joi.string().valid('assigned', 'in_progress', 'completed', 'blocked').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
