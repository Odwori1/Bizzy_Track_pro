import Joi from 'joi';

export const createAssignmentSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  department_id: Joi.string().uuid().required(),
  assignment_type: Joi.string().valid('primary', 'secondary', 'review').default('primary'),
  status: Joi.string().valid('assigned', 'in_progress', 'completed', 'cancelled').default('assigned'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  estimated_hours: Joi.number().positive().optional(),
  scheduled_start: Joi.date().iso().optional(),
  scheduled_end: Joi.date().iso().optional(),
  notes: Joi.string().max(1000).optional()
});

export const updateAssignmentSchema = Joi.object({
  assigned_to: Joi.string().uuid().optional(),
  status: Joi.string().valid('assigned', 'in_progress', 'completed', 'cancelled').optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  estimated_hours: Joi.number().positive().optional(),
  actual_hours: Joi.number().positive().optional(),
  scheduled_start: Joi.date().iso().optional(),
  scheduled_end: Joi.date().iso().optional(),
  actual_start: Joi.date().iso().optional(),
  actual_end: Joi.date().iso().optional(),
  notes: Joi.string().max(1000).optional(),
  sla_deadline: Joi.date().iso().optional()
});

export const assignmentQuerySchema = Joi.object({
  status: Joi.string().valid('assigned', 'in_progress', 'completed', 'cancelled').optional(),
  department_id: Joi.string().uuid().optional(),
  job_id: Joi.string().uuid().optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});
