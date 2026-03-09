// File: ~/Bizzy_Track_pro/backend/app/schemas/invoiceDiscountSchemas.js
// PURPOSE: Validation schemas for invoice discount operations
// FIXED: Removed invoice_id from body validation (comes from URL params)

import Joi from 'joi';

export const invoiceDiscountSchemas = {
    /**
     * Create invoice with discount
     */
    createInvoiceSchema: Joi.object({
        customer_id: Joi.string().uuid().required(),
        job_id: Joi.string().uuid().optional(),
        line_items: Joi.array().items(
            Joi.object({
                service_id: Joi.string().uuid().optional(),
                product_id: Joi.string().uuid().optional(),
                description: Joi.string().required(),
                quantity: Joi.number().integer().positive().required(),
                unit_price: Joi.number().positive().precision(2).required(),
                tax_rate: Joi.number().min(0).max(100).precision(2).optional(),
                tax_category_code: Joi.string().optional()
            })
        ).min(1).required(),
        invoice_date: Joi.date().iso().optional(),
        due_date: Joi.date().iso().min(Joi.ref('invoice_date')).optional(),
        notes: Joi.string().max(1000).optional().allow(''),
        terms: Joi.string().max(1000).optional().allow(''),

        // Discount fields
        promo_code: Joi.string().max(50).optional(),
        apply_discounts: Joi.boolean().default(true),
        pre_approved: Joi.boolean().default(false),
        early_payment_terms_id: Joi.string().uuid().optional()
    }),

    /**
     * Get invoice by ID
     */
    getInvoiceSchema: Joi.object({
        id: Joi.string().uuid().required()
    }),

    /**
     * Apply discount to existing invoice
     */
    applyDiscountSchema: Joi.object({
        invoice_id: Joi.string().uuid().required(),
        promo_code: Joi.string().max(50).required(),
        pre_approved: Joi.boolean().default(false)
    }),

    /**
     * Record payment with early payment discount
     * FIXED: Removed invoice_id from body (comes from URL params)
     */
    recordPaymentSchema: Joi.object({
        amount: Joi.number().positive().precision(2).required(),
        payment_method: Joi.string().valid('cash', 'card', 'bank_transfer', 'mobile_money').required(),
        payment_date: Joi.date().iso().required(),
        apply_early_payment_discount: Joi.boolean().default(true)
    })
};

export default invoiceDiscountSchemas;
