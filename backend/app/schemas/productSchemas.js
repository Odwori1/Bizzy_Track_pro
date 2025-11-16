import Joi from 'joi';

export const createProductSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().max(1000).optional().allow(''),
  sku: Joi.string().max(100).optional().allow(''), // ⭐ CHANGED TO OPTIONAL ⭐
  barcode: Joi.string().max(100).optional().allow(''),
  category_id: Joi.string().uuid().required(),
  cost_price: Joi.number().precision(2).min(0).required(),
  selling_price: Joi.number().precision(2).min(0).required(),
  current_stock: Joi.number().integer().min(0).default(0),
  min_stock_level: Joi.number().integer().min(0).default(0),
  max_stock_level: Joi.number().integer().min(0).default(1000),
  unit_of_measure: Joi.string().max(50).default('pieces'),
  is_active: Joi.boolean().default(true),
  has_variants: Joi.boolean().default(false),
  variant_data: Joi.object().optional(),
  image_urls: Joi.array().items(Joi.string()).optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

export const updateProductSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  description: Joi.string().max(1000).optional().allow(''),
  sku: Joi.string().max(100).optional(),
  barcode: Joi.string().max(100).optional().allow(''),
  category_id: Joi.string().uuid().optional(),
  cost_price: Joi.number().precision(2).min(0).optional(),
  selling_price: Joi.number().precision(2).min(0).optional(),
  min_stock_level: Joi.number().integer().min(0).optional(),
  max_stock_level: Joi.number().integer().min(0).optional(),
  unit_of_measure: Joi.string().max(50).optional(),
  is_active: Joi.boolean().optional(),
  has_variants: Joi.boolean().optional(),
  variant_data: Joi.object().optional(),
  image_urls: Joi.array().items(Joi.string()).optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

export const createProductVariantSchema = Joi.object({
  product_id: Joi.string().uuid().required(),
  variant_name: Joi.string().max(255).required(),
  sku: Joi.string().max(100).required(),
  barcode: Joi.string().max(100).optional().allow(''),
  cost_price: Joi.number().precision(2).min(0).required(),
  selling_price: Joi.number().precision(2).min(0).required(),
  current_stock: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true)
});

export const productQuerySchema = Joi.object({
  category_id: Joi.string().uuid().optional(),
  is_active: Joi.boolean().optional(),
  low_stock: Joi.boolean().optional(),
  has_variants: Joi.boolean().optional(),
  search: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
