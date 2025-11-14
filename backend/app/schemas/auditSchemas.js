import Joi from 'joi';

export const auditSearchSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(50),
    action: Joi.string().optional(),
    resource_type: Joi.string().optional(),
    user_id: Joi.string().uuid().optional(),
    start_date: Joi.date().iso().optional(),
    end_date: Joi.date().iso().optional(),
    search: Joi.string().max(100).optional()
  })
};

export const auditSummarySchema = {
  query: Joi.object({
    period: Joi.string().valid('1d', '7d', '30d', '90d').default('7d')
  })
};

export const auditRecentSchema = {
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(50).default(10)
  })
};

export const auditByIdSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required()
  })
};
