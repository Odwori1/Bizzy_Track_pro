// backend/app/schemas/departmentWorkflowSchemas.js
import Joi from 'joi';

export const createHandoffSchema = Joi.object({
  job_id: Joi.string().uuid().required(),
  from_department_id: Joi.string().uuid().required(),
  to_department_id: Joi.string().uuid().required(),
  handoff_notes: Joi.string().max(1000).optional().allow(''),
  required_actions: Joi.object().optional(),
  handoff_to: Joi.string().uuid().optional().allow(null) // Optional user to handoff to
});

export const acceptHandoffSchema = Joi.object({
  assigned_to: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().max(500).optional().allow('')
});

export const rejectHandoffSchema = Joi.object({
  rejection_reason: Joi.string().max(500).required()
});

export const handoffQuerySchema = Joi.object({
  status: Joi.string().valid('pending', 'accepted', 'rejected').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  page: Joi.number().integer().min(1).default(1)
});
