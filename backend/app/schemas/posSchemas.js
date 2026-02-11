import Joi from 'joi';

export const createPOSTransactionSchema = Joi.object({
  customer_id: Joi.string().uuid().optional().allow(null),
  transaction_date: Joi.date().optional(),
  
  // ✅ CHANGED: Make these optional - system will calculate them
  total_amount: Joi.number().precision(2).min(0).optional(),
  tax_amount: Joi.number().precision(2).min(0).optional().default(0),
  discount_amount: Joi.number().precision(2).min(0).optional().default(0),
  final_amount: Joi.number().precision(2).min(0).optional(),
  
  payment_method: Joi.string().valid('cash', 'card', 'mobile_money', 'credit', 'multiple').required(),
  payment_status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').default('completed'),
  status: Joi.string().valid('pending', 'completed', 'cancelled', 'refunded').default('completed'),
  notes: Joi.string().max(1000).optional().allow(''),
  
  items: Joi.array().items(
    Joi.object({
      product_id: Joi.string().uuid().optional().allow(null),
      inventory_item_id: Joi.string().uuid().optional().allow(null),
      service_id: Joi.string().uuid().optional().allow(null),
      equipment_id: Joi.string().uuid().optional().allow(null),
      item_type: Joi.string().valid('product', 'service', 'equipment_hire', 'inventory', 'manual').required(),
      item_name: Joi.string().max(255).required(),
      quantity: Joi.number().integer().min(1).required(),
      unit_price: Joi.number().precision(2).min(0).required(),
      
      // ✅ CHANGED: Make total_price optional - system will calculate it
      total_price: Joi.number().precision(2).min(0).optional(),
      discount_amount: Joi.number().precision(2).min(0).default(0),
      
      // ✅ NEW: Tax fields for manual override
      tax_category_code: Joi.string().valid(
        'STANDARD_GOODS',
        'SERVICES',
        'PHARMACEUTICALS',
        'DIGITAL_SERVICES',
        'ESSENTIAL_GOODS',
        'FINANCIAL_SERVICES',
        'EDUCATION_SERVICES',
        'AGRICULTURAL',
        'EXPORT_GOODS'
      ).optional(),
      
      tax_rate: Joi.number().precision(2).min(0).max(100).optional(),
      tax_amount: Joi.number().precision(2).min(0).optional()
    })
  ).min(1).required()
}).custom((value, helpers) => {
  // ✅ Custom validation for item type requirements
  for (let i = 0; i < value.items.length; i++) {
    const item = value.items[i];
    
    // Validate product items
    if (item.item_type === 'product' && !item.product_id) {
      return helpers.error('any.invalid', {
        message: `items[${i}].product_id is required for product items`
      });
    }
    
    // Validate inventory items
    if (item.item_type === 'inventory' && !item.inventory_item_id) {
      return helpers.error('any.invalid', {
        message: `items[${i}].inventory_item_id is required for inventory items`
      });
    }
    
    // Validate service items
    if (item.item_type === 'service' && !item.service_id) {
      return helpers.error('any.invalid', {
        message: `items[${i}].service_id is required for service items`
      });
    }
    
    // Validate equipment hire items
    if (item.item_type === 'equipment_hire' && !item.equipment_id) {
      return helpers.error('any.invalid', {
        message: `items[${i}].equipment_id is required for equipment_hire items`
      });
    }
  }
  
  return value;
});

export const updatePOSTransactionSchema = Joi.object({
  customer_id: Joi.string().uuid().optional().allow(null),
  payment_status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
  status: Joi.string().valid('pending', 'completed', 'cancelled', 'refunded').optional(),
  notes: Joi.string().max(1000).optional().allow('')
});

export const posQuerySchema = Joi.object({
  customer_id: Joi.string().uuid().optional(),
  payment_method: Joi.string().valid('cash', 'card', 'mobile_money', 'credit', 'multiple').optional(),
  payment_status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
  status: Joi.string().valid('pending', 'completed', 'cancelled', 'refunded').optional(),
  start_date: Joi.date().optional(),
  end_date: Joi.date().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
});
