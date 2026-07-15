// File: backend/app/controllers/refundController.js
// UPDATED: Full integration with enhanced RefundService
// PATCHED: approveRefund() and rejectRefund() now go through
// RefundApprovalService, which enforces userCanApprove() and maintains the
// refund_approval_queue / refund_approval_history audit trail. Previously
// these endpoints called RefundService.approveRefund()/rejectRefund()
// directly, which never checked permissions or the approval queue at all —
// this was the confirmed approval-bypass gap from the Phase 20 review.
//
// createRefund, getRefund, listRefunds, getRefundStats are unchanged.
// processRefund is unchanged at the controller level — RefundService.processRefund()
// itself now enforces assertApprovalSatisfied() (see refundService.patched.js),
// so it's safe to leave this endpoint calling straight through.

import { RefundService } from '../services/refundService.js';
import { RefundApprovalService } from '../services/refundApprovalService.js';
import { RefundSchemas } from '../schemas/refundSchemas.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { getClient } from '../utils/database.js';

export class RefundController {

  /**
   * Create a new refund
   * POST /api/refunds
   * (unchanged)
   */
  static async createRefund(req, res) {
    try {
      // Get business_id and userId from user (handle both camelCase and snake_case)
      const businessId = req.user.businessId || req.user.business_id;
      const userId = req.user.userId || req.user.id;

      if (!businessId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID or User ID not found in user session'
        });
      }

