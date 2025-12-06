import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { TransactionAccountingService } from './transactionAccountingService.js';
import { InventorySyncService } from './inventorySyncService.js';

export class POSService {
  /**
   * Create a new POS transaction with GAAP-compliant accounting
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

      // ========================================================================
      // STEP 1: VALIDATE AND PREPARE ITEMS WITH INVENTORY SYNC
      // ========================================================================
      const processedItems = [];

      for (const item of transactionData.items) {
        let inventoryItemId = item.inventory_item_id;
        let productId = item.product_id;

        // If product_id provided but no inventory_item_id, try to sync
        if (productId && !inventoryItemId && item.item_type === 'product') {
          try {
            const productCheck = await client.query(
              `SELECT inventory_item_id FROM products WHERE id = $1 AND business_id = $2`,
              [productId, businessId]
            );

            if (productCheck.rows.length > 0) {
              if (productCheck.rows[0].inventory_item_id) {
                inventoryItemId = productCheck.rows[0].inventory_item_id;
              } else {
                // Auto-sync product to inventory
                log.info(`Auto-syncing product ${productId} to inventory...`);
                const syncResult = await InventorySyncService.syncProductToInventory(productId, userId);
                inventoryItemId = syncResult.inventory_item.id;
                log.info(`Auto-synced product to inventory: ${inventoryItemId}`);
              }
            }
          } catch (syncError) {
            log.warn(`Failed to sync product ${productId} to inventory:`, syncError.message);
            // Continue without inventory tracking
          }
        }

        processedItems.push({
          ...item,
          product_id: productId || null,
          inventory_item_id: inventoryItemId || null
        });
      }

      // ========================================================================
      // STEP 2: CREATE POS TRANSACTION
      // ========================================================================
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

      // ========================================================================
      // STEP 3: INSERT TRANSACTION ITEMS
      // ========================================================================
      for (const item of processedItems) {
        await client.query(
          `INSERT INTO pos_transaction_items (
            business_id, pos_transaction_id, product_id, inventory_item_id, service_id,
            equipment_id, booking_id,
            item_type, item_name, quantity, unit_price, total_price, discount_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            businessId,
            transaction.id,
            item.product_id || null,
            item.inventory_item_id || null,
            item.service_id || null,
            item.equipment_id || null,
            item.booking_id || null,
            item.item_type,
            item.item_name,
            item.quantity,
            item.unit_price,
            item.total_price,
            item.discount_amount || 0
          ]
        );
      }

      // ========================================================================
      // STEP 4: PROCESS SALE THROUGH DATABASE FUNCTION
      // ========================================================================
      const processResult = await client.query(
        'SELECT * FROM process_pos_sale($1)',
        [transaction.id]
      );

      if (!processResult.rows[0].success) {
        throw new Error(`Failed to process sale: ${processResult.rows[0].message}`);
      }

      // ========================================================================
      // STEP 5: CREATE GAAP-COMPLIANT ACCOUNTING ENTRIES
      // ========================================================================
      let accountingResults = null;
      try {
        accountingResults = await TransactionAccountingService.createAccountingEntriesForTransaction(
          {
            business_id: businessId,
            pos_transaction_id: transaction.id,
            items: processedItems,
            payment_method: transactionData.payment_method,
            customer_id: transactionData.customer_id
          },
          userId
        );

        log.info('GAAP accounting entries created for POS sale:', {
          transaction_id: transaction.id,
          revenue_entry: accountingResults.sales_revenue_entry?.journal_entry?.id,
          cogs_entry: accountingResults.cogs_entry?.journal_entry?.id,
          total_revenue: accountingResults.analysis?.total_revenue,
          total_cogs: accountingResults.analysis?.total_cogs
        });

      } catch (accountingError) {
        // Don't fail the transaction if accounting fails, but log it
        log.error('Accounting entry creation failed (continuing transaction):', accountingError);

        await auditLogger.logAction({
          businessId,
          userId,
          action: 'accounting.entry.failed',
          resourceType: 'pos_transaction',
          resourceId: transaction.id,
          error_message: accountingError.message
        });
      }

      // ========================================================================
      // STEP 6: HANDLE EQUIPMENT HIRE IF PRESENT
      // ========================================================================
      const equipmentItems = processedItems.filter(item => item.item_type === 'equipment_hire');
      if (equipmentItems.length > 0) {
        for (const equipmentItem of equipmentItems) {
          log.info('Processing equipment hire transaction', {
            equipment_id: equipmentItem.equipment_id,
            booking_id: equipmentItem.booking_id,
            transaction_id: transaction.id
          });
        }
      }

      // ========================================================================
      // STEP 7: AUDIT LOG
      // ========================================================================
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pos.transaction.created',
        resourceType: 'pos_transaction',
        resourceId: transaction.id,
        newValues: {
          transaction_number: transaction.transaction_number,
          final_amount: transaction.final_amount,
          payment_method: transaction.payment_method,
          item_count: processedItems.length,
          inventory_items_count: processedItems.filter(item => item.inventory_item_id).length,
          accounting_created: accountingResults !== null,
          equipment_items_count: equipmentItems.length
        }
      });

      await client.query('COMMIT');

      // ========================================================================
      // STEP 8: RETURN COMPLETE TRANSACTION WITH ACCOUNTING INFO
      // ========================================================================
      const completeTransaction = await this.getTransactionById(businessId, transaction.id);

      // Add accounting info to response
      if (accountingResults) {
        completeTransaction.accounting_info = {
          revenue_entry_id: accountingResults.sales_revenue_entry?.journal_entry?.id,
          cogs_entry_id: accountingResults.cogs_entry?.journal_entry?.id,
          total_revenue: accountingResults.analysis?.total_revenue || 0,
          total_cogs: accountingResults.analysis?.total_cogs || 0,
          gross_profit: (accountingResults.analysis?.total_revenue || 0) - (accountingResults.analysis?.total_cogs || 0)
        };
      } else {
        completeTransaction.accounting_info = {
          accounting_created: false,
          error: 'Accounting entries could not be created'
        };
      }

      return completeTransaction;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('POS transaction creation failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all POS transactions with accounting info
   */
  static async getTransactions(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          pt.*,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name,
          c.phone as customer_phone,
          u.full_name as created_by_name,
          COUNT(pti.id) as item_count,
          -- Accounting info
          (SELECT COUNT(*) FROM journal_entries je
           WHERE je.reference_type = 'pos_transaction'
           AND je.reference_id = pt.id) as accounting_entries_count,
          -- COGS info
          (SELECT COALESCE(SUM(it.total_cost), 0) FROM inventory_transactions it
           WHERE it.reference_type = 'pos_transaction'
           AND it.reference_id = pt.id) as total_cogs
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

      queryStr += ' GROUP BY pt.id, c.first_name, c.last_name, c.phone, u.full_name ORDER BY pt.transaction_date DESC';

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

      // Calculate gross profit for each transaction
      const transactionsWithProfit = result.rows.map(transaction => {
        const totalCogs = parseFloat(transaction.total_cogs) || 0;
        const finalAmount = parseFloat(transaction.final_amount) || 0;
        return {
          ...transaction,
          gross_profit: finalAmount - totalCogs,
          gross_margin: finalAmount > 0 ? ((finalAmount - totalCogs) / finalAmount) * 100 : 0
        };
      });

      log.info('✅ POS transactions query successful', {
        rowCount: transactionsWithProfit.length,
        businessId
      });

      return transactionsWithProfit;
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
   * Get POS transaction by ID with complete accounting info
   */
  static async getTransactionById(businessId, transactionId) {
    const client = await getClient();

    try {
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

      // Get transaction items
      const itemsQuery = `
        SELECT
          pti.*,
          COALESCE(p.name, ii.name, s.name, fa.asset_name, pti.item_name) as item_display_name,
          fa.asset_name as equipment_name,
          fa.asset_code as equipment_code,
          ebb.booking_number as booking_number,
          ebb.status as booking_status,
          -- Inventory info
          ii.id as inventory_item_id,
          ii.cost_price as inventory_cost_price,
          ii.current_stock as inventory_current_stock,
          -- Product info
          p.inventory_item_id as product_inventory_link
        FROM pos_transaction_items pti
        LEFT JOIN products p ON pti.product_id = p.id
        LEFT JOIN inventory_items ii ON pti.inventory_item_id = ii.id OR p.inventory_item_id = ii.id
        LEFT JOIN services s ON pti.service_id = s.id
        LEFT JOIN equipment_assets ea ON pti.equipment_id = ea.id
        LEFT JOIN fixed_assets fa ON ea.asset_id = fa.id
        LEFT JOIN equipment_hire_bookings ebb ON pti.booking_id = ebb.id
        WHERE pti.business_id = $1 AND pti.pos_transaction_id = $2
        ORDER BY pti.created_at
      `;

      const itemsResult = await client.query(itemsQuery, [businessId, transactionId]);
      transaction.items = itemsResult.rows;

      // Get journal entries for this transaction
      const journalEntriesQuery = `
        SELECT
          je.*,
          json_agg(json_build_object(
            'id', jel.id,
            'account_code', ca.account_code,
            'account_name', ca.account_name,
            'description', jel.description,
            'amount', jel.amount,
            'line_type', jel.line_type
          ) ORDER BY
            CASE WHEN jel.line_type = 'debit' THEN 0 ELSE 1 END,
            ca.account_code
          ) as lines
        FROM journal_entries je
        LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        LEFT JOIN chart_of_accounts ca ON jel.account_id = ca.id
        WHERE je.business_id = $1
          AND je.reference_type = 'pos_transaction'
          AND je.reference_id = $2
        GROUP BY je.id
        ORDER BY je.created_at
      `;

      const journalEntriesResult = await client.query(journalEntriesQuery, [businessId, transactionId]);
      transaction.journal_entries = journalEntriesResult.rows;

      // Get inventory transactions
      const inventoryTransactionsQuery = `
        SELECT it.*, ii.name as item_name, ii.sku
        FROM inventory_transactions it
        LEFT JOIN inventory_items ii ON it.inventory_item_id = ii.id
        WHERE it.business_id = $1
          AND it.reference_type = 'pos_transaction'
          AND it.reference_id = $2
        ORDER BY it.created_at
      `;

      const inventoryTransactionsResult = await client.query(
        inventoryTransactionsQuery,
        [businessId, transactionId]
      );
      transaction.inventory_transactions = inventoryTransactionsResult.rows;

      // Calculate accounting summary
      transaction.accounting_summary = await TransactionAccountingService.getTransactionAccountingSummary(
        businessId,
        transactionId
      );

      log.info('✅ POS transaction query successful', {
        transactionId,
        businessId,
        itemCount: transaction.items.length,
        journalEntryCount: transaction.journal_entries.length,
        inventoryTransactionCount: transaction.inventory_transactions.length
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
   * Update POS transaction status with accounting reversals
   */
  static async updateTransaction(businessId, transactionId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify transaction belongs to business
      const currentTransaction = await client.query(
        'SELECT * FROM pos_transactions WHERE id = $1 AND business_id = $2',
        [transactionId, businessId]
      );

      if (currentTransaction.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const currentStatus = currentTransaction.rows[0].status;
      const newStatus = updateData.status;

      // Check if we're voiding/cancelling a completed transaction
      const isVoidingCompleted = (newStatus === 'void' || newStatus === 'cancelled')
        && currentStatus === 'completed';

      // If voiding a completed transaction, create reversal accounting entries
      if (isVoidingCompleted) {
        try {
          // Get the transaction with items
          const transaction = await this.getTransactionById(businessId, transactionId);

          // Create reversal entries for each journal entry
          for (const journalEntry of transaction.journal_entries || []) {
            const reversalLines = journalEntry.lines.map(line => ({
              account_code: line.account_code,
              account_name: line.account_name,
              description: `Reversal: ${line.description}`,
              amount: line.amount,
              normal_balance: line.normal_balance === 'debit' ? 'credit' : 'debit'
            }));

            // Import AccountingService for reversal
            const { AccountingService } = await import('./accountingService.js');

            await AccountingService.createJournalEntry({
              business_id: businessId,
              description: `Reversal of ${journalEntry.description}`,
              transaction_date: new Date(),
              reference_type: 'pos_transaction_reversal',
              reference_id: transactionId,
              lines: reversalLines
            }, userId);
          }

          log.info('Created reversal accounting entries for voided transaction:', transactionId);
        } catch (accountingError) {
          log.error('Failed to create reversal accounting entries:', accountingError);
          // Continue with voiding even if accounting fails
        }
      }

      // Update transaction
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
        newValues: updatedTransaction,
        reversal_created: isVoidingCompleted
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
   * Delete POS transaction (only if no accounting entries)
   */
  static async deleteTransaction(businessId, transactionId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify transaction belongs to business
      const currentTransaction = await client.query(
        'SELECT * FROM pos_transactions WHERE id = $1 AND business_id = $2',
        [transactionId, businessId]
      );

      if (currentTransaction.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const transaction = currentTransaction.rows[0];

      // Check if transaction has accounting entries
      const accountingCheck = await client.query(
        `SELECT COUNT(*) as count FROM journal_entries
         WHERE reference_type = 'pos_transaction' AND reference_id = $1`,
        [transactionId]
      );

      if (parseInt(accountingCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete transaction with accounting entries. Update status to "void" instead.');
      }

      // Delete transaction items
      await client.query(
        'DELETE FROM pos_transaction_items WHERE business_id = $1 AND pos_transaction_id = $2',
        [businessId, transactionId]
      );

      // Delete any inventory transactions - FIXED: Proper quote escaping
      await client.query(
        `DELETE FROM inventory_transactions WHERE business_id = $1 AND reference_id = $2 AND reference_type = 'pos_transaction'`,
        [businessId, transactionId]
      );

      // Delete the transaction
      await client.query(
        'DELETE FROM pos_transactions WHERE id = $1 AND business_id = $2',
        [transactionId, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pos.transaction.deleted',
        resourceType: 'pos_transaction',
        resourceId: transactionId,
        oldValues: {
          transaction_number: transaction.transaction_number,
          final_amount: transaction.final_amount,
          payment_method: transaction.payment_method
        }
      });

      await client.query('COMMIT');

      log.info('✅ POS transaction deleted successfully', {
        transactionId,
        businessId,
        userId
      });

      return { success: true, message: 'Transaction deleted successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('❌ POS transaction deletion failed:', {
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
   * Get POS sales analytics with COGS and gross profit
   */
  static async getSalesAnalytics(businessId, startDate = null, endDate = null) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          sa.*,
          -- Add COGS and gross profit
          (SELECT COALESCE(SUM(it.total_cost), 0)
           FROM inventory_transactions it
           WHERE it.business_id = $1
             AND it.transaction_type = 'sale'
             AND ($2::timestamp IS NULL OR it.created_at >= $2)
             AND ($3::timestamp IS NULL OR it.created_at <= $3)) as total_cogs,
          sa.total_sales -
          (SELECT COALESCE(SUM(it.total_cost), 0)
           FROM inventory_transactions it
           WHERE it.business_id = $1
             AND it.transaction_type = 'sale'
             AND ($2::timestamp IS NULL OR it.created_at >= $2)
             AND ($3::timestamp IS NULL OR it.created_at <= $3)) as gross_profit
        FROM get_sales_analytics($1, $2, $3) sa
      `;

      const params = [businessId, startDate, endDate];

      log.info('🗄️ Database Query - getSalesAnalytics:', { query: queryStr, params });

      const result = await client.query(queryStr, params);
      const analytics = result.rows[0] || {};

      // Add calculated fields
      if (analytics.total_sales > 0) {
        analytics.gross_margin = (analytics.gross_profit / analytics.total_sales) * 100;
        analytics.cogs_percentage = (analytics.total_cogs / analytics.total_sales) * 100;
      } else {
        analytics.gross_margin = 0;
        analytics.cogs_percentage = 0;
      }

      log.info('✅ POS sales analytics query successful', {
        businessId,
        total_sales: analytics.total_sales,
        total_cogs: analytics.total_cogs,
        gross_profit: analytics.gross_profit,
        gross_margin: analytics.gross_margin
      });

      return analytics;
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
   * Get today's sales summary with accounting metrics
   */
  static async getTodaySales(businessId) {
    const client = await getClient();

    try {
      const queryStr = `
        SELECT
          COUNT(*) as transaction_count,
          COALESCE(SUM(pt.final_amount), 0) as total_sales,
          COALESCE(AVG(pt.final_amount), 0) as average_transaction,
          COUNT(DISTINCT pt.customer_id) as customer_count,
          -- COGS for today
          COALESCE(SUM(it.total_cost), 0) as total_cogs,
          COALESCE(SUM(pt.final_amount), 0) - COALESCE(SUM(it.total_cost), 0) as gross_profit,
          -- Payment methods
          COUNT(*) FILTER (WHERE pt.payment_method = 'cash') as cash_count,
          COUNT(*) FILTER (WHERE pt.payment_method = 'card') as card_count,
          COUNT(*) FILTER (WHERE pt.payment_method = 'mobile_money') as mobile_money_count
        FROM pos_transactions pt
        LEFT JOIN inventory_transactions it ON pt.id = it.reference_id
          AND it.reference_type = 'pos_transaction'
          AND it.transaction_type = 'sale'
        WHERE pt.business_id = $1
          AND pt.status = 'completed'
          AND DATE(pt.transaction_date) = CURRENT_DATE
      `;

      log.info('🗄️ Database Query - getTodaySales:', { query: queryStr, params: [businessId] });

      const result = await client.query(queryStr, [businessId]);
      const todaySales = result.rows[0] || {};

      // Calculate percentages
      if (todaySales.total_sales > 0) {
        todaySales.gross_margin = (todaySales.gross_profit / todaySales.total_sales) * 100;
        todaySales.cogs_percentage = (todaySales.total_cogs / todaySales.total_sales) * 100;
      } else {
        todaySales.gross_margin = 0;
        todaySales.cogs_percentage = 0;
      }

      log.info('✅ Today sales query successful', {
        businessId,
        total_sales: todaySales.total_sales,
        total_cogs: todaySales.total_cogs,
        gross_profit: todaySales.gross_profit
      });

      return todaySales;
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

  /**
   * Get products for POS catalog with inventory sync status
   */
  static async getPosCatalog(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          p.*,
          ic.name as category_name,
          CASE
            WHEN p.current_stock <= p.min_stock_level AND p.min_stock_level > 0 THEN 'low'
            WHEN p.current_stock = 0 THEN 'out_of_stock'
            ELSE 'adequate'
          END as stock_status,
          -- Inventory sync status
          CASE
            WHEN p.inventory_item_id IS NOT NULL THEN 'synced'
            ELSE 'not_synced'
          END as inventory_sync_status,
          ii.name as inventory_item_name,
          ii.current_stock as inventory_stock,
          ii.cost_price as inventory_cost,
          -- Accounting info
          (SELECT COUNT(*) FROM inventory_transactions it
           WHERE it.inventory_item_id = ii.id
             AND it.transaction_type = 'sale'
             AND it.created_at >= CURRENT_DATE - INTERVAL '30 days') as recent_sales_count
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        LEFT JOIN inventory_items ii ON p.inventory_item_id = ii.id
        WHERE p.business_id = $1
          AND p.is_active = true
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.category_id) {
        paramCount++;
        queryStr += ` AND p.category_id = $${paramCount}`;
        params.push(filters.category_id);
      }

      if (filters.search) {
        paramCount++;
        queryStr += ` AND (
          p.name ILIKE $${paramCount} OR
          p.description ILIKE $${paramCount} OR
          p.sku ILIKE $${paramCount} OR
          p.barcode ILIKE $${paramCount}
        )`;
        params.push(`%${filters.search}%`);
      }

      if (filters.low_stock) {
        queryStr += ` AND p.current_stock <= p.min_stock_level AND p.min_stock_level > 0`;
      }

      if (filters.synced_only) {
        queryStr += ` AND p.inventory_item_id IS NOT NULL`;
      }

      queryStr += ' ORDER BY p.name';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      log.info('🗄️ Database Query - getPosCatalog:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ POS catalog query successful', {
        businessId,
        product_count: result.rows.length,
        synced_count: result.rows.filter(p => p.inventory_sync_status === 'synced').length
      });

      return result.rows;
    } catch (error) {
      log.error('❌ POS catalog query failed:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
