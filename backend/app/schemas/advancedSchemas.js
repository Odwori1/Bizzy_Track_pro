import Joi from 'joi';

export const bulkDepreciationSchema = Joi.object({
  periods: Joi.array().items(
    Joi.object({
      month: Joi.number().integer().min(1).max(12).required()
        .messages({
          'number.min': 'Month must be between 1-12',
          'number.max': 'Month must be between 1-12',
          'any.required': 'Month is required'
        }),
      year: Joi.number().integer().min(2000).max(2100).required()
        .messages({
          'number.min': 'Year must be after 2000',
          'number.max': 'Year must be before 2100',
          'any.required': 'Year is required'
        })
    })
  ).min(1).max(24).required()
    .messages({
      'array.min': 'At least one period is required',
      'array.max': 'Maximum 24 periods can be processed at once',
      'any.required': 'Periods array is required'
    })
});

export const historicalDepreciationSchema = Joi.object({
  asset_id: Joi.string().uuid().required()
    .messages({
      'string.guid': 'Valid asset ID is required',
      'any.required': 'Asset ID is required'
    }),
  month: Joi.number().integer().min(1).max(12).required()
    .messages({
      'number.min': 'Month must be between 1-12',
      'number.max': 'Month must be between 1-12',
      'any.required': 'Month is required'
    }),
  year: Joi.number().integer().min(2000).max(2100).required()
    .messages({
      'number.min': 'Year must be after 2000',
      'number.max': 'Year must be before 2100',
      'any.required': 'Year is required'
    })
});

export const overrideDepreciationSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required()
    .messages({
      'number.min': 'Month must be between 1-12',
      'number.max': 'Month must be between 1-12',
      'any.required': 'Month is required'
    }),
  year: Joi.number().integer().min(2000).max(2100).required()
    .messages({
      'number.min': 'Year must be after 2000',
      'number.max': 'Year must be before 2100',
      'any.required': 'Year is required'
    }),
  override_amount: Joi.number().precision(2).min(0).required()
    .messages({
      'number.min': 'Override amount must be positive',
      'any.required': 'Override amount is required'
    }),
  reason: Joi.string().min(5).max(500).required()
    .messages({
      'string.min': 'Reason must be at least 5 characters',
      'string.max': 'Reason must be less than 500 characters',
      'any.required': 'Reason is required'
    })
});

export const bulkImportSchema = Joi.object({
  assets: Joi.array().items(
    Joi.object({
      asset_name: Joi.string().max(255).required(),
      asset_code: Joi.string().max(50).optional(),
      category: Joi.string().valid(
        'land', 'building', 'vehicle', 'equipment', 'furniture',
        'computer', 'software', 'other', 'electronics'
      ).required(),
      purchase_cost: Joi.number().precision(2).positive().required(),
      purchase_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
      useful_life_months: Joi.number().integer().min(1).max(1200).optional(),
      depreciation_method: Joi.string().valid('straight_line', 'declining_balance').optional(),
      location: Joi.string().max(255).optional(),
      serial_number: Joi.string().max(100).optional(),
      model: Joi.string().max(100).optional(),
      manufacturer: Joi.string().max(100).optional(),
      condition_status: Joi.string()
        .valid('excellent', 'good', 'fair', 'poor', 'broken')
        .optional(),
      status: Joi.string()
        .valid('active', 'inactive', 'disposed', 'sold', 'scrapped')
        .optional()
    })
  ).min(1).max(1000).required()
});

export const searchAssetsSchema = Joi.object({
  search_text: Joi.string().max(100).optional(),
  category: Joi.string().max(50).optional(),
  min_value: Joi.number().min(0).optional(),
  max_value: Joi.number().min(0).optional(),
  department_id: Joi.string().uuid().optional(),
  status: Joi.string().max(50).optional(),
  depreciation_method: Joi.string().max(50).optional(),
  acquisition_method: Joi.string().max(50).optional(),
  is_existing_asset: Joi.boolean().optional(),
  condition_status: Joi.string().max(50).optional(),
  is_active: Joi.boolean().optional(),
  purchase_date_from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  purchase_date_to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort_by: Joi.string().valid(
    'asset_code', 'asset_name', 'purchase_date', 
    'purchase_cost', 'current_book_value', 'created_at'
  ).optional(),
  sort_order: Joi.string().valid('asc', 'desc').optional(),
  limit: Joi.number().integer().min(1).max(200).optional(),
  offset: Joi.number().integer().min(0).optional()
});
