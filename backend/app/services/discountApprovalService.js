import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class DiscountApprovalService {
  static async createDiscountApproval(businessId, approvalData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if discount requires approval based on threshold
      const requiresApproval = approvalData.requires_approval &&
        approvalData.discount_percentage >= (approvalData.approval_threshold || 20);

      const result = await client.query(
        `INSERT INTO discount_approvals (
          business_id, job_id, invoice_id, requested_by,
          original_amount, requested_discount, discount_percentage,
          reason, status, requires_approval, approval_threshold
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          businessId,
          approvalData.job_id,
          approvalData.invoice_id,
          userId,
          approvalData.original_amount,
          approvalData.requested_discount,
          approvalData.discount_percentage,
          approvalData.reason,
          requiresApproval ? 'pending' : 'approved',
          requiresApproval,
          approvalData.approval_threshold || 20
        ]
      );

      const approval = result.rows[0];

      // Log the approval request
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'discount_approval.created',
        resourceType: 'discount_approval',
        resourceId: approval.id,
        newValues: {
          job_id: approvalData.job_id,
          discount_percentage: approvalData.discount_percentage,
          status: approval.status,
          requires_approval: requiresApproval
        }
      });

      log.info('Discount approval created', {
        businessId,
        userId,
        approvalId: approval.id,
        status: approval.status,
        requiresApproval
      });

      await client.query('COMMIT');
      return approval;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPendingApprovals(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT da.*,
                u.full_name as requested_by_name,
                j.job_number,
                i.invoice_number
         FROM discount_approvals da
         LEFT JOIN users u ON da.requested_by = u.id
         LEFT JOIN jobs j ON da.job_id = j.id
         LEFT JOIN invoices i ON da.invoice_id = i.id
         WHERE da.business_id = $1 AND da.status = 'pending'
         ORDER BY da.created_at DESC`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching pending approvals:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getApprovalById(businessId, approvalId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT da.*,
                u.full_name as requested_by_name,
                j.job_number,
                i.invoice_number,
                approver.full_name as approved_by_name
         FROM discount_approvals da
         LEFT JOIN users u ON da.requested_by = u.id
         LEFT JOIN jobs j ON da.job_id = j.id
         LEFT JOIN invoices i ON da.invoice_id = i.id
         LEFT JOIN users approver ON da.approved_by = approver.id
         WHERE da.id = $1 AND da.business_id = $2`,
        [approvalId, businessId]
      );
      return result.rows[0];
    } catch (error) {
      log.error('Error fetching approval by ID:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateApprovalStatus(businessId, approvalId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const existingApproval = await client.query(
        'SELECT * FROM discount_approvals WHERE id = $1 AND business_id = $2',
        [approvalId, businessId]
      );

      if (!existingApproval.rows[0]) {
        throw new Error('Discount approval not found');
      }

      const result = await client.query(
        `UPDATE discount_approvals
         SET status = $1,
             approval_notes = COALESCE($2, approval_notes),
             approved_by = $3,
             approved_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND business_id = $5
         RETURNING *`,
        [
          updateData.status,
          updateData.approval_notes,
          userId,
          approvalId,
          businessId
        ]
      );

      const updatedApproval = result.rows[0];

      // Log the approval status change
      await auditLogger.logAction({
        businessId,
        userId,
        action: `discount_approval.${updateData.status}`,
        resourceType: 'discount_approval',
        resourceId: approvalId,
        newValues: {
          status: updateData.status,
          approval_notes: updateData.approval_notes
        }
      });

      log.info('Discount approval status updated', {
        businessId,
        userId,
        approvalId,
        oldStatus: existingApproval.rows[0].status,
        newStatus: updateData.status
      });

      await client.query('COMMIT');
      return updatedApproval;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getApprovalHistory(businessId, filters = {}) {
    const client = await getClient();
    try {
      let queryStr = `
        SELECT da.*,
               u.full_name as requested_by_name,
               j.job_number,
               i.invoice_number,
               approver.full_name as approved_by_name
        FROM discount_approvals da
        LEFT JOIN users u ON da.requested_by = u.id
        LEFT JOIN jobs j ON da.job_id = j.id
        LEFT JOIN invoices i ON da.invoice_id = i.id
        LEFT JOIN users approver ON da.approved_by = approver.id
        WHERE da.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.status) {
        paramCount++;
        queryStr += ` AND da.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.job_id) {
        paramCount++;
        queryStr += ` AND da.job_id = $${paramCount}`;
        params.push(filters.job_id);
      }

      queryStr += ' ORDER BY da.created_at DESC';

      log.info('🗄️ Database Query:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Database query failed in getApprovalHistory:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  static async checkDiscountRequiresApproval(businessId, discountPercentage, threshold = 20) {
    try {
      // Check if discount percentage exceeds the approval threshold
      return discountPercentage >= threshold;
    } catch (error) {
      log.error('Error checking discount approval requirement:', error);
      throw error;
    }
  }

  static async getApprovalStats(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT
           status,
           COUNT(*) as count,
           AVG(discount_percentage) as avg_discount,
           SUM(requested_discount) as total_discount_amount
         FROM discount_approvals
         WHERE business_id = $1
         GROUP BY status`,
        [businessId]
      );
      return result.rows;
    } catch (error) {
      log.error('Error fetching approval stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
