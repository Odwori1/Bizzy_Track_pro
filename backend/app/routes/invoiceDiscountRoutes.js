// File: ~/Bizzy_Track_pro/backend/app/routes/invoiceDiscountRoutes.js
// PURPOSE: Invoice discount API routes

import express from 'express';
import { InvoiceDiscountController } from '../controllers/invoiceDiscountController.js';
import { validateAccountingRequest } from '../middleware/accountingValidation.js';
import { invoiceDiscountSchemas } from '../schemas/invoiceDiscountSchemas.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/invoices/with-discount
 * @desc    Create invoice with discount calculation
 * @access  Private
 */
router.post(
    '/with-discount',
    validateAccountingRequest(invoiceDiscountSchemas.createInvoiceSchema),
    InvoiceDiscountController.createInvoiceWithDiscount
);

/**
 * @route   POST /api/invoices/:id/record-payment-with-discount
 * @desc    Record payment with early payment discount
 * @access  Private
 */
router.post(
    '/:id/record-payment-with-discount',
    validateAccountingRequest(invoiceDiscountSchemas.recordPaymentSchema),
    InvoiceDiscountController.recordPaymentWithDiscount
);

/**
 * @route   GET /api/invoices/:id/discount-status
 * @desc    Get discount status for invoice
 * @access  Private
 */
router.get(
    '/:id/discount-status',
    validateAccountingRequest(null),
    InvoiceDiscountController.getInvoiceDiscountStatus
);

export default router;
