// File: ~/Bizzy_Track_pro/backend/app/schemas/posDiscountSchemas.js
// PURPOSE: Validation schemas for POS discount operations

import Joi from 'joi';

export const posDiscountSchemas = {
    /**
     * Create POS transaction with discount
     */
    createTransactionSchema: Joi.object({
        customer_id: Joi.string().uuid().required(),
        items: Joi.array().items(
            Joi.object({
                service_id: Joi.string().uuid().optional(),
                product_id: Joi.string().uuid().optional(),
                inventory_item_id: Joi.string().uuid().optional(),
                equipment_id: Joi.string().uuid().optional(),
                booking_id: Joi.string().uuid().optional(),
                item_type: Joi.string().valid(
                    'service', 
                    'product', 
                    'inventory',
                    'equipment_hire'
                ).required(),
                item_name: Joi.string().required(),
                quantity: Joi.number().integer().positive().required(),
                unit_price: Joi.number().positive().precision(2).required(),
                tax_category_code: Joi.string().optional().default('STANDARD_GOODS'),
                discount_amount: Joi.number().min(0).precision(2).optional().default(0)
            }).custom((value, helpers) => {
                // For manual items (no IDs), allow without validation
                // For product/service types, validate based on item_type
                if (value.item_type === 'product' && !value.product_id && !value.inventory_item_id) {
                    // Manual product - allowed
                    return value;
                }
                if (value.item_type === 'service' && !value.service_id) {
                    // Manual service - allowed
                    return value;
                }
                if (value.item_type === 'inventory' && !value.inventory_item_id) {
                    return helpers.error('any.invalid', {
                        message: 'inventory_item_id required for inventory type'
                    });
                }
                return value;
            }, 'Item validation')
        ).min(1).required(),
        
        payment_method: Joi.string().valid(
            'cash', 
            'card', 
            'mobile_money', 
            'bank_transfer', 
            'multiple'
        ).required(),
        
        payment_status: Joi.string().valid('pending', 'completed', 'failed').default('completed'),
        status: Joi.string().valid('draft', 'completed', 'voided').default('completed'),
        notes: Joi.string().max(500).optional().allow(''),
        transaction_date: Joi.date().iso().optional(),

        // Discount fields
        promo_code: Joi.string().max(50).optional(),
        apply_discounts: Joi.boolean().default(true),
        pre_approved: Joi.boolean().default(false),
        
        // Calculated fields (can be passed or calculated)
        discount_amount: Joi.number().min(0).precision(2).optional(),
        total_discount: Joi.number().min(0).precision(2).optional(),
        discount_breakdown: Joi.alternatives().try(
            Joi.object(),
            Joi.string()
        ).optional(),
        final_amount: Joi.number().min(0).precision(2).optional()
    }).custom((value, helpers) => {
        // Validate that if pre_approved is true, we have a way to apply discount
        if (value.pre_approved && !value.promo_code && !value.discount_amount) {
            return helpers.error('any.invalid', {
                message: 'pre_approved requires either promo_code or discount_amount'
            });
        }
        return value;
    }, 'Pre-approval validation'),

    /**
     * Get transaction by ID
     */
    getTransactionSchema: Joi.object({
        id: Joi.string().uuid().required()
    }),

    /**
     * Apply discount to existing transaction
     */
    applyDiscountSchema: Joi.object({
        transaction_id: Joi.string().uuid().required(),
        promo_code: Joi.string().max(50).required(),
        pre_approved: Joi.boolean().default(false)
    }),

    /**
     * Approve discount for transaction
     */
    approveDiscountSchema: Joi.object({
        transaction_id: Joi.string().uuid().required(),
        approval_id: Joi.string().uuid().required(),
        action: Joi.string().valid('approve', 'reject').required(),
        reason: Joi.string().max(500).when('action', {
            is: 'reject',
            then: Joi.required()
        })
    })
};

export default posDiscountSchemas;
