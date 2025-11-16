import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class POSService {
  /**
   * Create a new POS transaction
   */
  static async createTransaction(businessId, transactionData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Generate unique transaction number
      const transactionNumber = await client.query(
        'SELECT generate_pos_transaction_number($1) as transaction_number',
        [businessId]
      );

      const transactionNumberValue = transactionNumber.rows[0].transaction_number;

      // Verify customer belongs to business if provided
      if (transactionData.customer_id) {
        const customerCheck = await client.query(
          'SELECT id FROM customers WHERE id = $1 AND business_id = $2',
          [transactionData.customer_id, businessId]
        );

        if (customerCheck.rows.length === 0) {
          throw new Error('Customer not found or access denied');
        }
      }

      // Insert POS transaction
      const transactionResult = await client.query(
        `INSERT INTO pos_transactions (
          business_id, transaction_number, customer_id, transaction_date,
          total_amount, tax_amount, discount_amount, final_amount,
          payment_method, payment_status, status, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          businessId,
          transactionNumberValue,
          transactionData.customer_id || null,
          transactionData.transaction_date || new Date(),
          transactionData.total_amount,
          transactionData.tax_amount || 0,
          transactionData.discount_amount || 0,
          transactionData.final_amount,
          transactionData.payment_method,
          transactionData.payment_status || 'completed',
          transactionData.status || 'completed',
          transactionData.notes || '',
          userId
        ]
      );

      const transaction = transactionResult.rows[0];

      // Insert transaction items
      for (const item of transactionData.items) {
        await client.query(
          `INSERT INTO pos_transaction_items (
            business_id, pos_transaction_id, product_id, inventory_item_id, service_id,
            item_type, item_name, quantity, unit_price, total_price, discount_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            businessId,
            transaction.id,
            item.product_id || null,
            item.inventory_item_id || null,
            item.service_id || null,
            item.item_type,
            item.item_name,
            item.quantity,
            item.unit_price,
            item.total_price,
            item.discount_amount || 0
          ]
        );
      }

      // Process the sale (update stock and loyalty points)
      const processResult = await client.query(
        'SELECT * FROM process_pos_sale($1)',
        [transaction.id]
      );

      if (!processResult.rows[0].success) {
        throw new Error(`Failed to process sale: ${processResult.rows[0].message}`);
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pos.transaction.created',
        resourceType: 'pos_transaction',
        resourceId: transaction.id,
        newValues: {
          transaction_number: transaction.transaction_number,
          final_amount: transaction.final_amount,
          payment_method: transaction.payment_method
        }
      });

      await client.query('COMMIT');

      // Get the complete transaction with items
      const completeTransaction = await this.getTransactionById(businessId, transaction.id);

      return completeTransaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all POS transactions with optional filters
   */
  static async getTransactions(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT 
          pt.*,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name, -- FIXED: Use CONCAT
          c.phone as customer_phone,
          u.full_name as created_by_name,
          COUNT(pti.id) as item_count
        FROM pos_transactions pt
        LEFT JOIN customers c ON pt.customer_id = c.id
        LEFT JOIN users u ON pt.created_by = u.id
        LEFT JOIN pos_transaction_items pti ON pt.id = pti.pos_transaction_id
        WHERE pt.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.customer_id) {
        paramCount++;
        queryStr += ` AND pt.customer_id = $${paramCount}`;
        params.push(filters.customer_id);
      }

      if (filters.payment_method) {
        paramCount++;
        queryStr += ` AND pt.payment_method = $${paramCount}`;
        params.push(filters.payment_method);
      }

      if (filters.payment_status) {
        paramCount++;
        queryStr += ` AND pt.payment_status = $${paramCount}`;
        params.push(filters.payment_status);
      }

      if (filters.status) {
        paramCount++;
        queryStr += ` AND pt.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.start_date && filters.end_date) {
        paramCount++;
        queryStr += ` AND pt.transaction_date BETWEEN $${paramCount}`;
        params.push(filters.start_date);

        paramCount++;
        queryStr += ` AND $${paramCount}`;
        params.push(filters.end_date);
      } else if (filters.start_date) {
        paramCount++;
        queryStr += ` AND pt.transaction_date >= $${paramCount}`;
        params.push(filters.start_date);
      } else if (filters.end_date) {
        paramCount++;
        queryStr += ` AND pt.transaction_date <= $${paramCount}`;
        params.push(filters.end_date);
      }

      queryStr += ' GROUP BY pt.id, c.first_name, c.last_name, c.phone, u.full_name ORDER BY pt.transaction_date DESC'; // FIXED: Group by first_name, last_name

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      log.info('🗄️ Database Query - getTransactions:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ POS transactions query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ POS transactions query failed:', {
        error: error.message,
        businessId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get POS transaction by ID with items
   */
  static async getTransactionById(businessId, transactionId) {
    const client = await getClient();

    try {
      // Get transaction details - FIXED: Use CONCAT for customer_name
      const transactionQuery = `
        SELECT 
          pt.*,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          u.full_name as created_by_name
        FROM pos_transactions pt
        LEFT JOIN customers c ON pt.customer_id = c.id
        LEFT JOIN users u ON pt.created_by = u.id
        WHERE pt.business_id = $1 AND pt.id = $2
      `;

      const transactionResult = await client.query(transactionQuery, [businessId, transactionId]);

      if (transactionResult.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const transaction = transactionResult.rows[0];

      // Get transaction items - FIXED: Use COALESCE for item_display_name
      const itemsQuery = `
        SELECT 
          pti.*,
          COALESCE(p.name, ii.name, s.name, pti.item_name) as item_display_name
        FROM pos_transaction_items pti
        LEFT JOIN products p ON pti.product_id = p.id
        LEFT JOIN inventory_items ii ON pti.inventory_item_id = ii.id
        LEFT JOIN services s ON pti.service_id = s.id
        WHERE pti.business_id = $1 AND pti.pos_transaction_id = $2
        ORDER BY pti.created_at
      `;

      const itemsResult = await client.query(itemsQuery, [businessId, transactionId]);
      transaction.items = itemsResult.rows;

      log.info('✅ POS transaction query successful', {
        transactionId,
        businessId,
        itemCount: transaction.items.length
      });

      return transaction;
    } catch (error) {
      log.error('❌ POS transaction query failed:', {
        error: error.message,
        businessId,
        transactionId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update POS transaction status
   */
  static async updateTransaction(businessId, transactionId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify transaction belongs to business and get current values
      const currentTransaction = await client.query(
        'SELECT * FROM pos_transactions WHERE id = $1 AND business_id = $2',
        [transactionId, businessId]
      );

      if (currentTransaction.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      // Build dynamic update query
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          paramCount++;
          updateFields.push(`${key} = $${paramCount}`);
          updateValues.push(updateData[key]);
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }

      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date());

      paramCount++;
      updateValues.push(transactionId);
      paramCount++;
      updateValues.push(businessId);

      const updateQuery = `
        UPDATE pos_transactions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *
      `;

      log.info('🗄️ Database Query - updateTransaction:', { query: updateQuery, params: updateValues });

      const result = await client.query(updateQuery, updateValues);
      const updatedTransaction = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pos.transaction.updated',
        resourceType: 'pos_transaction',
        resourceId: transactionId,
        oldValues: currentTransaction.rows[0],
        newValues: updatedTransaction
      });

      await client.query('COMMIT');
      return updatedTransaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get POS sales analytics
   */
  static async getSalesAnalytics(businessId, startDate = null, endDate = null) {
    const client = await getClient();

    try {
      let queryStr = 'SELECT * FROM get_sales_analytics($1, $2, $3)';
      const params = [businessId, startDate, endDate];

      log.info('🗄️ Database Query - getSalesAnalytics:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ POS sales analytics query successful', {
        businessId
      });

      return result.rows[0];
    } catch (error) {
      log.error('❌ POS sales analytics query failed:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get today's sales summary
   */
  static async getTodaySales(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          COUNT(*) as transaction_count,
          COALESCE(SUM(final_amount), 0) as total_sales,
          COALESCE(AVG(final_amount), 0) as average_transaction,
          COUNT(DISTINCT customer_id) as customer_count
        FROM pos_transactions
        WHERE business_id = $1
          AND status = 'completed'
          AND DATE(transaction_date) = CURRENT_DATE
      `;

      log.info('🗄️ Database Query - getTodaySales:', { query: queryStr, params: [businessId] });

      const result = await client.query(queryStr, [businessId]);

      log.info('✅ Today sales query successful', {
        businessId
      });

      return result.rows[0];
    } catch (error) {
      log.error('❌ Today sales query failed:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