      // Validate request using our schema
      const validation = RefundSchemas.validateCreateRefund(req.body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validation.errors
        });
      }

      const refundData = validation.value;

      // Add business_id and additional metadata
      refundData.business_id = businessId;
      refundData.approval_threshold = req.user.approval_threshold || 10000; // Configurable

      log.info('Creating refund', {
        businessId,
        userId,
        transaction_id: refundData.original_transaction_id,
        transaction_type: refundData.original_transaction_type,
        total_refunded: refundData.total_refunded,
        requires_approval: refundData.total_refunded > (refundData.approval_threshold || 10000)
      });

      const result = await RefundService.createRefund(businessId, refundData, userId);

      const statusCode = result.requires_approval ? 202 : 201;

      return res.status(statusCode).json({
        success: true,
        data: result.refund,
        requires_approval: result.requires_approval || false,
        approval_id: result.approval_id || null,
        message: result.message
      });

    } catch (error) {
      log.error('Error creating refund:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create refund',
        error: error.message
      });
    }
  }

  /**
   * Process a refund that does NOT require approval (approval-required
   * refunds will now be rejected by RefundService.processRefund()'s
   * assertApprovalSatisfied() guard — see refundService.patched.js).
   * POST /api/refunds/:id/process
   * (unchanged at the controller level)
   */
  static async processRefund(req, res) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId || req.user.business_id;
      const userId = req.user.userId || req.user.id;

      if (!businessId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID or User ID not found in user session'
        });
      }

      log.info('Processing refund', {
        businessId,
        userId,
        refundId: id
      });

      const result = await RefundService.processRefund(id, userId, businessId);

      return res.status(200).json({
        success: true,
        data: result.refund,
        journal_entry_id: result.journal_entry_id,
        message: result.message
      });

    } catch (error) {
      log.error('Error processing refund:', error);
      // NEW: surface approval-required failures as 403, not a generic 500 —
      // this is an authorization gap, not a server error.
      const isApprovalGap = /requires approval/i.test(error.message || '');
      return res.status(isApprovalGap ? 403 : 500).json({
        success: false,
        message: isApprovalGap ? 'Refund requires approval before it can be processed' : 'Failed to process refund',
        error: error.message
      });
    }
  }

  /**
   * Approve a refund
   * POST /api/refunds/:id/approve
   *
   * PATCHED: now routes through RefundApprovalService instead of
   * RefundService.approveRefund(). This enforces userCanApprove() and
   * updates refund_approval_queue / refund_approval_history correctly.
   * If no approval request exists yet for this refund (shouldn't normally
   * happen — createRefund() creates one whenever requires_approval is
   * true — but handled defensively), one is created first.
   */
  static async approveRefund(req, res) {
    try {
      const { id } = req.params;
      const { notes } = req.body || {};
      const businessId = req.user.businessId || req.user.business_id;
      const userId = req.user.userId || req.user.id;

      if (!businessId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID or User ID not found in user session'
        });
      }

      const canApprove = await RefundApprovalService.userCanApprove(userId, businessId);
      if (!canApprove) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to approve refunds for this business'
        });
      }

      const client = await getClient();
      let approvalId;
      try {
        const refundRow = await client.query(
          `SELECT approval_id, requires_approval, status FROM refunds WHERE id = $1 AND business_id = $2`,
          [id, businessId]
        );

        if (refundRow.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Refund not found' });
        }

        approvalId = refundRow.rows[0].approval_id;

        if (!approvalId) {
          // Defensive path: create the approval request now if one is missing.
          const approvalRequest = await RefundApprovalService.createApprovalRequest(
            businessId, id, userId, {}
          );
          approvalId = approvalRequest.id;
        }
      } finally {
        client.release();
      }

      log.info('Approving refund', { businessId, userId, refundId: id, approvalId });

      const result = await RefundApprovalService.approveRefund(approvalId, userId, notes);

      return res.status(200).json({
        success: true,
        data: result.refund,
        approval: result.approval,
        message: result.message
      });

    } catch (error) {
      log.error('Error approving refund:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to approve refund',
        error: error.message
      });
    }
  }

  /**
   * Reject a refund
   * POST /api/refunds/:id/reject
   *
   * PATCHED: now routes through RefundApprovalService so rejection is
   * recorded in refund_approval_queue / refund_approval_history, not just
   * as a free-text note appended to refunds.notes.
   */
  static async rejectRefund(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const businessId = req.user.businessId || req.user.business_id;
      const userId = req.user.userId || req.user.id;

      if (!businessId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID or User ID not found in user session'
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required'
        });
      }

      const canApprove = await RefundApprovalService.userCanApprove(userId, businessId);
      if (!canApprove) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to reject refunds for this business'
        });
      }

      const client = await getClient();
      let approvalId;
      try {
        const refundRow = await client.query(
          `SELECT approval_id FROM refunds WHERE id = $1 AND business_id = $2`,
          [id, businessId]
        );

        if (refundRow.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Refund not found' });
        }

        approvalId = refundRow.rows[0].approval_id;

        if (!approvalId) {
          // No approval was ever required/created for this refund — fall back
          // to the simple status-only rejection.
          const result = await RefundService.rejectRefund(id, userId, businessId, reason);
          return res.status(200).json({
            success: true,
            data: result.refund,
            message: result.message
          });
        }
      } finally {
        client.release();
      }

      log.info('Rejecting refund', { businessId, userId, refundId: id, approvalId });

      const result = await RefundApprovalService.rejectRefund(approvalId, userId, reason);

      return res.status(200).json({
        success: true,
        approval: result.approval,
        message: result.message
      });

    } catch (error) {
      log.error('Error rejecting refund:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reject refund',
        error: error.message
      });
    }
  }

  /**
   * Get refund by ID with full details
   * GET /api/refunds/:id
   * (unchanged)
   */
  static async getRefund(req, res) {
    try {
      const { id } = req.params;
      const businessId = req.user.businessId || req.user.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const refund = await RefundService.getRefundById(id, businessId);

      return res.status(200).json({
        success: true,
        data: refund,
        message: 'Refund retrieved successfully'
      });

    } catch (error) {
      log.error('Error getting refund:', error);
      return res.status(404).json({
        success: false,
        message: error.message || 'Refund not found'
      });
    }
  }

  /**
   * List refunds with filters
   * GET /api/refunds
   * (unchanged)
   */
  static async listRefunds(req, res) {
    try {
      const businessId = req.user.businessId || req.user.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const {
        status,
        refund_type,
        transaction_type,
        start_date,
        end_date,
        search,
        page = 1,
        limit = 50
      } = req.query;

      const result = await RefundService.listRefunds(businessId, {
        status,
        refund_type,
        original_transaction_type: transaction_type,
        start_date,
        end_date,
        search,
        page: parseInt(page),
        limit: parseInt(limit)
      });

      return res.status(200).json({
        success: true,
        data: result.refunds,
        pagination: result.pagination,
        message: result.message
      });

    } catch (error) {
      log.error('Error listing refunds:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to list refunds',
        error: error.message
      });
    }
  }

  /**
   * Get refund statistics
   * GET /api/refunds/stats/summary
   * (unchanged)
   */
  static async getRefundStats(req, res) {
    try {
      const businessId = req.user.businessId || req.user.business_id;

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID not found in user session'
        });
      }

      const { start_date, end_date } = req.query;

      // Get statistics from the database
      const client = await getClient();
      try {
        const statsQuery = `
          SELECT
            COUNT(*) as total_refunds,
            COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_refunds,
            COUNT(*) FILTER (WHERE status = 'PENDING') as pending_refunds,
            COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_refunds,
            COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_refunds,
            COALESCE(SUM(total_refunded), 0) as total_amount_refunded,
            COALESCE(AVG(total_refunded), 0) as average_refund_amount,
            COUNT(*) FILTER (WHERE refund_type = 'FULL') as full_refunds,
            COUNT(*) FILTER (WHERE refund_type = 'PARTIAL') as partial_refunds
          FROM refunds
          WHERE business_id = $1
            AND ($2::date IS NULL OR created_at >= $2)
            AND ($3::date IS NULL OR created_at <= $3)
        `;

        const statsResult = await client.query(statsQuery, [
          businessId,
          start_date || null,
          end_date || null
        ]);

        // Get daily refund trend
        const trendQuery = `
          SELECT
            DATE(created_at) as date,
            COUNT(*) as refund_count,
            COALESCE(SUM(total_refunded), 0) as total_amount
          FROM refunds
          WHERE business_id = $1
            AND created_at >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          LIMIT 30
        `;

        const trendResult = await client.query(trendQuery, [businessId]);

        return res.status(200).json({
          success: true,
          data: {
            summary: statsResult.rows[0],
            trend: trendResult.rows
          },
          message: 'Refund statistics retrieved successfully'
        });

      } finally {
        client.release();
      }

    } catch (error) {
      log.error('Error getting refund stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get refund statistics',
        error: error.message
      });
    }
  }
}

export default RefundController;
