import Joi from 'joi';

/**
 * PRODUCTION-READY FIXED ASSET SCHEMA
 *
 * Key Features:
 * 1. Accepts BOTH useful_life_months and useful_life_years
 * 2. Handles dates as strings to prevent timezone shifts (CRITICAL FIX)
 * 3. Transforms years → months when needed
 * 4. Maps old field names to new database schema
 * 5. No unwanted defaults that override user input
 */

export const createFixedAssetSchema = Joi.object({
  // Asset identification
  asset_code: Joi.string().max(50).optional(),
  asset_name: Joi.string().max(255).required(),

  // ✅ FIX: Updated categories to match database constraints
  category: Joi.string().valid(
    'land', 'building', 'vehicle', 'equipment', 'furniture',
    'computer', 'software', 'other', 'electronics'
  ).required(),

  // Description (maps to notes in database)
  description: Joi.string().max(1000).optional().allow('').allow(null),
  notes: Joi.string().max(1000).optional().allow('').allow(null),

  // ✅ CRITICAL FIX: Only accept ISO date strings (YYYY-MM-DD)
  // Do NOT accept Date objects to prevent timezone conversion
  purchase_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
    .messages({
      'string.pattern.base': 'purchase_date must be in YYYY-MM-DD format'
    }),

  // ✅ FIX: Accept both field names (purchase_price and purchase_cost)
  purchase_price: Joi.number().precision(2).positive().optional(),
  purchase_cost: Joi.number().precision(2).positive().optional(),

  // Supplier and invoice
  supplier: Joi.string().max(255).optional().allow('').allow(null),
  supplier_id: Joi.string().uuid().optional().allow(null),
  invoice_reference: Joi.string().max(100).optional().allow('').allow(null),

  // Current value
  current_value: Joi.number().precision(2).min(0).optional().allow(null),

  // ✅ FIX: Depreciation - Accept BOTH months and years
  useful_life_months: Joi.number().integer().min(1).max(1200).optional(),
  useful_life_years: Joi.number().min(0.1).max(100).optional(),

  depreciation_method: Joi.string().valid('straight_line', 'declining_balance', 'reducing_balance')
    .optional()
    .allow(null),

  depreciation_rate: Joi.number().min(0).max(100).optional().allow(null),

  salvage_value: Joi.number().precision(2).min(0).optional().allow(null),

  // Physical details
  location: Joi.string().max(255).optional().allow('').allow(null),
  serial_number: Joi.string().max(100).optional().allow('').allow(null),
  model: Joi.string().max(100).optional().allow('').allow(null),
  manufacturer: Joi.string().max(100).optional().allow('').allow(null),

  // Status
  condition_status: Joi.string()
    .valid('excellent', 'good', 'fair', 'poor', 'broken')
    .optional()
    .allow(null),

  status: Joi.string()
    .valid('active', 'idle', 'under_maintenance', 'disposed', 'sold', 'scrapped')
    .optional()
    .allow(null),

  // Department and purchase order
  department_id: Joi.string().uuid().optional().allow(null),
  purchase_order_id: Joi.string().uuid().optional().allow(null),

  // Insurance and maintenance
  insurance_details: Joi.object().optional().allow(null),
  maintenance_schedule: Joi.string()
    .valid('none', 'monthly', 'quarterly', 'biannual', 'annual')
    .optional()
    .allow(null),
  last_maintenance_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().allow(null),
  next_maintenance_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().allow(null)
})
.custom((value, helpers) => {
  // ✅ TRANSFORM 1: Ensure at least one price field exists
  if (!value.purchase_price && !value.purchase_cost) {
    return helpers.error('object.missing', {
      message: 'Either purchase_price or purchase_cost is required'
    });
  }

  // Map purchase_price → purchase_cost for database compatibility
  if (value.purchase_price && !value.purchase_cost) {
    value.purchase_cost = value.purchase_price;
  }

  // ✅ TRANSFORM 2: Convert useful_life_years → useful_life_months
  if (value.useful_life_years && !value.useful_life_months) {
    value.useful_life_months = Math.round(value.useful_life_years * 12);
  }

  // ✅ CRITICAL FIX: Keep purchase_date as pure string - NO DATE CONVERSION
  // The date is already validated as YYYY-MM-DD string by Joi.string().pattern()
  // Do NOT parse it or convert to Date object - this prevents timezone shifts
  
  // Just validate it's a valid date
  if (value.purchase_date) {
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = value.purchase_date.match(dateRegex);
    
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      
      // Basic validation
      if (month < 1 || month > 12) {
        return helpers.error('date.invalid', {
          message: 'Invalid month in purchase_date'
        });
      }
      
      if (day < 1 || day > 31) {
        return helpers.error('date.invalid', {
          message: 'Invalid day in purchase_date'
        });
      }
      
      // ✅ VALIDATION: Prevent unreasonable future dates
      // Compare as strings to avoid timezone issues
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const maxFutureDate = new Date(today);
      maxFutureDate.setFullYear(today.getFullYear() + 1);
      const maxFutureStr = maxFutureDate.toISOString().split('T')[0];
      
      if (value.purchase_date > maxFutureStr) {
        return helpers.error('date.max', {
          message: 'purchase_date cannot be more than 1 year in the future'
        });
      }
    }
  }

  // Map description → notes for database compatibility
  if (value.description && !value.notes) {
    value.notes = value.description;
  }

  // Normalize depreciation_method
  if (value.depreciation_method === 'reducing_balance') {
    value.depreciation_method = 'declining_balance';
  }

  return value;
}, 'Asset field transformations');

