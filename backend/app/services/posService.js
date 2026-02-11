import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { TransactionAccountingService } from './transactionAccountingService.js';
import { InventorySyncService } from './inventorySyncService.js';
import { AccountingService } from './accountingService.js';
import { InventoryAccountingService } from './inventoryAccountingService.js';
import { TaxService } from './taxService.js';

// ============================================================================
// POSTaxCalculator - TAX CALCULATION FOR POS TRANSACTIONS
// Patterned after InvoiceTaxCalculator with POS-specific optimizations
// ============================================================================

class POSTaxCalculator {
  /**
   * Get customer type for tax calculation
   * @param {Object} client - Database client
   * @param {string} customerId - Customer ID (optional)
   * @param {string} businessId - Business ID
   * @returns {Promise<string>} 'company' or 'individual'
   */
  static async getCustomerType(client, customerId, businessId) {
    if (!customerId) {
      // Walk-in customer (no ID) = individual (B2C)
      log.debug('Walk-in customer, defaulting to individual for tax', {
        businessId,
        defaultType: 'individual'
      });
      return 'individual';
    }

    try {
      const customerQuery = await client.query(
        `SELECT customer_type FROM customers
         WHERE id = $1 AND business_id = $2`,
        [customerId, businessId]
      );

      if (customerQuery.rows.length === 0) {
        log.warn('Customer not found, using default type "individual"', {
          customerId,
          businessId
        });
        return 'individual'; // Default to B2C if customer not found
      }

      const customerType = customerQuery.rows[0].customer_type || 'individual';
      log.debug('Customer type retrieved for tax', {
        customerId,
        customerType,
        businessId
      });

      return customerType;
    } catch (error) {
      log.error('Failed to get customer type, defaulting to individual', {
        customerId,
        error: error.message
      });
      return 'individual'; // Default to B2C on error
    }
  }

  /**
   * Get product tax category
   * @param {Object} client - Database client
   * @param {string} productId - Product ID
   * @param {string} businessId - Business ID
   * @returns {Promise<string>} Tax category code
   */
  static async getProductTaxCategory(client, productId, businessId) {
    if (!productId) {
      return 'STANDARD_GOODS'; // Default for manual items
    }

    try {
      const productQuery = await client.query(
        `SELECT tax_category_code, name as product_name
         FROM products 
         WHERE id = $1 AND business_id = $2`,
        [productId, businessId]
      );

      if (productQuery.rows.length === 0) {
        log.warn('Product not found, using default tax category', {
          productId,
          businessId
        });
        return 'STANDARD_GOODS';
      }

      const taxCategory = productQuery.rows[0].tax_category_code || 'STANDARD_GOODS';
      log.debug('Product tax category retrieved', {
        productId,
        productName: productQuery.rows[0].product_name,
        taxCategory
      });

      return taxCategory;
    } catch (error) {
      log.error('Failed to get product tax category', {
        productId,
        error: error.message
      });
      return 'STANDARD_GOODS'; // Default on error
    }
  }

