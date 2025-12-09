import Joi from 'joi';

export const staffSchemas = {
  createStaff: Joi.object({
    email: Joi.string().email().required(),
    full_name: Joi.string().min(2).max(100).required(),
    password: Joi.string().min(6).optional(),
    role: Joi.string().valid('admin', 'manager', 'staff', 'supervisor').default('staff'),
    department_id: Joi.string().uuid().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    notes: Joi.string().optional()
  }),

  updateStaff: Joi.object({
    full_name: Joi.string().min(2).max(100).optional(),
    role: Joi.string().valid('admin', 'manager', 'staff', 'supervisor').optional(),
    department_id: Joi.string().uuid().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    is_active: Joi.boolean().optional(),
    notes: Joi.string().optional(),
    hourly_rate: Joi.number().positive().optional()
  }),

  inviteStaff: Joi.object({
    email: Joi.string().email().required(),
    full_name: Joi.string().min(2).max(100).optional(),
    role: Joi.string().valid('admin', 'manager', 'staff', 'supervisor').default('staff'),
    department_id: Joi.string().uuid().optional()
  }),

  staffLogin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    business_id: Joi.string().uuid().required()
  }),

  assignRole: Joi.object({
    roleId: Joi.string().uuid().required()
  })
};
