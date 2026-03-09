// File: ~/Bizzy_Track_pro/backend/app/routes/discountSettingsRoutes.js
// PURPOSE: Discount settings API routes
// CREATED: February 28, 2026

import express from 'express';
import { DiscountSettingsController } from '../controllers/discountSettingsController.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { authenticate } from '../middleware/auth.js';
import Joi from 'joi';

const router = express.Router();

// Settings validation schema
const settingsSchema = Joi.object({
    approval_threshold: Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .optional()
        .messages({
            'number.min': 'Approval threshold must be at least 0%',
            'number.max': 'Approval threshold cannot exceed 100%'
        }),

    auto_approve_up_to: Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .optional()
        .messages({
            'number.min': 'Auto-approve threshold must be at least 0%',
            'number.max': 'Auto-approve threshold cannot exceed 100%'
        }),

    require_approval_for_stacked: Joi.boolean()
        .optional(),

    max_discount_per_transaction: Joi.number()
        .min(0)
        .max(100)
        .precision(2)
        .allow(null)
        .optional()
        .messages({
            'number.min': 'Max discount must be at least 0%',
            'number.max': 'Max discount cannot exceed 100%'
        }),

    default_allocation_method: Joi.string()
        .valid('PRO_RATA_AMOUNT', 'PRO_RATA_QUANTITY', 'MANUAL')
        .optional()
        .messages({
            'any.only': 'Allocation method must be PRO_RATA_AMOUNT, PRO_RATA_QUANTITY, or MANUAL'
        })
});

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/discounts/settings
 * @desc    Get discount settings for current business
 * @access  Private
 */
router.get(
    '/',
    validateAccountingRequest(null),
    DiscountSettingsController.getSettings
);

/**
 * @route   GET /api/discounts/settings/threshold
 * @desc    Get just the approval threshold (quick access)
 * @access  Private
 */
router.get(
    '/threshold',
    validateAccountingRequest(null),
    DiscountSettingsController.getApprovalThreshold
);

/**
 * @route   PUT /api/discounts/settings
 * @desc    Update discount settings
 * @access  Private (Admin/Owner only)
 */
router.put(
    '/',
    validateAccountingRequest(settingsSchema),
    DiscountSettingsController.updateSettings
);

/**
 * @route   POST /api/discounts/settings/reset
 * @desc    Reset settings to defaults
 * @access  Private (Admin/Owner only)
 */
router.post(
    '/reset',
    validateAccountingRequest(null),
    DiscountSettingsController.resetSettings
);

export default router;
