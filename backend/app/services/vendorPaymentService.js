// File: backend/app/services/vendorPaymentService.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * VENDOR PAYMENT SERVICE
 * Handles supplier payments and payment batches
 */
export class VendorPaymentService {
  
  /**
   * Create a new vendor payment
   */
  static async createPayment(paymentData, businessId, userId) {
    const client = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Validate purchase order exists and is not fully paid
      const poResult = await client.query(
        `SELECT po.*, s.name as supplier_name, s.tax_id as supplier_tin,
                COALESCE(SUM(vp.amount), 0) as total_paid
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         LEFT JOIN vendor_payments vp ON vp.purchase_order_id = po.id
         WHERE po.id = $1 AND po.business_id = $2
         GROUP BY po.id, s.name, s.tax_id`,
        [paymentData.purchase_order_id, businessId]
      );
      
      if (poResult.rows.length === 0) {
        throw new Error('Purchase order not found');
      }
      
      const purchaseOrder = poResult.rows[0];
      const remainingAmount = parseFloat(purchaseOrder.total_amount) - parseFloat(purchaseOrder.total_paid);
      
      if (paymentData.amount > remainingAmount) {
        throw new Error(`Payment amount ${paymentData.amount} exceeds remaining balance ${remainingAmount}`);
      }
      
      // Generate payment number
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      const seqResult = await client.query(
        `SELECT COUNT(*) + 1 as seq 
         FROM vendor_payments 
         WHERE business_id = $1 
         AND EXTRACT(YEAR FROM created_at) = $2
         AND EXTRACT(MONTH FROM created_at) = $3`,
        [businessId, year, month]
      );
      
      const sequence = seqResult.rows[0].seq;
      const paymentNumber = `PAY-${year}-${month}-${String(sequence).padStart(4, '0')}`;
      
      // Create payment
      const result = await client.query(
        `INSERT INTO vendor_payments 
         (id, business_id, purchase_order_id, supplier_id, payment_date, 
          amount, payment_method, reference_number, payment_number, notes,
          reconciliation_status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          uuidv4(),
          businessId,
          paymentData.purchase_order_id,
          paymentData.supplier_id,
          paymentData.payment_date || new Date().toISOString().split('T')[0],
          paymentData.amount,
          paymentData.payment_method,
          paymentData.reference_number || null,
          paymentNumber,
          paymentData.notes || null,
          'pending',
          userId
        ]
      );
      
      const payment = result.rows[0];
      
      // Update purchase order payment status
      const newTotalPaid = parseFloat(purchaseOrder.total_paid) + parseFloat(paymentData.amount);
      const newPaymentStatus = newTotalPaid >= parseFloat(purchaseOrder.total_amount) ? 'paid' : 'partial';
      
      await client.query(
        `UPDATE purchase_orders 
         SET paid_amount = $1,
             payment_status = $2,
             last_payment_date = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [
          newTotalPaid,
          newPaymentStatus,
          payment.payment_date,
          paymentData.purchase_order_id
        ]
      );
      
      await client.query('COMMIT');
      
      return payment;
      
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Error creating vendor payment:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get payment by ID
   */
  static async getPaymentById(paymentId, businessId) {
    try {
      const result = await getClient().then(client =>
        client.query(
          `SELECT vp.*, 
                  po.po_number, po.total_amount as po_total,
                  s.name as supplier_name, s.tax_id as supplier_tin
           FROM vendor_payments vp
           JOIN purchase_orders po ON po.id = vp.purchase_order_id
           JOIN suppliers s ON s.id = vp.supplier_id
           WHERE vp.id = $1 AND vp.business_id = $2`,
          [paymentId, businessId]
        ).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows[0] || null;
      
    } catch (error) {
      log.error('Error getting vendor payment:', error);
      throw error;
    }
  }
  
  /**
   * List payments for a business
   */
  static async listPayments(businessId, filters = {}) {
    try {
      let query = `
        SELECT vp.*, 
               po.po_number,
               s.name as supplier_name
        FROM vendor_payments vp
        JOIN purchase_orders po ON po.id = vp.purchase_order_id
        JOIN suppliers s ON s.id = vp.supplier_id
        WHERE vp.business_id = $1
      `;
      
      const params = [businessId];
      let paramIndex = 2;
      
      if (filters.supplier_id) {
        query += ` AND vp.supplier_id = $${paramIndex}`;
        params.push(filters.supplier_id);
        paramIndex++;
      }
      
      if (filters.purchase_order_id) {
        query += ` AND vp.purchase_order_id = $${paramIndex}`;
        params.push(filters.purchase_order_id);
        paramIndex++;
      }
      
      if (filters.payment_method) {
        query += ` AND vp.payment_method = $${paramIndex}`;
        params.push(filters.payment_method);
        paramIndex++;
      }
      
      if (filters.reconciliation_status) {
        query += ` AND vp.reconciliation_status = $${paramIndex}`;
        params.push(filters.reconciliation_status);
        paramIndex++;
      }
      
      if (filters.start_date) {
        query += ` AND vp.payment_date >= $${paramIndex}`;
        params.push(filters.start_date);
        paramIndex++;
      }
      
      if (filters.end_date) {
        query += ` AND vp.payment_date <= $${paramIndex}`;
        params.push(filters.end_date);
        paramIndex++;
      }
      
      query += ` ORDER BY vp.payment_date DESC, vp.created_at DESC`;
      
      if (filters.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
      }
      
      const result = await getClient().then(client =>
        client.query(query, params).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows;
      
    } catch (error) {
      log.error('Error listing vendor payments:', error);
      throw error;
    }
  }
  
  /**
   * Update payment reconciliation status
   */
  static async updateReconciliationStatus(paymentId, businessId, status, userId) {
    try {
      const result = await getClient().then(client =>
        client.query(
          `UPDATE vendor_payments 
           SET reconciliation_status = $1,
               reconciled_at = NOW(),
               reconciled_by = $2,
               updated_at = NOW()
           WHERE id = $3 AND business_id = $4
           RETURNING *`,
          [status, userId, paymentId, businessId]
        ).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows[0];
      
    } catch (error) {
      log.error('Error updating payment reconciliation:', error);
      throw error;
    }
  }
  
  /**
   * Get payment summary statistics
   */
  static async getPaymentSummary(businessId, period = 'month') {
    try {
      let dateFilter = '';
      
      if (period === 'month') {
        dateFilter = "AND payment_date >= date_trunc('month', CURRENT_DATE)";
      } else if (period === 'quarter') {
        dateFilter = "AND payment_date >= date_trunc('quarter', CURRENT_DATE)";
      } else if (period === 'year') {
        dateFilter = "AND payment_date >= date_trunc('year', CURRENT_DATE)";
      }
      
      const result = await getClient().then(client =>
        client.query(
          `SELECT 
            COUNT(*) as total_payments,
            COALESCE(SUM(amount), 0) as total_amount,
            COUNT(DISTINCT supplier_id) as unique_suppliers,
            COUNT(DISTINCT purchase_order_id) as unique_pos,
            COUNT(CASE WHEN payment_method = 'bank' THEN 1 END) as bank_payments,
            COUNT(CASE WHEN payment_method = 'cash' THEN 1 END) as cash_payments,
            COUNT(CASE WHEN payment_method = 'mobile_money' THEN 1 END) as mobile_payments,
            COUNT(CASE WHEN reconciliation_status = 'pending' THEN 1 END) as pending_reconciliation,
            COUNT(CASE WHEN reconciliation_status = 'reconciled' THEN 1 END) as reconciled_count
           FROM vendor_payments
           WHERE business_id = $1 ${dateFilter}`,
          [businessId]
        ).then(res => {
          client.release();
          return res;
        })
      );
      
      return result.rows[0];
      
    } catch (error) {
      log.error('Error getting payment summary:', error);
      throw error;
    }
  }
}

export default VendorPaymentService;