export const updateFixedAssetSchema = Joi.object({
  asset_name: Joi.string().max(255).optional(),

  category: Joi.string().valid(
    'land', 'building', 'vehicle', 'equipment', 'furniture',
    'computer', 'software', 'other', 'electronics'
  ).optional(),

  description: Joi.string().max(1000).optional().allow('').allow(null),
  notes: Joi.string().max(1000).optional().allow('').allow(null),

  current_value: Joi.number().precision(2).min(0).optional().allow(null),

  location: Joi.string().max(255).optional().allow('').allow(null),

  condition_status: Joi.string()
    .valid('excellent', 'good', 'fair', 'poor', 'broken')
    .optional()
    .allow(null),

  status: Joi.string()
    .valid('active', 'idle', 'under_maintenance', 'disposed', 'sold', 'scrapped')
    .optional()
    .allow(null),

  serial_number: Joi.string().max(100).optional().allow('').allow(null),
  model: Joi.string().max(100).optional().allow('').allow(null),
  manufacturer: Joi.string().max(100).optional().allow('').allow(null),

  insurance_details: Joi.object().optional().allow(null),
  maintenance_schedule: Joi.string()
    .valid('none', 'monthly', 'quarterly', 'biannual', 'annual')
    .optional()
    .allow(null),
  next_maintenance_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional().allow(null)
})
.custom((value, helpers) => {
  // Map description → notes if needed
  if (value.description && !value.notes) {
    value.notes = value.description;
  }
  return value;
}, 'Update field transformations');

/**
 * Schema for registering existing assets
 */
export const registerExistingAssetSchema = Joi.object({
  asset_code: Joi.string().max(50).optional(),
  asset_name: Joi.string().max(255).required(),

  category: Joi.string().valid(
    'land', 'building', 'vehicle', 'equipment', 'furniture',
    'computer', 'software', 'other', 'electronics'
  ).required(),

  initial_book_value: Joi.number().precision(2).positive().required(),
  existing_accumulated_depreciation: Joi.number().precision(2).min(0).optional().default(0),

  // ✅ CRITICAL FIX: Only string dates
  purchase_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),

  purchase_cost: Joi.number().precision(2).positive().optional(),

  useful_life_months: Joi.number().integer().min(1).max(1200).optional(),
  useful_life_years: Joi.number().min(0.1).max(100).optional(),

  depreciation_method: Joi.string()
    .valid('straight_line', 'declining_balance')
    .optional()
    .allow(null),

  salvage_value: Joi.number().precision(2).min(0).optional().allow(null),

  location: Joi.string().max(255).optional().allow('').allow(null),
  serial_number: Joi.string().max(100).optional().allow('').allow(null),
  model: Joi.string().max(100).optional().allow('').allow(null),
  manufacturer: Joi.string().max(100).optional().allow('').allow(null),

  condition_status: Joi.string()
    .valid('excellent', 'good', 'fair', 'poor', 'broken')
    .optional()
    .allow(null),

  notes: Joi.string().max(1000).optional().allow('').allow(null)
})
.custom((value, helpers) => {
  // Transform years → months
  if (value.useful_life_years && !value.useful_life_months) {
    value.useful_life_months = Math.round(value.useful_life_years * 12);
  }

  // ✅ CRITICAL FIX: Keep date as string - no conversion
  if (value.purchase_date) {
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = value.purchase_date.match(dateRegex);
    
    if (match) {
      const today = new Date().toISOString().split('T')[0];
      const maxFuture = new Date();
      maxFuture.setFullYear(maxFuture.getFullYear() + 1);
      const maxFutureStr = maxFuture.toISOString().split('T')[0];
      
      if (value.purchase_date > maxFutureStr) {
        return helpers.error('date.max', {
          message: 'purchase_date cannot be more than 1 year in the future'
        });
      }
    }
  }

  // Validate book value
  if (value.purchase_cost && value.existing_accumulated_depreciation) {
    const calculatedBookValue = value.purchase_cost - value.existing_accumulated_depreciation;
    if (calculatedBookValue < 0) {
      return helpers.error('object.invalid', {
        message: 'Existing accumulated depreciation cannot exceed purchase cost'
      });
    }
    if (!value.initial_book_value) {
      value.initial_book_value = calculatedBookValue;
    }
  }

  return value;
}, 'Existing asset transformations');

/**
 * Schema for posting monthly depreciation
 */
export const postMonthlyDepreciationSchema = Joi.object({
  month: Joi.number().integer().min(1).max(12).required(),
  year: Joi.number().integer().min(2000).max(2100).required(),
  allow_current_month: Joi.boolean().optional().default(true),
  allow_partial_posting: Joi.boolean().optional().default(true)
});

/**
 * Schema for asset disposal
 */
export const disposeAssetSchema = Joi.object({
  // ✅ CRITICAL FIX: Only string dates
  disposal_date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required()
    .messages({
      'string.pattern.base': 'disposal_date must be in YYYY-MM-DD format'
    }),

  disposal_method: Joi.string()
    .valid('sale', 'scrap', 'donation', 'transfer', 'lost')
    .required(),

  disposal_amount: Joi.number().precision(2).min(0).optional().default(0),

  notes: Joi.string().max(1000).optional().allow('').allow(null),

  create_journal_entry: Joi.boolean().optional().default(true)
})
.custom((value, helpers) => {
  // ✅ CRITICAL FIX: Keep date as string - no conversion
  if (value.disposal_date) {
    const today = new Date().toISOString().split('T')[0];
    const maxFuture = new Date();
    maxFuture.setFullYear(maxFuture.getFullYear() + 1);
    const maxFutureStr = maxFuture.toISOString().split('T')[0];
    
    if (value.disposal_date > maxFutureStr) {
      return helpers.error('date.max', {
        message: 'disposal_date cannot be more than 1 year in the future'
      });
    }
  }
  return value;
}, 'Disposal date transformation');
