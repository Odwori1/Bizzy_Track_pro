import Joi from 'joi';

export const generateDemoDataSchema = {
  body: Joi.object({
    customers_count: Joi.number().integer().min(1).max(100).default(10),
    services_count: Joi.number().integer().min(1).max(20).default(8),
    jobs_count: Joi.number().integer().min(1).max(50).default(15),
    invoices_count: Joi.number().integer().min(1).max(30).default(12),
    include_staff: Joi.boolean().default(true)
  })
};

export const cleanupDemoDataSchema = {
  body: Joi.object({})
  // No body parameters needed for cleanup
};
