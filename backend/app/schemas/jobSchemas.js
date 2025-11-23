import Joi from 'joi';

// Schema for individual job services in package jobs
const jobServiceSchema = Joi.object({
  service_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid service ID is required',
      'any.required': 'Service ID is required'
    }),
  quantity: Joi.number().integer().min(1).max(100).default(1),
  unit_price: Joi.number().precision(2).min(0).optional(),
  sequence_order: Joi.number().integer().min(0).default(0)
});

export const createJobSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required()
    .messages({
      'string.empty': 'Job title is required',
      'string.min': 'Job title must be at least 1 character',
      'string.max': 'Job title cannot exceed 200 characters'
    }),
  description: Joi.string().allow('').optional(),
  customer_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid customer ID is required',
      'any.required': 'Customer ID is required'
    }),
  
  // Single service job (existing functionality)
  service_id: Joi.string().uuid().optional()
    .messages({
      'string.guid': 'Valid service ID is required'
    }),
  
  // Package job (new functionality)
  package_id: Joi.string().uuid().optional()
    .messages({
      'string.guid': 'Valid package ID is required'
    }),
  is_package_job: Joi.boolean().default(false),
  package_configuration: Joi.object().optional(),
  job_services: Joi.array().items(jobServiceSchema).optional(),
  
  // Common fields
  scheduled_date: Joi.date().iso().greater('now').optional(),
  estimated_duration_minutes: Joi.number().integer().min(1).max(480).optional(),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  assigned_to: Joi.string().uuid().optional(),
  location: Joi.string().trim().max(500).optional().allow('').allow(null)
})
// Fix: Use custom validation instead of Joi.xor which is too restrictive
.custom((value, helpers) => {
  const { service_id, package_id, is_package_job, job_services } = value;
  
  // Single service job validation
  if (service_id && !package_id && !is_package_job) {
    return value; // Valid single service job
  }
  
  // Package job validation
  if (package_id && is_package_job) {
    if (!job_services || !Array.isArray(job_services) || job_services.length === 0) {
      return helpers.error('any.custom', { message: 'Package jobs require job_services array with at least one service' });
    }
    return value; // Valid package job
  }
  
  // Mixed case (both service_id and package_id)
  if (service_id && package_id) {
    return helpers.error('any.custom', { message: 'Cannot provide both service_id and package_id. Choose either single service or package job.' });
  }
  
  // Missing required fields
  if (!service_id && !package_id) {
    return helpers.error('any.custom', { message: 'Either service_id (single service) or package_id (package job) must be provided' });
  }
  
  // Incomplete package job
  if (package_id && !is_package_job) {
    return helpers.error('any.custom', { message: 'Package jobs require is_package_job to be true' });
  }
  
  return value;
}, 'Job type validation');

export const updateJobSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().allow('').optional(),
  scheduled_date: Joi.date().iso().optional(),
  estimated_duration_minutes: Joi.number().integer().min(1).max(480).optional(),
  actual_duration_minutes: Joi.number().integer().min(1).max(480).optional(),
  priority: Joi.string().valid('low', 'medium', 'high').optional(),
  assigned_to: Joi.string().uuid().optional(),
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled').optional(),
  discount_amount: Joi.number().precision(2).min(0).optional(),
  location: Joi.string().trim().max(500).optional().allow('').allow(null)
});

export const updateJobStatusSchema = Joi.object({
  status: Joi.string().valid('pending', 'in-progress', 'completed', 'cancelled').required(),
  notes: Joi.string().allow('').optional()
});
