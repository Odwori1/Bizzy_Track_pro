import Joi from 'joi';

export const priceHistoryQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(1000).default(50),
  offset: Joi.number().integer().min(0).default(0),
  change_type: Joi.string().valid('manual', 'bulk_update', 'seasonal', 'pricing_rule', 'initial').optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional()
});

export const businessPriceHistoryQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
  entity_type: Joi.string().valid('service', 'package').optional(),
  change_type: Joi.string().valid('manual', 'bulk_update', 'seasonal', 'pricing_rule', 'initial').optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional()
});

export const priceHistoryStatsSchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30)
});

export const priceChangeSummarySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(365)
});

export const exportPriceHistorySchema = Joi.object({
  format: Joi.string().valid('csv', 'json').default('csv'),
  entity_type: Joi.string().valid('service', 'package').optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional()
});

export const manualPriceChangeSchema = Joi.object({
  entity_type: Joi.string().valid('service', 'package').required(),
  entity_id: Joi.string().uuid().required(),
  entity_name: Joi.string().max(200).required(),
  old_price: Joi.number().precision(2).min(0).optional().allow(null),
  new_price: Joi.number().precision(2).min(0).required(),
  change_reason: Joi.string().max(500).required()
});

export const priceHistorySearchSchema = Joi.object({
  entity_type: Joi.array().items(Joi.string().valid('service', 'package')).optional(),
  change_type: Joi.array().items(Joi.string().valid('manual', 'bulk_update', 'seasonal', 'pricing_rule', 'initial')).optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
  search: Joi.string().max(100).optional(),
  min_price_change: Joi.number().optional(),
  max_price_change: Joi.number().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(500).default(50),
  sort_by: Joi.string().valid('created_at', 'new_price', 'entity_name', 'change_type').default('created_at'),
  sort_order: Joi.string().valid('asc', 'desc').default('desc')
});

export const priceTrendAnalysisSchema = Joi.object({
  entity_type: Joi.string().valid('service', 'package').required(),
  entity_id: Joi.string().uuid().required(),
  period: Joi.string().valid('7days', '30days', '90days', '1year', 'all').default('30days'),
  granularity: Joi.string().valid('daily', 'weekly', 'monthly').default('daily')
});

export const bulkPriceChangeSchema = Joi.object({
  changes: Joi.array().items(Joi.object({
    entity_type: Joi.string().valid('service', 'package').required(),
    entity_id: Joi.string().uuid().required(),
    entity_name: Joi.string().max(200).required(),
    old_price: Joi.number().precision(2).min(0).optional().allow(null),
    new_price: Joi.number().precision(2).min(0).required(),
    change_reason: Joi.string().max(500).required()
  })).min(1).max(100).required(),
  batch_name: Joi.string().max(100).optional(),
  batch_description: Joi.string().max(500).optional()
});

export const priceComparisonSchema = Joi.object({
  entity_ids: Joi.array().items(Joi.string().uuid()).min(1).max(10).required(),
  period: Joi.string().valid('7days', '30days', '90days', '1year').default('30days'),
  comparison_type: Joi.string().valid('price_changes', 'percentage_changes', 'volatility').default('price_changes')
});
