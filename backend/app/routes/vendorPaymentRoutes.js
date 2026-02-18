// File: backend/app/routes/vendorPaymentRoutes.js
import express from 'express';
import { VendorPaymentController } from '../controllers/vendorPaymentController.js';

const router = express.Router();

/**
 * @route   GET /api/vendor-payments/test
 * @desc    Test controller endpoint
 * @access  Private
 */
router.get('/test', VendorPaymentController.testController);

/**
 * @route   GET /api/vendor-payments/summary
 * @desc    Get payment summary
 * @access  Private
 */
router.get('/summary', VendorPaymentController.getPaymentSummary);

/**
 * @route   GET /api/vendor-payments
 * @desc    List payments with filters
 * @access  Private
 */
router.get('/', VendorPaymentController.listPayments);

/**
 * @route   POST /api/vendor-payments
 * @desc    Create new payment
 * @access  Private
 */
router.post('/', VendorPaymentController.createPayment);

/**
 * @route   GET /api/vendor-payments/:id
 * @desc    Get specific payment by ID
 * @access  Private
 */
router.get('/:id', VendorPaymentController.getPaymentById);

/**
 * @route   PUT /api/vendor-payments/:id/reconcile
 * @desc    Update reconciliation status
 * @access  Private
 */
router.put('/:id/reconcile', VendorPaymentController.updateReconciliation);

export default router;