  /**
   * Calculate tax for a single POS line item
   * @param {Object} client - Database client
   * @param {string} businessId - Business ID
   * @param {Object} item - POS item data
   * @param {string} customerType - 'company' or 'individual'
   * @param {Date} transactionDate - Transaction date
   * @returns {Promise<Object>} Tax calculation result
   */
  static async calculateLineItemTax(client, businessId, item, customerType, transactionDate) {
    let taxRate = 0;
    let taxAmount = 0;
    let taxCategoryCode = 'STANDARD_GOODS';
    const itemTotal = item.quantity * item.unit_price;

    // Get tax category based on item type
    if (item.item_type === 'product' && item.product_id) {
      taxCategoryCode = await this.getProductTaxCategory(client, item.product_id, businessId);
    } else if (item.item_type === 'service' && item.service_id) {
      // Services typically have SERVICE tax category
      taxCategoryCode = 'SERVICES';
    } else if (item.tax_category_code) {
      // Manual override provided
      taxCategoryCode = item.tax_category_code;
    } else if (item.item_type === 'inventory' && item.inventory_item_id) {
      // For inventory items, try to get from products table first
      try {
        const productQuery = await client.query(
          `SELECT p.tax_category_code, p.name
           FROM products p
           WHERE p.inventory_item_id = $1 AND p.business_id = $2
           LIMIT 1`,
          [item.inventory_item_id, businessId]
        );

        if (productQuery.rows.length > 0) {
          taxCategoryCode = productQuery.rows[0].tax_category_code || 'STANDARD_GOODS';
          log.debug('Found product tax category for inventory item', {
            inventoryItemId: item.inventory_item_id,
            taxCategory: taxCategoryCode
          });
        } else {
          // No linked product, use default
          taxCategoryCode = 'STANDARD_GOODS';
        }
      } catch (error) {
        log.warn('Failed to get tax category for inventory item', {
          inventoryItemId: item.inventory_item_id,
          error: error.message
        });
        taxCategoryCode = 'STANDARD_GOODS';
      }
    }

    // Calculate tax using existing TaxService
    try {
      // Get business country for tax calculation
      const businessQuery = await client.query(
        `SELECT country_code FROM businesses WHERE id = $1`,
        [businessId]
      );

      const businessCountry = businessQuery.rows[0]?.country_code || 'UG';

      // Convert date to date-only string (YYYY-MM-DD)
      const dateForTax = transactionDate ? 
        new Date(transactionDate).toISOString().split('T')[0] : 
        new Date().toISOString().split('T')[0];

      // Use existing TaxService for calculation
      const taxResult = await TaxService.calculateItemTax({
        businessId,
        countryCode: businessCountry,
        productCategory: taxCategoryCode,
        amount: itemTotal,
        transactionType: 'sale',
        customerType: customerType,
        isExempt: false,
        transactionDate: dateForTax
      });

      taxRate = taxResult.taxRate;
      taxAmount = taxResult.taxAmount;

      log.debug('POS item tax calculated successfully', {
        itemName: item.item_name,
        itemType: item.item_type,
        taxCategory: taxCategoryCode,
        taxCode: taxResult.taxCode,
        taxRate,
        taxAmount,
        customerType
      });

    } catch (error) {
      log.error('Tax calculation failed for POS item', {
        itemName: item.item_name,
        error: error.message,
        stack: error.stack
      });
      
      // Don't fail transaction if tax calculation fails
      // Use zero tax as fallback
      taxRate = 0;
      taxAmount = 0;
    }

    return {
      taxRate,
      taxAmount,
      taxCategoryCode,
      itemTotal,
      lineTotal: itemTotal + taxAmount
    };
  }

