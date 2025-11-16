import Joi from 'joi';

// Base schemas
const idSchema = Joi.string().uuid().required();
const businessIdSchema = Joi.string().uuid().required();

// Analytics Dashboard Schemas
export const createAnalyticsDashboardSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional().allow(''),
  layout_config: Joi.object().optional().default({}),
  is_default: Joi.boolean().optional().default(false)
});

export const updateAnalyticsDashboardSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  description: Joi.string().optional().allow(''),
  layout_config: Joi.object().optional(),
  is_default: Joi.boolean().optional()
});

// Customer Segment Schemas
export const createCustomerSegmentSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional().allow(''),
  segment_criteria: Joi.object().required(),
  segment_type: Joi.string().valid('behavioral', 'demographic', 'value_based').required()
});

// Cohort Analysis Schemas
export const createCohortAnalysisSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional().allow(''),
  cohort_type: Joi.string().valid('time-based', 'event-based').required(),
  period_type: Joi.string().valid('daily', 'weekly', 'monthly').required(),
  metric_type: Joi.string().valid('retention', 'revenue', 'conversion').required()
});

// Scheduled Report Schemas
export const createScheduledReportSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().optional().allow(''),
  report_type: Joi.string().valid('financial', 'operational', 'customer', 'staff').required(),
  frequency: Joi.string().valid('daily', 'weekly', 'monthly', 'quarterly').required(),
  config: Joi.object().required(),
  recipients: Joi.array().items(Joi.string().email()).required(),
  export_format: Joi.string().valid('pdf', 'excel', 'csv').optional().default('pdf')
});

// Export Job Schemas
export const createExportJobSchema = Joi.object({
  export_type: Joi.string().valid('customers', 'jobs', 'invoices', 'financials').required(),
  filters: Joi.object().optional().default({}),
  format: Joi.string().valid('csv', 'excel', 'pdf').optional().default('csv')
});

// Query parameter schemas
export const analyticsQuerySchema = Joi.object({
  period: Joi.string().pattern(/^\d+ days$/).optional().default('30 days'),
  is_default: Joi.boolean().optional(),
  segment_type: Joi.string().valid('behavioral', 'demographic', 'value_based').optional(),
  is_active: Joi.boolean().optional(),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
  export_type: Joi.string().valid('customers', 'jobs', 'invoices', 'financials').optional()
});
