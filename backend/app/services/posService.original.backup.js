import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { AccountingService } from './accountingService.js';
import { InventoryAccountingService } from './inventoryAccountingService.js';
import { InventorySyncService } from './inventorySyncService.js';

export class POSService {
  /**
   * Create a new POS transaction with accounting integration
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
      // STEP 1: VALIDATE AND PREPARE INVENTORY ITEMS
      // ========================================================================
      const inventoryItems = [];
      const processedItems = [];

      for (const item of transactionData.items) {
        let inventoryItemId = item.inventory_item_id;
        
        // If product has inventory_item_id, use it
        if (!inventoryItemId && item.product_id) {
          const productResult = await client.query(
            `SELECT inventory_item_id FROM products WHERE id = $1 AND business_id = $2`,
            [item.product_id, businessId]
          );
          
          if (productResult.rows.length > 0 && productResult.rows[0].inventory_item_id) {
            inventoryItemId = productResult.rows[0].inventory_item_id;
          }
        }

        // If no inventory_item_id but this is a physical product, try to find/create
        if (!inventoryItemId && item.item_type === 'product') {
          log.warn(`Product ${item.product_id} has no linked inventory item. Attempting to sync...`);
          
          if (item.product_id) {
            try {
              const syncResult = await InventorySyncService.syncProductToInventory(item.product_id, userId);
              inventoryItemId = syncResult.inventory_item.id;
              log.info(`Synced product to inventory: ${inventoryItemId}`);
            } catch (syncError) {
              log.error(`Failed to sync product to inventory:`, syncError);
              // Continue without inventory tracking for this item
            }
          }
        }

        if (inventoryItemId) {
          inventoryItems.push({
            ...item,
            inventory_item_id: inventoryItemId
          });
        }

        processedItems.push({
          ...item,
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
      // STEP 5: CREATE ACCOUNTING ENTRIES
      // ========================================================================
      let accountingResult = null;
      try {
        // Create sales revenue journal entry
        accountingResult = await AccountingService.createJournalEntryForPosSale(
          {
            business_id: businessId,
            pos_transaction_id: transaction.id,
            total_amount: transaction.final_amount,
            items: inventoryItems
          },
          userId
        );

        log.info('Created accounting entries for POS sale:', {
          transaction_id: transaction.id,
          journal_entry_id: accountingResult.sales_entry?.journal_entry?.id,
          total_cogs: accountingResult.total_cogs
        });

      } catch (accountingError) {
        // Don't fail the transaction if accounting fails, but log it
        log.error('Accounting entry creation failed (continuing transaction):', accountingError);
        
        // Log accounting failure in audit logs
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
      // STEP 6: RECORD COGS FOR INVENTORY ITEMS
      // ========================================================================
      if (inventoryItems.length > 0) {
        try {
          const cogsResult = await InventoryAccountingService.recordPosSaleWithCogs(
            {
              business_id: businessId,
              pos_transaction_id: transaction.id,
              items: inventoryItems
            },
            userId
          );

          log.info('Recorded COGS for inventory items:', {
            transaction_id: transaction.id,
            total_cogs: cogsResult.summary.total_cogs,
            items_processed: cogsResult.summary.items_processed
          });

        } catch (cogsError) {
          log.error('COGS recording failed (continuing transaction):', cogsError);
        }
      }

      // ========================================================================
      // STEP 7: HANDLE EQUIPMENT HIRE IF PRESENT
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
      // STEP 8: AUDIT LOG
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
          inventory_items_count: inventoryItems.length,
          accounting_created: accountingResult !== null,
          equipment_items_count: equipmentItems.length
        }
      });

      await client.query('COMMIT');

      // ========================================================================
      // STEP 9: RETURN COMPLETE TRANSACTION
      // ========================================================================
      const completeTransaction = await this.getTransactionById(businessId, transaction.id);
      
      // Add accounting info to response
      completeTransaction.accounting_info = {
        journal_entry_created: accountingResult !== null,
        sales_entry_id: accountingResult?.sales_entry?.journal_entry?.id,
        cogs_entry_id: accountingResult?.cogs_entry?.journal_entry?.id,
        total_cogs: accountingResult?.total_cogs || 0
      };

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
   * Get all POS transactions with optional filters
   * (Remains largely unchanged but adds accounting info)
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
           AND je.reference_id = pt.id) as accounting_entries_count
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
   * (Updated to include accounting and inventory info)
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
          u.full_name as created_by_name,
          -- Accounting info
          (SELECT json_agg(je.*) FROM journal_entries je 
           WHERE je.reference_type = 'pos_transaction' 
           AND je.reference_id = pt.id) as journal_entries,
          -- COGS info
          (SELECT SUM(it.total_cost) FROM inventory_transactions it
           WHERE it.reference_type = 'pos_transaction' 
           AND it.reference_id = pt.id
           AND it.transaction_type = 'sale') as total_cogs
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

      // Get transaction items with enhanced info
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

      // Get inventory transactions for this POS sale
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

      log.info('✅ POS transaction query successful', {
        transactionId,
        businessId,
        itemCount: transaction.items.length,
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
   * Update POS transaction status
   * (Updated to handle accounting reversals if needed)
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

      // Check if we're voiding/cancelling the transaction
      const isVoiding = (updateData.status === 'void' || updateData.status === 'cancelled') 
        && currentTransaction.rows[0].status === 'completed';

      // If voiding, create reversal accounting entries
      if (isVoiding) {
        try {
          await this.createVoidAccountingEntries(businessId, transactionId, userId);
          log.info('Created void accounting entries for transaction:', transactionId);
        } catch (accountingError) {
          log.error('Failed to create void accounting entries:', accountingError);
          // Continue with voiding even if accounting fails
        }
      }

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
   * Create void/reversal accounting entries for a transaction
   */
  static async createVoidAccountingEntries(businessId, transactionId, userId) {
    const client = await getClient();

    try {
      // Get the original transaction
      const transaction = await this.getTransactionById(businessId, transactionId);
      
      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Create reversal journal entry
      const reversalEntry = await AccountingService.createJournalEntry({
        business_id: businessId,
        description: `Void/Reversal of POS Transaction #${transaction.transaction_number}`,
        transaction_date: new Date(),
        reference_type: 'pos_transaction_void',
        reference_id: transactionId,
        lines: [
          {
            account_code: '4100', // Sales Revenue (debit to reverse)
            description: 'Reversal of sales revenue from voided transaction',
            amount: transaction.final_amount,
            normal_balance: 'debit'
          },
          {
            account_code: '1110', // Cash (credit to reverse)
            description: 'Reversal of cash receipt from voided transaction',
            amount: transaction.final_amount,
            normal_balance: 'credit'
          }
        ]
      }, userId);

      // If there were COGS entries, reverse them too
      if (transaction.total_cogs > 0) {
        await AccountingService.createJournalEntry({
          business_id: businessId,
          description: `COGS Reversal for Voided POS Transaction #${transaction.transaction_number}`,
          transaction_date: new Date(),
          reference_type: 'pos_transaction_void',
          reference_id: transactionId,
          lines: [
            {
              account_code: '1300', // Inventory (debit to reverse)
              description: 'Reversal of inventory reduction from voided transaction',
              amount: transaction.total_cogs,
              normal_balance: 'debit'
            },
            {
              account_code: '5100', // COGS (credit to reverse)
              description: 'Reversal of COGS from voided transaction',
              amount: transaction.total_cogs,
              normal_balance: 'credit'
            }
          ]
        }, userId);
      }

      return reversalEntry;
    } catch (error) {
      log.error('Error creating void accounting entries:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete POS transaction
   * (Updated to handle accounting cleanup)
   */
  static async deleteTransaction(businessId, transactionId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify transaction belongs to business and get current values for audit
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
        throw new Error('Cannot delete transaction with accounting entries. Void it instead.');
      }

      // Delete transaction items first (due to foreign key constraint)
      await client.query(
        'DELETE FROM pos_transaction_items WHERE business_id = $1 AND pos_transaction_id = $2',
        [businessId, transactionId]
      );

      // Delete any inventory transactions
      await client.query(
        'DELETE FROM inventory_transactions WHERE business_id = $1 AND reference_id = $2 AND reference_type = $3',
        [businessId, transactionId, 'pos_transaction']
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
   * Get POS sales analytics
   * (Updated to include COGS and gross profit)
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

      log.info('✅ POS sales analytics query successful', {
        businessId,
        total_cogs: result.rows[0]?.total_cogs,
        gross_profit: result.rows[0]?.gross_profit
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
   * Get today's sales summary with COGS
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
          COALESCE(SUM(pt.final_amount), 0) - COALESCE(SUM(it.total_cost), 0) as gross_profit
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

      log.info('✅ Today sales query successful', {
        businessId,
        total_sales: result.rows[0]?.total_sales,
        total_cogs: result.rows[0]?.total_cogs,
        gross_profit: result.rows[0]?.gross_profit
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

  /**
   * Get products for POS catalog with inventory sync status
   */
  static async getPosCatalog(businessId, filters = {}) {
    const client = await getClient();

    try {
      const queryStr = `
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
          ii.current_stock as inventory_stock
        FROM products p
        LEFT JOIN inventory_categories ic ON p.category_id = ic.id
        LEFT JOIN inventory_items ii ON p.inventory_item_id = ii.id
        WHERE p.business_id = $1
          AND p.is_active = true
          AND ($2::varchar IS NULL OR p.category_id = $2)
        ORDER BY p.name
      `;

      const params = [businessId, filters.category_id];
      
      if (filters.search) {
        // Modify query to include search
        // This is simplified - in practice you'd build dynamic query
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
