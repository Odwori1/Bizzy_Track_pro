import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { TransactionAccountingService } from './transactionAccountingService.js';
import { InventorySyncService } from './inventorySyncService.js';
import { AccountingService } from './accountingService.js';

export class POSService {
  /**
   * Create a new POS transaction with database trigger accounting
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
      // STEP 2: CREATE POS TRANSACTION (WITH accounting_processed = FALSE)
      // ========================================================================
      const transactionResult = await client.query(
        `INSERT INTO pos_transactions (
          business_id, transaction_number, customer_id, transaction_date,
          total_amount, tax_amount, discount_amount, final_amount,
          payment_method, payment_status, status, notes, created_by,
          accounting_processed, accounting_error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
          userId,
          false,  // accounting_processed = false initially
          null    // accounting_error = null initially
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
      // STEP 4: HANDLE EQUIPMENT HIRE IF PRESENT
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
      // STEP 5: AUDIT LOG FOR TRANSACTION CREATION
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
          equipment_items_count: equipmentItems.length,
          accounting_processed: false // Initial state
        }
      });

      // ========================================================================
      // STEP 6: COMMIT THE TRANSACTION BEFORE ACCOUNTING
      // ========================================================================
      await client.query('COMMIT');

      log.info('✅ POS transaction committed, starting accounting process', {
        transactionId: transaction.id,
        businessId
      });

      // ========================================================================
      // STEP 7: PROCESS ACCOUNTING (WITH SEPARATE CONNECTION - NOW SAFE)
      // ========================================================================
      let accountingResult;
      try {
        accountingResult = await AccountingService.processPosAccounting(
          transaction.id,
          userId
        );

        if (accountingResult?.success === true) {
          log.info('✅ Accounting created successfully', {
            transactionId: transaction.id,
            linesCreated: accountingResult.linesCreated
          });
          
          // ========================================================================
          // CRITICAL FIX: UPDATE accounting_processed FLAG
          // ========================================================================
          const updateClient = await getClient();
          try {
            await updateClient.query(
              `UPDATE pos_transactions 
               SET accounting_processed = true, 
                   accounting_error = NULL,
                   updated_at = NOW()
               WHERE id = $1 AND business_id = $2`,
              [transaction.id, businessId]
            );
            
            log.info('✅ Updated accounting_processed flag to true', {
              transactionId: transaction.id
            });
          } finally {
            updateClient.release();
          }
        } else {
          log.warn('⚠️ Accounting not created', {
            transactionId: transaction.id,
            reason: accountingResult?.message || 'Unknown reason'
          });
          
          // Update with error if accounting failed
          const updateClient = await getClient();
          try {
            await updateClient.query(
              `UPDATE pos_transactions 
               SET accounting_error = $1,
                   updated_at = NOW()
               WHERE id = $2 AND business_id = $3`,
              [accountingResult?.message || 'Accounting processing failed', 
               transaction.id, businessId]
            );
            
            log.warn('⚠️ Updated accounting_error with failure message', {
              transactionId: transaction.id,
              error: accountingResult?.message
            });
          } finally {
            updateClient.release();
          }
        }
      } catch (accountingError) {
        log.error('❌ Accounting processing error:', {
          transactionId: transaction.id,
          error: accountingError.message
        });
        
        // Update with error even if the service call itself failed
        const updateClient = await getClient();
        try {
          await updateClient.query(
            `UPDATE pos_transactions 
             SET accounting_error = $1,
                 updated_at = NOW()
             WHERE id = $2 AND business_id = $3`,
            [`Accounting service error: ${accountingError.message}`, 
             transaction.id, businessId]
          );
        } finally {
          updateClient.release();
        }
        
        // Don't fail the transaction if accounting fails
        accountingResult = {
          success: false,
          message: `Accounting processing error: ${accountingError.message}`,
          linesCreated: 0
        };
      }

      // ========================================================================
      // STEP 8: RETURN RESPONSE WITH UPDATED FIELDS
      // ========================================================================
      const response = {
        ...transaction,
        items: processedItems,
        accounting_info: {
          method: 'manual_service',
          status: accountingResult?.success === true ? 'created' : 'failed',
          entries_created: accountingResult?.linesCreated || 0,
          note: accountingResult?.success === true
            ? 'Accounting entries created successfully'
            : accountingResult?.message || 'Accounting creation failed',
          verify_with: `SELECT * FROM journal_entries WHERE reference_id = '${transaction.id}'::text`
        }
      };

      // Fetch the latest transaction state with accounting flags
      const finalClient = await getClient();
      try {
        const finalState = await finalClient.query(
          'SELECT accounting_processed, accounting_error FROM pos_transactions WHERE id = $1',
          [transaction.id]
        );
        if (finalState.rows.length > 0) {
          response.accounting_processed = finalState.rows[0].accounting_processed;
          response.accounting_error = finalState.rows[0].accounting_error;
        }
      } finally {
        finalClient.release();
      }

      log.info('✅ POS transaction completed successfully', {
        transactionId: transaction.id,
        businessId,
        accounting_processed: response.accounting_processed,
        accounting_success: accountingResult?.success === true,
        lines_created: accountingResult?.linesCreated || 0
      });

      return response;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('❌ POS transaction creation failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all POS transactions with accounting info - FIXED VERSION
   */
  static async getTransactions(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr =
        `SELECT
          pt.*,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name,
          c.phone as customer_phone,
          u.full_name as created_by_name,
          COUNT(pti.id) as item_count,
          -- Accounting info: journal_entries.reference_id is VARCHAR, so cast UUID to text
          (SELECT COUNT(*) FROM journal_entries je
           WHERE je.reference_type = 'pos_transaction'
           AND je.reference_id = pt.id::text) as accounting_entries_count,
          -- COGS info: inventory_transactions.reference_id is UUID, so NO cast needed
          (SELECT COALESCE(SUM(it.total_cost), 0) FROM inventory_transactions it
           WHERE it.reference_type = 'pos_transaction'
           AND it.reference_id = pt.id) as total_cogs
        FROM pos_transactions pt
        LEFT JOIN customers c ON pt.customer_id = c.id
        LEFT JOIN users u ON pt.created_by = u.id
        LEFT JOIN pos_transaction_items pti ON pt.id = pti.pos_transaction_id
        WHERE pt.business_id = $1`;
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

      log.info('🗄️ Database Query - getTransactions (FIXED):', {
        query: queryStr,
        params,
        fixes: 'Corrected UUID/TEXT casting for journal_entries vs inventory_transactions'
      });

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

      log.info('✅ POS transactions query successful (FIXED)', {
        rowCount: transactionsWithProfit.length,
        businessId,
        accountingEntriesFound: transactionsWithProfit[0]?.accounting_entries_count || 0,
        totalCogsCalculated: transactionsWithProfit.reduce((sum, t) => sum + (parseFloat(t.total_cogs) || 0), 0)
      });

      return transactionsWithProfit;
    } catch (error) {
      log.error('❌ POS transactions query failed:', {
        error: error.message,
        businessId,
        filters,
        note: 'Check UUID/TEXT casting in subqueries'
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get POS transaction by ID with complete accounting info - FIXED VERSION
   */
  static async getTransactionById(businessId, transactionId) {
    const client = await getClient();

    try {
      const transactionQuery =
        `SELECT
          pt.*,
          CONCAT(c.first_name, ' ', c.last_name) as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          u.full_name as created_by_name
        FROM pos_transactions pt
        LEFT JOIN customers c ON pt.customer_id = c.id
        LEFT JOIN users u ON pt.created_by = u.id
        WHERE pt.business_id = $1 AND pt.id = $2`;

      const transactionResult = await client.query(transactionQuery, [businessId, transactionId]);

      if (transactionResult.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const transaction = transactionResult.rows[0];

      // Get transaction items
      const itemsQuery =
        `SELECT
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
        ORDER BY pti.created_at`;

      const itemsResult = await client.query(itemsQuery, [businessId, transactionId]);
      transaction.items = itemsResult.rows;

      // Get journal entries for this transaction - FIXED: pt.id needs ::text cast for VARCHAR reference_id
      const journalEntriesQuery =
        `SELECT
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
          AND je.reference_id = $2::text  -- FIXED: transactionId parameter needs ::text cast
        GROUP BY je.id
        ORDER BY je.created_at`;

      const journalEntriesResult = await client.query(journalEntriesQuery, [businessId, transactionId]);
      transaction.journal_entries = journalEntriesResult.rows;

      // Get inventory transactions - FIXED: NO ::text cast needed for UUID reference_id
      const inventoryTransactionsQuery =
        `SELECT it.*, ii.name as item_name, ii.sku
        FROM inventory_transactions it
        LEFT JOIN inventory_items ii ON it.inventory_item_id = ii.id
        WHERE it.business_id = $1
          AND it.reference_type = 'pos_transaction'
          AND it.reference_id = $2  -- FIXED: NO ::text cast - reference_id is UUID
        ORDER BY it.created_at`;

      const inventoryTransactionsResult = await client.query(
        inventoryTransactionsQuery,
        [businessId, transactionId]  // transactionId is UUID, matches reference_id UUID type
      );
      transaction.inventory_transactions = inventoryTransactionsResult.rows;

      // Calculate accounting summary
      try {
        transaction.accounting_summary = await TransactionAccountingService.getTransactionAccountingSummary(
          businessId,
          transactionId
        );
      } catch (summaryError) {
        log.warn('Could not get accounting summary:', summaryError.message);
        transaction.accounting_summary = {
          error: 'Could not retrieve accounting summary',
          details: summaryError.message
        };
      }

      log.info('✅ POS transaction query successful (FIXED)', {
        transactionId,
        businessId,
        itemCount: transaction.items.length,
        journalEntryCount: transaction.journal_entries.length,
        inventoryTransactionCount: transaction.inventory_transactions.length,
        castingFix: 'Applied correct UUID/TEXT casts per schema'
      });

      return transaction;
    } catch (error) {
      log.error('❌ POS transaction query failed:', {
        error: error.message,
        businessId,
        transactionId,
        note: 'Check journal_entries vs inventory_transactions reference_id types'
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update POS transaction status with database trigger handling reversals
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

      // If voiding a completed transaction, database trigger will handle reversal
      if (isVoidingCompleted) {
        try {
          // Get the transaction with items
          const transaction = await this.getTransactionById(businessId, transactionId);

          // Database trigger will handle reversal when status changes
          log.info('Database will handle reversal accounting when status changes', {
            transaction_id: transactionId,
            old_status: currentStatus,
            new_status: newStatus,
            trigger: 'trigger_auto_pos_accounting'
          });

        } catch (accountingError) {
          log.error('Failed to process reversal:', accountingError);
          // Continue with voiding even if accounting notification fails
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

      const updateQuery =
        `UPDATE pos_transactions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *`;

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
        reversal_created: isVoidingCompleted,
        accounting_method: 'database_trigger'
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
   * Delete POS transaction (only if no accounting entries) - FIXED VERSION
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

      // Check if transaction has accounting entries - FIXED: journal_entries.reference_id is VARCHAR
      const accountingCheck = await client.query(
        `SELECT COUNT(*) as count FROM journal_entries
         WHERE reference_type = 'pos_transaction' AND reference_id = $1::text`,
        [transactionId]  // Needs ::text cast for VARCHAR comparison
      );

      if (parseInt(accountingCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete transaction with accounting entries. Update status to "void" instead.');
      }

      // Delete transaction items
      await client.query(
        'DELETE FROM pos_transaction_items WHERE business_id = $1 AND pos_transaction_id = $2',
        [businessId, transactionId]
      );

      // Delete any inventory transactions - FIXED: NO ::text cast needed
      await client.query(
        `DELETE FROM inventory_transactions WHERE business_id = $1 AND reference_id = $2 AND reference_type = 'pos_transaction'`,
        [businessId, transactionId]  // NO ::text cast - reference_id is UUID
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

      log.info('✅ POS transaction deleted successfully (FIXED)', {
        transactionId,
        businessId,
        userId,
        castingFix: 'Applied correct UUID/TEXT casts for journal_entries check'
      });

      return { success: true, message: 'Transaction deleted successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('❌ POS transaction deletion failed:', {
        error: error.message,
        businessId,
        transactionId,
        note: 'Check journal_entries reference_id VARCHAR vs UUID casting'
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get POS sales analytics with COGS and gross profit - FIXED VERSION
   */
  static async getSalesAnalytics(businessId, startDate = null, endDate = null) {
    const client = await getClient();

    try {
      const queryStr =
        `SELECT
          sa.*,
          -- Add COGS and gross profit - FIXED: inventory_transactions.reference_id is UUID
          (SELECT COALESCE(SUM(it.total_cost), 0)
           FROM inventory_transactions it
           WHERE it.business_id = $1
             AND it.transaction_type = 'sale'
             AND it.reference_type = 'pos_transaction'
             AND ($2::timestamp IS NULL OR it.created_at >= $2)
             AND ($3::timestamp IS NULL OR it.created_at <= $3)) as total_cogs,
          sa.total_sales -
          (SELECT COALESCE(SUM(it.total_cost), 0)
           FROM inventory_transactions it
           WHERE it.business_id = $1
             AND it.transaction_type = 'sale'
             AND it.reference_type = 'pos_transaction'
             AND ($2::timestamp IS NULL OR it.created_at >= $2)
             AND ($3::timestamp IS NULL OR it.created_at <= $3)) as gross_profit
        FROM get_sales_analytics($1, $2, $3) sa`;

      const params = [businessId, startDate, endDate];

      log.info('🗄️ Database Query - getSalesAnalytics (FIXED):', {
        query: queryStr,
        params,
        fixes: 'Added reference_type filter for inventory_transactions'
      });

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

      log.info('✅ POS sales analytics query successful (FIXED)', {
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
   * Get today's sales summary with accounting metrics - FIXED VERSION
   */
  static async getTodaySales(businessId) {
    const client = await getClient();

    try {
      const queryStr =
        `SELECT
          COUNT(*) as transaction_count,
          COALESCE(SUM(pt.final_amount), 0) as total_sales,
          COALESCE(AVG(pt.final_amount), 0) as average_transaction,
          COUNT(DISTINCT pt.customer_id) as customer_count,
          -- COGS for today - FIXED: inventory_transactions.reference_id is UUID
          COALESCE(SUM(it.total_cost), 0) as total_cogs,
          COALESCE(SUM(pt.final_amount), 0) - COALESCE(SUM(it.total_cost), 0) as gross_profit,
          -- Payment methods
          COUNT(*) FILTER (WHERE pt.payment_method = 'cash') as cash_count,
          COUNT(*) FILTER (WHERE pt.payment_method = 'card') as card_count,
          COUNT(*) FILTER (WHERE pt.payment_method = 'mobile_money') as mobile_money_count
        FROM pos_transactions pt
        LEFT JOIN inventory_transactions it ON pt.id = it.reference_id  -- FIXED: NO ::text cast
          AND it.reference_type = 'pos_transaction'
          AND it.transaction_type = 'sale'
        WHERE pt.business_id = $1
          AND pt.status = 'completed'
          AND DATE(pt.transaction_date) = CURRENT_DATE`;

      log.info('🗄️ Database Query - getTodaySales (FIXED):', {
        query: queryStr,
        params: [businessId],
        fixes: 'Removed ::text cast from inventory_transactions JOIN'
      });

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

      log.info('✅ Today sales query successful (FIXED)', {
        businessId,
        total_sales: todaySales.total_sales,
        total_cogs: todaySales.total_cogs,
        gross_profit: todaySales.gross_profit,
        castingFix: 'Correct UUID comparison for inventory_transactions'
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
      let queryStr =
        `SELECT
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
          AND p.is_active = true`;

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
