import Joi from 'joi';

// Base schemas
const idSchema = Joi.string().uuid().required();
const businessIdSchema = Joi.string().uuid().required();

// Staff Profile Schemas
export const createStaffProfileSchema = Joi.object({
  user_id: idSchema,
  employee_id: Joi.string().max(50).required(),
  job_title: Joi.string().max(100).required(),
  department_id: idSchema.optional().allow(null),
  employment_type: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary').required(),
  hire_date: Joi.date().required(),
  termination_date: Joi.date().optional().allow(null),
  base_wage_rate: Joi.number().precision(2).min(0).required(),
  wage_type: Joi.string().valid('hourly', 'salary', 'commission').required(),
  overtime_rate: Joi.number().precision(2).min(0).optional().default(0),
  emergency_contact_name: Joi.string().max(100).optional().allow(''),
  emergency_contact_phone: Joi.string().max(20).optional().allow(''),
  emergency_contact_relationship: Joi.string().max(50).optional().allow(''),
  skills: Joi.array().items(Joi.string()).optional().default([]),
  certifications: Joi.array().items(Joi.string()).optional().default([]),
  max_hours_per_week: Joi.number().integer().min(1).max(168).optional().default(40)
});

export const updateStaffProfileSchema = Joi.object({
  employee_id: Joi.string().max(50).optional(),
  job_title: Joi.string().max(100).optional(),
  department_id: idSchema.optional().allow(null),
  employment_type: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary').optional(),
  termination_date: Joi.date().optional().allow(null),
  base_wage_rate: Joi.number().precision(2).min(0).optional(),
  wage_type: Joi.string().valid('hourly', 'salary', 'commission').optional(),
  overtime_rate: Joi.number().precision(2).min(0).optional(),
  emergency_contact_name: Joi.string().max(100).optional().allow(''),
  emergency_contact_phone: Joi.string().max(20).optional().allow(''),
  emergency_contact_relationship: Joi.string().max(50).optional().allow(''),
  skills: Joi.array().items(Joi.string()).optional(),
  certifications: Joi.array().items(Joi.string()).optional(),
  max_hours_per_week: Joi.number().integer().min(1).max(168).optional(),
  is_active: Joi.boolean().optional()
});

// Staff Availability Schemas
export const createStaffAvailabilitySchema = Joi.object({
  staff_profile_id: idSchema,
  day_of_week: Joi.number().integer().min(0).max(6).required(),
  start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  end_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  is_available: Joi.boolean().default(true),
  preferred_shift_type: Joi.string().valid('morning', 'afternoon', 'evening', 'night').optional(),
  max_hours_per_day: Joi.number().integer().min(1).max(24).optional().default(8),
  effective_from: Joi.date().optional().default(() => new Date()),
  effective_until: Joi.date().optional().allow(null)
});

// Shift Template Schemas
export const createShiftTemplateSchema = Joi.object({
  name: Joi.string().max(100).required(),
  description: Joi.string().optional().allow(''),
  start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  end_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  break_minutes: Joi.number().integer().min(0).max(480).optional().default(30),
  department_id: idSchema.optional().allow(null),
  required_staff_count: Joi.number().integer().min(1).optional().default(1),
  required_skills: Joi.array().items(Joi.string()).optional().default([]),
  is_premium_shift: Joi.boolean().optional().default(false),
  premium_rate_multiplier: Joi.number().precision(2).min(1).max(3).optional().default(1.0)
});

// Shift Roster Schemas
export const createShiftRosterSchema = Joi.object({
  shift_template_id: idSchema.optional().allow(null),
  shift_date: Joi.date().required(),
  actual_start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
  actual_end_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
  staff_profile_id: idSchema.required(),
  notes: Joi.string().optional().allow('')
});

export const updateShiftRosterSchema = Joi.object({
  actual_start_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
  actual_end_time: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
  shift_status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional(),
  actual_hours_worked: Joi.number().precision(2).min(0).max(24).optional(),
  break_taken_minutes: Joi.number().integer().min(0).max(480).optional(),
  notes: Joi.string().optional().allow('')
});

// Clock Event Schemas
export const createClockEventSchema = Joi.object({
  staff_profile_id: idSchema.required(),
  shift_roster_id: idSchema.optional().allow(null),
  event_type: Joi.string().valid('clock_in', 'clock_out', 'break_start', 'break_end').required(),
  gps_latitude: Joi.number().min(-90).max(90).optional().allow(null),
  gps_longitude: Joi.number().min(-180).max(180).optional().allow(null),
  device_id: Joi.string().max(100).optional().allow(''),
  notes: Joi.string().optional().allow('')
});

// Shift Swap Schemas
export const createShiftSwapRequestSchema = Joi.object({
  original_shift_roster_id: idSchema.required(),
  requested_staff_id: idSchema.optional().allow(null),
  reason: Joi.string().min(1).max(500).required()
});

export const updateShiftSwapRequestSchema = Joi.object({
  status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled').optional(),
  rejection_reason: Joi.string().max(500).optional().allow('')
});

// Timesheet Period Schemas
export const createTimesheetPeriodSchema = Joi.object({
  period_name: Joi.string().max(50).required(),
  start_date: Joi.date().required(),
  end_date: Joi.date().required(),
  pay_date: Joi.date().required()
});

// Timesheet Entry Schemas
export const createTimesheetEntrySchema = Joi.object({
  timesheet_period_id: idSchema.required(),
  staff_profile_id: idSchema.required(),
  regular_hours: Joi.number().precision(2).min(0).max(168).optional().default(0),
  overtime_hours: Joi.number().precision(2).min(0).max(168).optional().default(0),
  break_hours: Joi.number().precision(2).min(0).max(24).optional().default(0),
  notes: Joi.string().optional().allow('')
});

export const updateTimesheetEntrySchema = Joi.object({
  regular_hours: Joi.number().precision(2).min(0).max(168).optional(),
  overtime_hours: Joi.number().precision(2).min(0).max(168).optional(),
  break_hours: Joi.number().precision(2).min(0).max(24).optional(),
  status: Joi.string().valid('draft', 'submitted', 'approved', 'processed').optional(),
  notes: Joi.string().optional().allow('')
});

// Payroll Export Config Schemas
export const createPayrollExportConfigSchema = Joi.object({
  name: Joi.string().max(100).required(),
  export_format: Joi.string().valid('csv', 'excel', 'quickbooks', 'xero').required(),
  config_json: Joi.object().required()
});

// Query parameter schemas
export const staffQuerySchema = Joi.object({
  department_id: idSchema.optional(),
  employment_type: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary').optional(),
  is_active: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20)
});

// FIXED: Shift query schema with corrected date format
export const shiftQuerySchema = Joi.object({
  start_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  end_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  department_id: idSchema.optional(),
  staff_profile_id: idSchema.optional(),
  shift_status: Joi.string().valid('scheduled', 'in_progress', 'completed', 'cancelled').optional()
});

export const timesheetQuerySchema = Joi.object({
  period_id: idSchema.optional(),
  staff_profile_id: idSchema.optional(),
  status: Joi.string().valid('draft', 'submitted', 'approved', 'processed').optional()
});
