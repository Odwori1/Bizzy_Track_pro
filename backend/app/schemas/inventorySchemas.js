import Joi from 'joi';

export const createInventoryCategorySchema = Joi.object({
  name: Joi.string().max(200).required(),
  description: Joi.string().max(1000).optional().allow(''),
  category_type: Joi.string().valid('sale', 'internal_use', 'both').default('sale'),
  is_active: Joi.boolean().default(true)
});

export const updateInventoryCategorySchema = Joi.object({
  name: Joi.string().max(200).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  category_type: Joi.string().valid('sale', 'internal_use', 'both').optional(),
  is_active: Joi.boolean().optional()
});

export const createInventoryItemSchema = Joi.object({
  category_id: Joi.string().uuid().required(),
  name: Joi.string().max(200).required(),
  description: Joi.string().max(1000).optional().allow(''),
  sku: Joi.string().max(100).required(),
  cost_price: Joi.number().precision(2).positive().required(),
  selling_price: Joi.number().precision(2).positive().required(),
  current_stock: Joi.number().precision(2).min(0).default(0),
  min_stock_level: Joi.number().precision(2).min(0).default(0),
  max_stock_level: Joi.number().precision(2).min(0).default(0),
  unit_of_measure: Joi.string().max(50).default('units'),
  is_active: Joi.boolean().default(true)
});

export const updateInventoryItemSchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  name: Joi.string().max(200).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  sku: Joi.string().max(100).optional(),
  cost_price: Joi.number().precision(2).positive().optional(),
  selling_price: Joi.number().precision(2).positive().optional(),
  min_stock_level: Joi.number().precision(2).min(0).optional(),
  max_stock_level: Joi.number().precision(2).min(0).optional(),
  unit_of_measure: Joi.string().max(50).optional(),
  is_active: Joi.boolean().optional()
});

export const createInventoryMovementSchema = Joi.object({
  inventory_item_id: Joi.string().uuid().required(),
  movement_type: Joi.string().valid(
    'purchase', 'sale', 'adjustment', 'transfer', 'return', 'damage', 'internal_use'
  ).required(),
  quantity: Joi.number().precision(2).required(),
  unit_cost: Joi.number().precision(2).positive().required(),
  reference_type: Joi.string().max(50).optional().allow(''),
  reference_id: Joi.string().uuid().optional().allow(''),
  notes: Joi.string().max(1000).optional().allow('')
});

export const inventoryQuerySchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  is_active: Joi.boolean().optional(),
  low_stock: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
