// File: backend/app/routes/refundRoutes.js
// UPDATED: Added new endpoints for enhanced functionality

import express from 'express';
import { RefundController } from '../controllers/refundController.js';
import { authenticate } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import { RefundSchemas } from '../schemas/refundSchemas.js';

const router = express.Router();

/**
 * @route   GET /api/refunds
 * @desc    List refunds with filters
 * @access  Private
 */
router.get('/', authenticate, RefundController.listRefunds);

/**
 * @route   GET /api/refunds/stats/summary
 * @desc    Get refund statistics and trends
 * @access  Private
 */
router.get('/stats/summary', authenticate, RefundController.getRefundStats);

/**
 * @route   POST /api/refunds
 * @desc    Create a new refund
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  validateRequest(RefundSchemas.createRefundSchema),
  RefundController.createRefund
);

/**
 * @route   GET /api/refunds/:id
 * @desc    Get refund by ID with full details
 * @access  Private
 */
router.get('/:id', authenticate, RefundController.getRefund);

/**
 * @route   POST /api/refunds/:id/process
 * @desc    Process a refund (approve and execute all reversals)
 * @access  Private
 */
router.post('/:id/process', authenticate, RefundController.processRefund);

/**
 * @route   POST /api/refunds/:id/approve
 * @desc    Approve and process a refund (legacy endpoint)
 * @access  Private
 */
router.post('/:id/approve', authenticate, RefundController.approveRefund);

/**
 * @route   POST /api/refunds/:id/reject
 * @desc    Reject a refund request
 * @access  Private
 */
router.post(
  '/:id/reject',
  authenticate,
  validateRequest(RefundSchemas.rejectRefundSchema),
  RefundController.rejectRefund
);

export default router;
