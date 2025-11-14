import Joi from 'joi';

export const createPricingRuleSchema = Joi.object({
  name: Joi.string().required().max(100),
  description: Joi.string().allow('').max(500),
  rule_type: Joi.string().valid('customer_category', 'time_based', 'quantity', 'bundle').required(),
  conditions: Joi.object({
    customer_category_id: Joi.string().uuid(),
    min_quantity: Joi.number().min(0),
    max_quantity: Joi.number().min(0),
    day_of_week: Joi.array().items(Joi.number().min(0).max(6)),
    time_of_day_start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    time_of_day_end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    min_total_amount: Joi.number().min(0),
    package_id: Joi.string().uuid()
  }),
  adjustment_type: Joi.string().valid('percentage', 'fixed', 'override').required(),
  adjustment_value: Joi.number().required(),
  target_entity: Joi.string().valid('service', 'package', 'customer').required(),
  target_id: Joi.string().uuid().allow(null),
  priority: Joi.number().integer().min(1).max(100).default(50),
  is_active: Joi.boolean().default(true),
  valid_from: Joi.date().iso().allow(null),
  valid_until: Joi.date().iso().allow(null)
});

export const updatePricingRuleSchema = Joi.object({
  name: Joi.string().max(100),
  description: Joi.string().allow('').max(500),
  rule_type: Joi.string().valid('customer_category', 'time_based', 'quantity', 'bundle'),
  conditions: Joi.object({
    customer_category_id: Joi.string().uuid(),
    min_quantity: Joi.number().min(0),
    max_quantity: Joi.number().min(0),
    day_of_week: Joi.array().items(Joi.number().min(0).max(6)),
    time_of_day_start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    time_of_day_end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    min_total_amount: Joi.number().min(0),
    package_id: Joi.string().uuid()
  }),
  adjustment_type: Joi.string().valid('percentage', 'fixed', 'override'),
  adjustment_value: Joi.number(),
  target_entity: Joi.string().valid('service', 'package', 'customer'),
  target_id: Joi.string().uuid().allow(null),
  priority: Joi.number().integer().min(1).max(100),
  is_active: Joi.boolean(),
  valid_from: Joi.date().iso().allow(null),
  valid_until: Joi.date().iso().allow(null)
});

export const evaluatePricingSchema = Joi.object({
  customer_category_id: Joi.string().uuid().optional(),
  service_id: Joi.string().uuid().optional(),
  package_id: Joi.string().uuid().optional(),
  customer_id: Joi.string().uuid().optional(),
  base_price: Joi.number().precision(2).positive().required(),
  quantity: Joi.number().integer().positive().default(1),
  current_time: Joi.date().optional()
});

export const evaluatePricingWithABACSchema = Joi.object({
  customer_category_id: Joi.string().uuid().optional(),
  service_id: Joi.string().uuid().optional(),
  package_id: Joi.string().uuid().optional(),
  customer_id: Joi.string().uuid().optional(),
  base_price: Joi.number().precision(2).positive().required(),
  quantity: Joi.number().integer().positive().default(1),
  current_time: Joi.date().optional(),
  user_context: Joi.object({
    override_pricing: Joi.boolean().default(false),
    discount_limit_override: Joi.number().min(0).max(100).optional()
  }).optional()
});

export const bulkUpdateStatusSchema = Joi.object({
  rule_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  is_active: Joi.boolean().required()
});

export const pricingRuleIdSchema = Joi.object({
  id: Joi.string().uuid().required()
});

export const pricingRuleQuerySchema = Joi.object({
  status: Joi.string().valid('active', 'inactive').optional(),
  rule_type: Joi.string().valid('customer_category', 'time_based', 'quantity', 'bundle').optional(),
  target_entity: Joi.string().valid('service', 'package', 'customer').optional()
});

export const pricingAdjustmentSchema = Joi.object({
  adjustment_type: Joi.string().valid('percentage', 'fixed', 'override').required(),
  adjustment_value: Joi.number().required(),
  description: Joi.string().max(200).optional()
});

export const pricingRuleConditionSchema = Joi.object({
  customer_category_id: Joi.string().uuid().optional(),
  min_quantity: Joi.number().min(1).optional(),
  max_quantity: Joi.number().min(1).optional(),
  day_of_week: Joi.array().items(Joi.number().min(0).max(6)).optional(),
  time_of_day_start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  time_of_day_end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  min_total_amount: Joi.number().min(0).optional(),
  package_id: Joi.string().uuid().optional(),
  service_ids: Joi.array().items(Joi.string().uuid()).optional(),
  customer_tier: Joi.string().valid('bronze', 'silver', 'gold', 'platinum').optional()
});

export const pricingRuleTestSchema = Joi.object({
  rule_id: Joi.string().uuid().required(),
  test_cases: Joi.array().items(Joi.object({
    base_price: Joi.number().precision(2).positive().required(),
    customer_category_id: Joi.string().uuid().optional(),
    service_id: Joi.string().uuid().optional(),
    quantity: Joi.number().integer().positive().default(1),
    expected_price: Joi.number().precision(2).positive().required()
  })).min(1).required()
});

export const pricingRulePrioritySchema = Joi.object({
  rule_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  priorities: Joi.array().items(Joi.number().integer().min(1).max(100)).min(1).required()
}).custom((value, helpers) => {
  if (value.rule_ids.length !== value.priorities.length) {
    return helpers.error('array.length', { message: 'rule_ids and priorities arrays must have the same length' });
  }
  return value;
});

// Schema for validating pricing rule activation/deactivation
export const pricingRuleActivationSchema = Joi.object({
  is_active: Joi.boolean().required(),
  activation_reason: Joi.string().max(200).optional()
});

// Schema for pricing rule duplication
export const duplicatePricingRuleSchema = Joi.object({
  name: Joi.string().required().max(100),
  description: Joi.string().allow('').max(500).optional(),
  is_active: Joi.boolean().default(false)
});

// Schema for pricing rule import/export
export const pricingRuleImportSchema = Joi.array().items(createPricingRuleSchema).min(1).max(100);

// Schema for pricing rule search and filter
export const pricingRuleSearchSchema = Joi.object({
  query: Joi.string().max(100).optional(),
  rule_type: Joi.array().items(Joi.string().valid('customer_category', 'time_based', 'quantity', 'bundle')).optional(),
  adjustment_type: Joi.array().items(Joi.string().valid('percentage', 'fixed', 'override')).optional(),
  target_entity: Joi.array().items(Joi.string().valid('service', 'package', 'customer')).optional(),
  is_active: Joi.boolean().optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort_by: Joi.string().valid('name', 'priority', 'created_at', 'updated_at').default('priority'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc')
});
