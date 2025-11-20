import Joi from 'joi';

export const createSeasonalPricingSchema = Joi.object({
  name: Joi.string().required().max(200),
  description: Joi.string().allow('').max(1000),
  
  // Date ranges
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref('start_date')).required(),
  
  // Recurrence
  is_recurring: Joi.boolean().default(false),
  recurrence_type: Joi.string().valid('yearly', 'monthly', 'weekly').when('is_recurring', {
    is: true,
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  
  // Pricing adjustments
  adjustment_type: Joi.string().valid('percentage', 'fixed', 'override').required(),
  adjustment_value: Joi.number().min(0).required(),
  
  // Target scope
  target_type: Joi.string().valid('all_services', 'category', 'specific_service', 'customer_segment').required(),
  target_id: Joi.string().uuid().when('target_type', {
    is: Joi.valid('category', 'specific_service', 'customer_segment'),
    then: Joi.required(),
    otherwise: Joi.optional().allow(null)
  }),
  target_name: Joi.string().max(100).optional(),
  
  // Conditions
  min_order_amount: Joi.number().min(0).optional(),
  applies_to_new_customers: Joi.boolean().default(true),
  applies_to_existing_customers: Joi.boolean().default(true),
  
  // Status and priority
  is_active: Joi.boolean().default(true),
  priority: Joi.number().integer().min(1).max(100).default(50)
});

export const updateSeasonalPricingSchema = Joi.object({
  name: Joi.string().max(200),
  description: Joi.string().allow('').max(1000),
  
  // Date ranges
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso().min(Joi.ref('start_date')),
  
  // Recurrence
  is_recurring: Joi.boolean(),
  recurrence_type: Joi.string().valid('yearly', 'monthly', 'weekly'),
  
  // Pricing adjustments
  adjustment_type: Joi.string().valid('percentage', 'fixed', 'override'),
  adjustment_value: Joi.number().min(0),
  
  // Target scope
  target_type: Joi.string().valid('all_services', 'category', 'specific_service', 'customer_segment'),
  target_id: Joi.string().uuid().allow(null),
  target_name: Joi.string().max(100),
  
  // Conditions
  min_order_amount: Joi.number().min(0),
  applies_to_new_customers: Joi.boolean(),
  applies_to_existing_customers: Joi.boolean(),
  
  // Status and priority
  is_active: Joi.boolean(),
  priority: Joi.number().integer().min(1).max(100)
});

export const seasonalPricingQuerySchema = Joi.object({
  active_only: Joi.boolean().optional(),
  upcoming: Joi.boolean().optional(),
  current: Joi.boolean().optional(),
  target_type: Joi.string().valid('all_services', 'category', 'specific_service', 'customer_segment').optional(),
  date: Joi.date().iso().optional()
});

export const evaluateSeasonalPricingSchema = Joi.object({
  service_id: Joi.string().uuid().required(),
  base_price: Joi.number().precision(2).positive().required(),
  quantity: Joi.number().integer().positive().default(1),
  evaluation_date: Joi.date().iso().optional(),
  customer_is_new: Joi.boolean().default(false)
});

export const bulkUpdateSeasonalStatusSchema = Joi.object({
  rule_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  is_active: Joi.boolean().required()
});

export const seasonalPricingIdSchema = Joi.object({
  id: Joi.string().uuid().required()
});

export const seasonalPricingSearchSchema = Joi.object({
  query: Joi.string().max(100).optional(),
  target_type: Joi.array().items(Joi.string().valid('all_services', 'category', 'specific_service', 'customer_segment')).optional(),
  adjustment_type: Joi.array().items(Joi.string().valid('percentage', 'fixed', 'override')).optional(),
  is_active: Joi.boolean().optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort_by: Joi.string().valid('name', 'priority', 'start_date', 'created_at').default('start_date'),
  sort_order: Joi.string().valid('asc', 'desc').default('asc')
});

// Schema for seasonal pricing duplication
export const duplicateSeasonalPricingSchema = Joi.object({
  name: Joi.string().required().max(200),
  description: Joi.string().allow('').max(1000).optional(),
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref('start_date')).required(),
  is_active: Joi.boolean().default(false)
});

// Schema for seasonal pricing activation/deactivation
export const seasonalPricingActivationSchema = Joi.object({
  is_active: Joi.boolean().required(),
  activation_reason: Joi.string().max(200).optional()
});

// Schema for seasonal pricing test evaluation
export const seasonalPricingTestSchema = Joi.object({
  rule_id: Joi.string().uuid().required(),
  test_cases: Joi.array().items(Joi.object({
    base_price: Joi.number().precision(2).positive().required(),
    service_id: Joi.string().uuid().optional(),
    evaluation_date: Joi.date().iso().optional(),
    expected_price: Joi.number().precision(2).positive().required()
  })).min(1).required()
});