  /**
   * Create transaction_taxes record for POS audit trail
   * @param {Object} client - Database client
   * @param {string} businessId - Business ID
   * @param {string} posTransactionId - POS transaction ID
   * @param {Object} lineItem - POS line item
   * @param {Object} taxCalculation - Tax calculation result
   * @param {Date} transactionDate - Transaction date
   * @param {string} customerType - Customer type
   * @param {string} customerId - Customer ID (optional)
   * @returns {Promise<string|null>} Transaction tax ID or null
   */
  static async createTaxTransaction(client, businessId, posTransactionId, lineItem, taxCalculation, transactionDate, customerType, customerId = null) {
    if (!taxCalculation.taxAmount || taxCalculation.taxAmount <= 0) {
      return null; // Skip zero-tax items
    }

    try {
      // Get business country
      const businessQuery = await client.query(
        `SELECT country_code FROM businesses WHERE id = $1`,
        [businessId]
      );

      const businessCountry = businessQuery.rows[0]?.country_code || 'UG';

      // Get tax type info
      const taxInfo = await TaxService.getTaxRate(
        taxCalculation.taxCategoryCode,
        businessCountry,
        transactionDate ? new Date(transactionDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      );

      // Get tax_type_id
      const taxTypeQuery = await client.query(
        'SELECT id FROM tax_types WHERE tax_code = $1',
        [taxInfo.taxCode]
      );

      // Get tax_rate_id
      const taxRateQuery = await client.query(
        `SELECT id FROM country_tax_rates 
         WHERE country_code = $1 AND tax_type_id = $2 
         AND is_default = true
         AND effective_from <= $3 
         AND (effective_to IS NULL OR effective_to >= $3)`,
        [
          businessCountry, 
          taxTypeQuery.rows[0]?.id,
          transactionDate || new Date()
        ]
      );

      // Create tax audit record
      const taxTransactionQuery = `
        INSERT INTO transaction_taxes (
          business_id, transaction_id, transaction_type, transaction_date,
          tax_type_id, tax_rate_id, taxable_amount, tax_rate, tax_amount,
          country_code, product_category_code, tax_period, calculation_context,
          customer_type, customer_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
        RETURNING id
      `;

      const result = await client.query(taxTransactionQuery, [
        businessId,
        posTransactionId,
        'pos_sale',
        transactionDate || new Date(),
        taxTypeQuery.rows[0]?.id,
        taxRateQuery.rows[0]?.id,
        taxCalculation.itemTotal,
        taxCalculation.taxRate,
        taxCalculation.taxAmount,
        businessCountry,
        taxCalculation.taxCategoryCode,
        new Date().toISOString().substring(0, 7) + '-01', // tax_period
        JSON.stringify({
          pos_transaction_id: posTransactionId,
          line_item_description: lineItem.item_name,
          item_type: lineItem.item_type,
          product_id: lineItem.product_id,
          inventory_item_id: lineItem.inventory_item_id,
          calculated_by: 'POSTaxCalculator',
          tax_engine_version: '1.0',
          business_country: businessCountry
        }),
        customerType,
        customerId
      ]);

      log.debug('POS tax transaction recorded', {
        transactionId: result.rows[0]?.id,
        posTransactionId,
        taxAmount: taxCalculation.taxAmount,
        taxCategory: taxCalculation.taxCategoryCode,
        customerType
      });

      return result.rows[0]?.id;
    } catch (error) {
      log.error('Failed to create POS tax transaction record', {
        posTransactionId,
        error: error.message,
        note: 'Transaction will continue without tax audit trail'
      });
      return null;
    }
  }
}

export class POSService {
  /**
   * Create a new POS transaction with TAX CALCULATION
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

      // ✅ STEP 1: GET CUSTOMER TYPE FOR TAX CALCULATION
      const customerType = await POSTaxCalculator.getCustomerType(
        client,
        transactionData.customer_id,
        businessId
      );

      log.info('POS transaction customer type determined', {
        businessId,
        customerId: transactionData.customer_id,
        customerType,
        taxImplication: customerType === 'company' ? '6% WHT' : '20% VAT'
      });

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
      // STEP 2: VALIDATE AND PREPARE ITEMS WITH TAX CALCULATION
      // ========================================================================
      const processedItems = [];
      let totalSubtotal = 0;
      let totalTax = 0;
      let totalDiscount = 0;

      for (const item of transactionData.items) {
        let inventoryItemId = item.inventory_item_id;
        let productId = item.product_id;
        let itemCost = 0;

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
        // Handle direct inventory items
        else if (item.item_type === 'inventory') {
          if (!item.inventory_item_id) {
            throw new Error(`Inventory item ID required for inventory type items: ${item.item_name}`);
          }

          // Validate inventory item exists and has stock
          const inventoryCheck = await client.query(
            `SELECT name, cost_price, selling_price, current_stock, category_id
             FROM inventory_items
             WHERE id = $1 AND business_id = $2 AND is_active = true`,
            [item.inventory_item_id, businessId]
          );

          if (inventoryCheck.rows.length === 0) {
            throw new Error(`Inventory item not found or inactive: ${item.inventory_item_id}`);
          }

          const inventoryItem = inventoryCheck.rows[0];

          // Check stock availability
          if (inventoryItem.current_stock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${inventoryItem.name}. ` +
              `Required: ${item.quantity}, Available: ${inventoryItem.current_stock}`
            );
          }

          // Use inventory item's selling price if not specified
          if (!item.unit_price || item.unit_price === 0) {
            item.unit_price = inventoryItem.selling_price;
          }

          itemCost = inventoryItem.cost_price * item.quantity;
        }

        // ✅ STEP 3: CALCULATE TAX FOR THIS ITEM
        const taxCalculation = await POSTaxCalculator.calculateLineItemTax(
          client,
          businessId,
          item,
          customerType,
          transactionData.transaction_date || new Date()
        );

        const itemTotal = item.quantity * item.unit_price;
        const itemDiscount = item.discount_amount || 0;
        const itemTotalAfterDiscount = itemTotal - itemDiscount;
        const itemTax = taxCalculation.taxAmount || 0;
        const itemFinal = itemTotalAfterDiscount + itemTax;

        totalSubtotal += itemTotal;
        totalTax += itemTax;
        totalDiscount += itemDiscount;

        processedItems.push({
          ...item,
          product_id: productId || null,
          inventory_item_id: inventoryItemId || null,
          // Add tax fields for database insertion
          tax_rate: taxCalculation.taxRate,
          tax_amount: itemTax,
          tax_category_code: taxCalculation.taxCategoryCode,
          total_price: itemFinal  // This will be stored in total_price column
        });

        log.debug('POS item processed with tax', {
          itemName: item.item_name,
          itemType: item.item_type,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          itemTotal,
          discount: itemDiscount,
          taxRate: taxCalculation.taxRate,
          taxAmount: itemTax,
          taxCategory: taxCalculation.taxCategoryCode,
          finalAmount: itemFinal,
          customerType
        });
      }

      // Calculate final amounts
      const finalAmount = totalSubtotal - totalDiscount + totalTax;
      
      // Calculate average tax rate for the transaction
      const averageTaxRate = totalSubtotal > 0 ? (totalTax / totalSubtotal) * 100 : 0;

      log.info('POS transaction totals calculated', {
        businessId,
        subtotal: totalSubtotal,
        discount: totalDiscount,
        tax: totalTax,
        averageTaxRate: averageTaxRate.toFixed(2),
        finalAmount,
        itemCount: processedItems.length,
        customerType
      });

      // ========================================================================
      // STEP 4: CREATE POS TRANSACTION WITH TAX DATA
      // ========================================================================
      const transactionResult = await client.query(
        `INSERT INTO pos_transactions (
          business_id, transaction_number, customer_id, transaction_date,
          total_amount, tax_amount, discount_amount, final_amount,
          payment_method, payment_status, status, notes, created_by,
          accounting_processed, accounting_error, tax_rate
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          businessId,
          transactionNumberValue,
          transactionData.customer_id || null,
          transactionData.transaction_date || new Date(),
          totalSubtotal,  // total_amount (subtotal)
          totalTax,       // tax_amount
          totalDiscount,  // discount_amount
          finalAmount,    // final_amount
          transactionData.payment_method,
          transactionData.payment_status || 'completed',
          transactionData.status || 'completed',
          transactionData.notes || '',
          userId,
          false,  // accounting_processed = false initially
          null,   // accounting_error = null initially
          averageTaxRate  // tax_rate (average)
        ]
      );

      const transaction = transactionResult.rows[0];

      // ========================================================================
      // STEP 5: INSERT TRANSACTION ITEMS WITH TAX DATA
      // ========================================================================
      for (const item of processedItems) {
        const itemResult = await client.query(
          `INSERT INTO pos_transaction_items (
            business_id, pos_transaction_id, product_id, inventory_item_id, service_id,
            equipment_id, booking_id,
            item_type, item_name, quantity, unit_price, total_price, discount_amount,
            tax_rate, tax_amount, tax_category_code
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING id`,
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
            item.total_price,  // This already includes tax
            item.discount_amount || 0,
            item.tax_rate,
            item.tax_amount,
            item.tax_category_code
          ]
        );

        const insertedItemId = itemResult.rows[0].id;

        // ✅ STEP 6: CREATE TAX AUDIT TRAIL FOR EACH ITEM
        await POSTaxCalculator.createTaxTransaction(
          client,
          businessId,
          transaction.id,
          item,
          {
            taxRate: item.tax_rate,
            taxAmount: item.tax_amount,
            taxCategoryCode: item.tax_category_code,
            itemTotal: item.quantity * item.unit_price
          },
          transactionData.transaction_date || new Date(),
          customerType,
          transactionData.customer_id || null
        );

        log.debug('POS item inserted with tax data', {
          itemId: insertedItemId,
          transactionId: transaction.id,
          itemName: item.item_name,
          taxAmount: item.tax_amount,
          taxCategory: item.tax_category_code
        });
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
      // STEP 8: PROCESS ACCOUNTING FOR DIRECT INVENTORY SALES
      // ========================================================================
      const inventorySaleItems = processedItems.filter(item => item.item_type === 'inventory');
      if (inventorySaleItems.length > 0) {
        try {
          await InventoryAccountingService.recordPosSaleWithCogs({
            business_id: businessId,
            pos_transaction_id: transaction.id,
            items: inventorySaleItems.map(item => ({
              inventory_item_id: item.inventory_item_id,
              product_id: null,
              quantity: item.quantity,
              unit_price: item.unit_price
            }))
          }, userId);

          log.info('Direct inventory sales accounting completed', {
            transactionId: transaction.id,
            itemCount: inventorySaleItems.length
          });
        } catch (cogsError) {
          log.error('Failed to record COGS for direct inventory sales:', cogsError);
        }
      }

      // ========================================================================
      // STEP 9: AUDIT LOG FOR TRANSACTION CREATION
      // ========================================================================
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'pos.transaction.created',
        resourceType: 'pos_transaction',
        resourceId: transaction.id,
        newValues: {
          transaction_number: transaction.transaction_number,
          subtotal: totalSubtotal,
          tax_amount: totalTax,
          tax_rate: averageTaxRate,
          final_amount: transaction.final_amount,
          payment_method: transaction.payment_method,
          item_count: processedItems.length,
          customer_type: customerType,  // ✅ Now includes customer type
          tax_items_count: processedItems.filter(item => item.tax_amount > 0).length
        }
      });

      // ========================================================================
      // STEP 10: COMMIT THE TRANSACTION
      // ========================================================================
      await client.query('COMMIT');

      log.info('✅ POS transaction with tax created successfully', {
        transactionId: transaction.id,
        businessId,
        subtotal: totalSubtotal,
        tax: totalTax,
        finalAmount: finalAmount,
        customerType,
        itemCount: processedItems.length
      });

      // ========================================================================
      // STEP 11: PROCESS ACCOUNTING (WITH SEPARATE CONNECTION - NOW SAFE)
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
      // STEP 12: RETURN RESPONSE WITH TAX BREAKDOWN AND UPDATED FIELDS
      // ========================================================================
      const response = {
        ...transaction,
        items: processedItems,
        tax_breakdown: {
          subtotal: totalSubtotal,
          tax_amount: totalTax,
          tax_rate: averageTaxRate,
          discount_amount: totalDiscount,
          final_amount: finalAmount,
          customer_type: customerType
        },
        accounting_info: {
          method: 'manual_service',
          status: accountingResult?.success === true ? 'created' : 'failed',
          entries_created: accountingResult?.linesCreated || 0,
          note: accountingResult?.success === true
            ? 'Accounting entries created successfully'
            : accountingResult?.message || 'Accounting creation failed',
          tax_calculated: true,
          customer_type_used: customerType,
          items_with_tax: processedItems.filter(item => item.tax_amount > 0).length,
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
   * Get POS transaction by ID with TAX DETAILS - FIXED VERSION
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
          c.customer_type,
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

      // Get transaction items WITH TAX DATA
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
          p.inventory_item_id as product_inventory_link,
          p.tax_category_code as product_tax_category
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

      // Calculate tax summary
      const taxSummary = {
        items_with_tax: transaction.items.filter(item => item.tax_amount > 0).length,
        total_tax: transaction.tax_amount || 0,
        average_tax_rate: transaction.tax_rate || 0
      };
      
      transaction.tax_summary = taxSummary;

      // Get tax audit trail from transaction_taxes
      const taxAuditQuery = 
        `SELECT tt.*, ttypes.tax_code, ttypes.tax_name
         FROM transaction_taxes tt
         LEFT JOIN tax_types ttypes ON tt.tax_type_id = ttypes.id
         WHERE tt.business_id = $1 
           AND tt.transaction_id = $2
           AND tt.transaction_type = 'pos_sale'
         ORDER BY tt.created_at`;

      const taxAuditResult = await client.query(taxAuditQuery, [businessId, transactionId]);
      transaction.tax_audit_trail = taxAuditResult.rows;

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
          AND je.reference_id = $2::text  // FIXED: transactionId parameter needs ::text cast
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
          AND it.reference_id = $2  // FIXED: NO ::text cast - reference_id is UUID
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
        taxItemsCount: taxSummary.items_with_tax,
        totalTax: taxSummary.total_tax,
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
        LEFT JOIN inventory_transactions it ON pt.id = it.reference_id  // FIXED: NO ::text cast
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
