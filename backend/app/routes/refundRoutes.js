import { requireAuth } from '../middleware/requireAuth.js';
// File: backend/app/routes/refundRoutes.js
// Main refund routes (NOT approval routes)

import express from 'express';
import { RefundController } from '../controllers/refundController.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// ============================================================================
// MAIN REFUND CRUD ROUTES
// ============================================================================

// Create a new refund request
router.post('/', RefundController.createRefund);

// List refunds with filters
router.get('/', RefundController.listRefunds);

// Get refund statistics
router.get('/stats/summary', RefundController.getRefundStats);

// Get refund by ID (must come AFTER /stats/summary to avoid conflict)
router.get('/:id', RefundController.getRefund);

// ============================================================================
// REFUND ACTION ROUTES
// ============================================================================

// Process/execute a refund (triggers accounting)
router.post('/:id/process', requirePermission('refund:process'), RefundController.processRefund);

// Approve a refund (legacy - now calls processRefund)
router.post('/:id/approve', requirePermission('refund_approval:approve'), RefundController.approveRefund);

// Reject a refund
router.post('/:id/reject', requirePermission('refund_approval:reject'), RefundController.rejectRefund);

export default router;
