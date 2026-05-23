import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { TransactionAccountingService } from './transactionAccountingService.js';
import { InventorySyncService } from './inventorySyncService.js';
import { AccountingService } from './accountingService.js';
import { InventoryAccountingService } from './inventoryAccountingService.js';
import { TaxService } from './taxService.js';
import { DiscountRuleEngine } from './discountRuleEngine.js';
import { UUIDService } from './uuidService.js';

// ============================================================================
// FLAG: Use database trigger for accounting instead of application logic
// ============================================================================
const USE_DATABASE_TRIGGER_ONLY = true;

// ============================================================================
// POSTaxCalculator - TAX CALCULATION FOR POS TRANSACTIONS
// ============================================================================

class POSTaxCalculator {
  /**
   * Get customer type for tax calculation
   */
  static async getCustomerType(client, customerId, businessId) {
    if (!customerId) {
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
        return 'individual';
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
      return 'individual';
    }
  }

  /**
   * Get product tax category
   */
  static async getProductTaxCategory(client, productId, businessId) {
    if (!productId) {
      return 'STANDARD_GOODS';
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
      return 'STANDARD_GOODS';
    }
  }

  /**
   * Calculate tax for a single POS line item
   * FIXED: Now returns taxId, taxCode, and taxName from the calculation result
   * PATCH 5: Added _override_amount support for net (post-discount) amounts
   */
  static async calculateLineItemTax(client, businessId, item, customerType, transactionDate) {
    let taxRate = 0;
    let taxAmount = 0;
    let taxCategoryCode = 'STANDARD_GOODS';
    
    // When posService.js has pre-computed the net (post-discount) amount,
    // it passes it via _override_amount so the tax base is always correct.
    // Fallback to quantity * unit_price for non-discounted transactions.
    const itemTotal = item._override_amount !== undefined
      ? item._override_amount
      : item.quantity * item.unit_price;

    if (item.item_type === 'product' && item.product_id) {
      taxCategoryCode = await this.getProductTaxCategory(client, item.product_id, businessId);
    } else if (item.item_type === 'service' && item.service_id) {
      taxCategoryCode = 'SERVICES';
    } else if (item.tax_category_code) {
      taxCategoryCode = item.tax_category_code;
    } else if (item.item_type === 'inventory' && item.inventory_item_id) {
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

    try {
      const businessQuery = await client.query(
        `SELECT country_code FROM businesses WHERE id = $1`,
        [businessId]
      );

      const businessCountry = businessQuery.rows[0]?.country_code || 'UG';

      const dateForTax = transactionDate
        ? new Date(transactionDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

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
        taxId: taxResult.taxId,
        taxRate,
        taxAmount,
        customerType,
        itemTotal
      });

      return {
        taxRate,
        taxAmount,
        taxCategoryCode,
        itemTotal,
        lineTotal: itemTotal + taxAmount,
        taxId: taxResult.taxId,
        taxCode: taxResult.taxCode,
        taxName: taxResult.taxName
      };

    } catch (error) {
      log.error('Tax calculation failed for POS item', {
        itemName: item.item_name,
        error: error.message,
        stack: error.stack
      });
      taxRate = 0;
      taxAmount = 0;
    }

    return {
      taxRate,
      taxAmount,
      taxCategoryCode,
      itemTotal,
      lineTotal: itemTotal + taxAmount,
      taxId: null,
      taxCode: null,
      taxName: null
    };
  }

  /**
   * Create transaction_taxes record for POS audit trail
   * FIXED: Uses the tax calculation result directly instead of looking up again
   */
  static async createTaxTransaction(
    client,
    businessId,
    posTransactionId,
    lineItem,
    taxCalculation,
    transactionDate,
    customerType,
    customerId = null
  ) {
    if (!taxCalculation.taxAmount || taxCalculation.taxAmount <= 0) {
      return null;
    }

    try {
      const businessQuery = await client.query(
        `SELECT country_code FROM businesses WHERE id = $1`,
        [businessId]
      );

      const businessCountry = businessQuery.rows[0]?.country_code || 'UG';

      let taxTypeId = taxCalculation.taxId;

      if (!taxTypeId && taxCalculation.taxCode) {
        const taxTypeQuery = await client.query(
          `SELECT id FROM tax_types WHERE tax_code = $1`,
          [taxCalculation.taxCode]
        );
        taxTypeId = taxTypeQuery.rows[0]?.id;
      }

      const taxRateQuery = await client.query(
        `SELECT ctr.id
         FROM country_tax_rates ctr
         WHERE ctr.country_code = $1
           AND ctr.tax_type_id = $2
           AND ctr.effective_from <= $3
           AND (ctr.effective_to IS NULL OR ctr.effective_to >= $3)
         ORDER BY ctr.is_default DESC, ctr.effective_from DESC
         LIMIT 1`,
        [
          businessCountry,
          taxTypeId,
          transactionDate || new Date()
        ]
      );

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
        taxTypeId,
        taxRateQuery.rows[0]?.id,
        taxCalculation.itemTotal || (lineItem.quantity * lineItem.unit_price),
        taxCalculation.taxRate,
        taxCalculation.taxAmount,
        businessCountry,
        taxCalculation.taxCategoryCode,
        new Date().toISOString().substring(0, 7) + '-01',
        JSON.stringify({
          pos_transaction_id: posTransactionId,
          line_item_description: lineItem.item_name,
          item_type: lineItem.item_type,
          product_id: lineItem.product_id,
          inventory_item_id: lineItem.inventory_item_id,
          calculated_by: 'POSTaxCalculator',
          tax_engine_version: '2.0',
          business_country: businessCountry,
          tax_code_used: taxCalculation.taxCode,
          tax_name_used: taxCalculation.taxName
        }),
        customerType,
        customerId
      ]);

      log.debug('POS tax transaction recorded (FIXED)', {
        transactionId: result.rows[0]?.id,
        posTransactionId,
        taxAmount: taxCalculation.taxAmount,
        taxCode: taxCalculation.taxCode,
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

// ============================================================================
// HELPER: Create discount allocation after transaction items exist
// PATCH 4: Removed DiscountAccountingService call (handled by trigger now)
// ============================================================================

async function createAllocationAfterTransaction(params, client) {
  const { businessId, transactionId, transactionType, discountResult, items, userId } = params;

  try {
    log.info('Creating discount allocation after transaction', {
      transactionId,
      transactionType,
      itemCount: items.length,
      discountAmount: discountResult.totalDiscount
    });

    const volumeDiscount = discountResult.appliedDiscounts.find(
      d => d.type === 'VOLUME' || d.type === 'PRICING_RULE'
    );
    const earlyDiscount = discountResult.appliedDiscounts.find(d => d.type === 'EARLY_PAYMENT');
    const categoryDiscount = discountResult.appliedDiscounts.find(d => d.type === 'CATEGORY');
    const promoDiscount = discountResult.appliedDiscounts.find(d => d.type === 'PROMOTIONAL');

    const ruleDiscount = volumeDiscount || earlyDiscount || categoryDiscount;

    const lineItems = items.map(item => ({
      line_item_id: item.id,
      line_type: transactionType,
      line_amount: item.total_price - (item.tax_amount || 0),
      discount_amount: discountResult.totalDiscount / items.length
    }));

    const totalAllocated = lineItems.reduce((sum, item) => sum + item.discount_amount, 0);
    if (Math.abs(totalAllocated - discountResult.totalDiscount) > 0.01) {
      const diff = discountResult.totalDiscount - totalAllocated;
      lineItems[lineItems.length - 1].discount_amount += diff;
    }

    const allocationData = {
      [transactionType === 'POS' ? 'pos_transaction_id' : 'invoice_id']: transactionId,
      total_discount_amount: discountResult.totalDiscount,
      allocation_method: 'PRO_RATA_AMOUNT',
      status: 'APPLIED',
      applied_at: new Date(),
      lines: lineItems
    };

    if (ruleDiscount) {
      allocationData.discount_rule_id = ruleDiscount.id;
    }

    if (promoDiscount) {
      allocationData.promotional_discount_id = promoDiscount.id;
    }

    log.debug('Creating allocation with IDs', {
      discount_rule_id: allocationData.discount_rule_id,
      promotional_discount_id: allocationData.promotional_discount_id,
      pos_transaction_id: allocationData.pos_transaction_id
    });

    const { DiscountAllocationService } = await import('./discountAllocationService.js');

    const allocation = await DiscountAllocationService.createAllocationWithClient(
      allocationData,
      userId,
      businessId,
      client
    );

    // PATCH 4: Discount journal entry is created by the database trigger as part of
    // the main POS journal entry. Do NOT call DiscountAccountingService here
    // for POS transactions — it would create a duplicate entry.
    // The allocation record above is for management reporting only.
    const accounting = null; // handled by trigger

    return { allocation, accounting };
  } catch (error) {
    log.error('Error creating allocation after transaction', {
      error: error.message,
      transactionId,
      transactionType,
      stack: error.stack
    });
    throw error;
  }
}

// ============================================================================
// POSService
// ============================================================================

export class POSService {
  /**
   * Create a new POS transaction with tax calculation and discount approval flow.
   *
   * TWO-PHASE COMMIT PATTERN FOR ACCOUNTING INTEGRITY:
   *   1. Insert transaction with status='pending' (does NOT trigger accounting)
   *   2. Insert all transaction items
   *   3. Update status to 'completed' (triggers database trigger to create complete entries)
   *
   * FIXED: Tax now calculated on NET amount (post-discount) rather than gross.
   */
  static async createTransaction(businessId, transactionData, userId) {
    const requestStart = Date.now();
    console.log(`\n🔵 [${new Date().toISOString()}] ========== START POS TRANSACTION ==========`);

    const client = await getClient();
    console.log(`🔵 [${new Date().toISOString()}] Got database client - ${Date.now() - requestStart}ms`);

    let committed = false;

    try {
      await client.query('BEGIN');
      console.log(`🔵 [${new Date().toISOString()}] BEGIN transaction - ${Date.now() - requestStart}ms`);

      // ------------------------------------------------------------------
      // STEP 1: Generate transaction number & resolve customer type
      // ------------------------------------------------------------------
      const transactionNumber = await client.query(
        'SELECT generate_pos_transaction_number($1) as transaction_number',
        [businessId]
      );
      console.log(`🔵 [${new Date().toISOString()}] Got transaction number: ${transactionNumber.rows[0].transaction_number} - ${Date.now() - requestStart}ms`);

      const transactionNumberValue = transactionNumber.rows[0].transaction_number;

      const customerType = await POSTaxCalculator.getCustomerType(
        client,
        transactionData.customer_id,
        businessId
      );
      console.log(`🔵 [${new Date().toISOString()}] Customer type: ${customerType} - ${Date.now() - requestStart}ms`);

      log.info('POS transaction customer type determined', {
        businessId,
        customerId: transactionData.customer_id,
        customerType,
        taxImplication: customerType === 'company' ? '6% WHT' : '20% VAT'
      });

      if (transactionData.customer_id) {
        const customerCheck = await client.query(
          'SELECT id FROM customers WHERE id = $1 AND business_id = $2',
          [transactionData.customer_id, businessId]
        );

        if (customerCheck.rows.length === 0) {
          throw new Error('Customer not found or access denied');
        }
      }

      // ------------------------------------------------------------------
      // PASS 1: Validate items and collect GROSS subtotals (NO TAX YET)
      // Tax must not be calculated until we know the discount, because tax
      // is on the NET amount (post-discount). Running tax first was Bug A.
      // ------------------------------------------------------------------
      const grossItems = [];
      let totalSubtotal = 0;

      for (const item of transactionData.items) {
        const itemStart = Date.now();
        console.log(`🔵 [${new Date().toISOString()}] Processing item: ${item.item_name}`);

        let inventoryItemId = item.inventory_item_id;
        let productId = item.product_id;

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
                log.info(`Auto-syncing product ${productId} to inventory...`);
                const syncResult = await InventorySyncService.syncProductToInventory(
                  productId,
                  userId
                );
                inventoryItemId = syncResult.inventory_item.id;
                log.info(`Auto-synced product to inventory: ${inventoryItemId}`);
              }
            }
          } catch (syncError) {
            log.warn(`Failed to sync product ${productId} to inventory:`, syncError.message);
          }
        } else if (item.item_type === 'inventory') {
          if (!item.inventory_item_id) {
            throw new Error(
              `Inventory item ID required for inventory type items: ${item.item_name}`
            );
          }

          const inventoryCheck = await client.query(
            `SELECT name, cost_price, selling_price, current_stock, category_id
             FROM inventory_items
             WHERE id = $1 AND business_id = $2 AND is_active = true`,
            [item.inventory_item_id, businessId]
          );

          if (inventoryCheck.rows.length === 0) {
            throw new Error(
              `Inventory item not found or inactive: ${item.inventory_item_id}`
            );
          }

          const inventoryItem = inventoryCheck.rows[0];

          if (inventoryItem.current_stock < item.quantity) {
            throw new Error(
              `Insufficient stock for ${inventoryItem.name}. ` +
              `Required: ${item.quantity}, Available: ${inventoryItem.current_stock}`
            );
          }

          if (!item.unit_price || item.unit_price === 0) {
            item.unit_price = inventoryItem.selling_price;
          }
        }

        const grossItemTotal = item.quantity * item.unit_price;
        totalSubtotal += grossItemTotal;

        grossItems.push({
          ...item,
          product_id: productId || null,
          inventory_item_id: inventoryItemId || null,
          grossItemTotal,
        });

        console.log(`🟢 [${new Date().toISOString()}] Item validated in ${Date.now() - itemStart}ms`);
      }

      // ------------------------------------------------------------------
      // STEP 2: Calculate discount on the FULL gross subtotal
      // Discount must be known before we calculate any tax.
      // ------------------------------------------------------------------
      let discountResult = null;
      let requiresApproval = false;
      let approvalId = null;
      let totalDiscount = parseFloat(transactionData.discount_amount) || 0;

      const transactionDateForTax = transactionData.transaction_date
        ? new Date(transactionData.transaction_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      const discountStart = Date.now();

      if (transactionData.promo_code || transactionData.apply_discounts !== false) {
        try {
          const discountItems = [];
          for (const item of grossItems) {
            const itemId = item.service_id || item.product_id;
            if (!itemId) {
              const generatedId = await UUIDService.getUUID({
                context: 'pos_discount_item',
                useCache: true
              });
              discountItems.push({
                id: generatedId,
                amount: item.unit_price,
                quantity: item.quantity,
                type: item.item_type || (item.service_id ? 'service' : 'product')
              });
            } else {
              discountItems.push({
                id: itemId,
                amount: item.unit_price,
                quantity: item.quantity,
                type: item.item_type || (item.service_id ? 'service' : 'product')
              });
            }
          }

          log.info('Calculating discounts for POS transaction', {
            promoCode: transactionData.promo_code,
            itemCount: discountItems.length,
            subtotal: totalSubtotal
          });

          const discountCheck = await DiscountRuleEngine.calculateFinalPrice({
            businessId,
            customerId: transactionData.customer_id,
            items: discountItems,
            amount: totalSubtotal,
            userId,
            transactionDate: transactionDateForTax,
            promoCode: transactionData.promo_code,
            transactionId: null,
            transactionType: 'POS',
            createAllocation: false,
            createJournalEntries: false,
            preApproved: transactionData.pre_approved || false
          });

          if (discountCheck.requiresApproval && !transactionData.pre_approved) {
            requiresApproval = true;
            log.info('Discount requires approval', {
              promoCode: transactionData.promo_code,
              threshold: discountCheck.approvalThreshold
            });

            const approvalRequest = await DiscountRuleEngine.submitForApproval(
              {
                businessId,
                customerId: transactionData.customer_id,
                amount: totalSubtotal,
                items: discountItems,
                promoCode: transactionData.promo_code,
                transactionId: null,
                transactionType: 'POS',
                discountDetails: discountCheck
              },
              userId
            );

            approvalId = approvalRequest.approvalId;
            discountResult = discountCheck;

            log.info('Approval request created', { approvalId, requiresApproval: true });
          } else if (discountCheck.totalDiscount > 0) {
            discountResult = discountCheck;
            totalDiscount = discountCheck.totalDiscount;

            log.info('Discounts will be applied', {
              originalSubtotal: totalSubtotal,
              totalDiscount: discountCheck.totalDiscount,
              discountCount: discountCheck.appliedDiscounts.length
            });
          }
        } catch (discountError) {
          log.error('Discount calculation failed, continuing without discounts', {
            error: discountError.message,
            promoCode: transactionData.promo_code
          });
        }
      }

      console.log(`🔵 [${new Date().toISOString()}] Discount check complete in ${Date.now() - discountStart}ms`);

      // ------------------------------------------------------------------
      // STEP 3: Allocate discount proportionally, then tax on NET
      // Now that we know totalDiscount, we distribute it across items
      // pro-rata by gross amount, then calculate tax on each item's net price.
      // This is the fix for Bug A: tax on net, not gross.
      // ------------------------------------------------------------------
      const discountRatio = totalSubtotal > 0 ? totalDiscount / totalSubtotal : 0;
      const processedItems = [];
      let totalTax = 0;

      for (const item of grossItems) {
        const itemDiscount = Math.round(item.grossItemTotal * discountRatio * 100) / 100;
        const netItemTotal = item.grossItemTotal - itemDiscount;
        const netUnitPrice = item.quantity > 0 ? netItemTotal / item.quantity : 0;

        const taxCalculation = await POSTaxCalculator.calculateLineItemTax(
          client,
          businessId,
          {
            ...item,
            unit_price: netUnitPrice,
            _override_amount: netItemTotal,
          },
          customerType,
          transactionData.transaction_date || new Date()
        );

        const itemTax = taxCalculation.taxAmount || 0;
        totalTax += itemTax;

        processedItems.push({
          ...item,
          net_unit_price: netUnitPrice,
          item_discount_amount: itemDiscount,
          tax_rate: taxCalculation.taxRate,
          tax_amount: itemTax,
          line_tax_amount: itemTax,
          tax_category_code: taxCalculation.taxCategoryCode,
          tax_id: taxCalculation.taxId,
          tax_code: taxCalculation.taxCode,
          tax_name: taxCalculation.taxName,
          total_price: item.grossItemTotal,
        });

        log.debug('POS item processed (net tax)', {
          itemName: item.item_name,
          grossTotal: item.grossItemTotal,
          itemDiscount,
          netItemTotal,
          netUnitPrice,
          taxRate: taxCalculation.taxRate,
          taxAmount: itemTax,
          customerType,
        });
      }

      const allocatedDiscount = processedItems.reduce((s, i) => s + i.item_discount_amount, 0);
      const roundingDiff = totalDiscount - allocatedDiscount;
      if (Math.abs(roundingDiff) > 0.005 && processedItems.length > 0) {
        processedItems[processedItems.length - 1].item_discount_amount += roundingDiff;
      }

      // ------------------------------------------------------------------
      // Build accounting metadata for the trigger
      // The trigger reads these columns to create the correct journal entry.
      // ------------------------------------------------------------------
      let discountAccountCode = null;
      let discountBreakdownByAccount = null;

      if (totalDiscount > 0 && discountResult?.appliedDiscounts?.length > 0) {
        const { DiscountAccountingService } = await import('./discountAccountingService.js');
        
        discountBreakdownByAccount = discountResult.appliedDiscounts.reduce((acc, d) => {
          const code = DiscountAccountingService.getDiscountAccountByType(d.type);
          acc[code] = (acc[code] || 0) + d.amount;
          return acc;
        }, {});

        discountAccountCode = Object.entries(discountBreakdownByAccount)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || '4110';
      }

      const subtotalAfterDiscount = totalSubtotal - totalDiscount;
      const finalAmount = subtotalAfterDiscount + totalTax;
      const averageTaxRate = subtotalAfterDiscount > 0
        ? (totalTax / subtotalAfterDiscount) * 100
        : 0;

      log.info('POS transaction totals calculated', {
        businessId,
        grossSubtotal: totalSubtotal,
        discount: totalDiscount,
        subtotalAfterDiscount,
        netTax: totalTax,
        averageTaxRate: averageTaxRate.toFixed(2),
        finalAmount,
        discountAccountCode,
        customerType,
        requiresApproval
      });

      // ------------------------------------------------------------------
      // STEP 4: Build INSERT query with new columns
      // PATCH 2: Added net_tax_amount, discount_account_code,
      //          discount_breakdown_by_account, customer_type_at_sale
      // ------------------------------------------------------------------
      let insertQuery = `
        INSERT INTO pos_transactions (
          business_id, transaction_number, customer_id, transaction_date,
          total_amount, tax_amount, discount_amount, final_amount,
          payment_method, payment_status, status, notes, created_by,
          accounting_processed, accounting_error, tax_rate,
          total_discount, discount_breakdown,
          net_tax_amount,
          discount_account_code,
          discount_breakdown_by_account,
          customer_type_at_sale`;

      let approvalColumnsToInsert = [];
      try {
        const checkResult = await client.query(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_name = 'pos_transactions'
           AND column_name IN ('requires_approval', 'approval_id')`
        );
        approvalColumnsToInsert = checkResult.rows.map(r => r.column_name);

        if (approvalColumnsToInsert.includes('requires_approval')) {
          insertQuery += `, requires_approval`;
        }
        if (approvalColumnsToInsert.includes('approval_id')) {
          insertQuery += `, approval_id`;
        }
      } catch (checkError) {
        log.warn('Could not check for approval columns', { error: checkError.message });
      }

      insertQuery += `) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22`;

      let paramCount = 23;
      const values = [
        businessId,
        transactionNumberValue,
        transactionData.customer_id || null,
        transactionData.transaction_date || new Date(),
        totalSubtotal,
        totalTax,
        totalDiscount,
        finalAmount,
        transactionData.payment_method,
        transactionData.payment_status || 'completed',
        'pending',
        transactionData.notes || '',
        userId,
        false,
        null,
        averageTaxRate,
        totalDiscount,
        transactionData.discount_breakdown ||
          (discountResult ? JSON.stringify(discountResult.appliedDiscounts) : null),
        totalTax,
        discountAccountCode,
        discountBreakdownByAccount ? JSON.stringify(discountBreakdownByAccount) : null,
        customerType,
      ];

      if (approvalColumnsToInsert.includes('requires_approval')) {
        insertQuery += `, $${paramCount}`;
        values.push(requiresApproval);
        paramCount++;
      }
      if (approvalColumnsToInsert.includes('approval_id')) {
        insertQuery += `, $${paramCount}`;
        values.push(approvalId);
        paramCount++;
      }

      insertQuery += `) RETURNING *`;

      const transactionResult = await client.query(insertQuery, values);
      const transaction = transactionResult.rows[0];
      console.log(`🔵 [${new Date().toISOString()}] Transaction inserted with status='pending' (id: ${transaction.id}) - ${Date.now() - requestStart}ms`);

      // ------------------------------------------------------------------
      // STEP 5: Insert transaction items with new columns
      // PATCH 3: Added net_unit_price, line_tax_amount, item_discount_amount
      // ------------------------------------------------------------------
      const processedTransactionItems = [];

      for (const item of processedItems) {
        if (!item.item_name) throw new Error('Line item name is required');
        if (!item.item_type) throw new Error('Line item type is required');
        if (!item.quantity || item.quantity <= 0)
          throw new Error('Line item must have a valid quantity > 0');
        if (!item.unit_price || item.unit_price <= 0)
          throw new Error('Line item must have a valid unit_price > 0');

        const transactionItemId = await UUIDService.getUUID({
          context: 'pos_transaction_item'
        });

        try {
          const itemResult = await client.query(
            `INSERT INTO pos_transaction_items (
              id,
              business_id,
              pos_transaction_id,
              product_id,
              inventory_item_id,
              service_id,
              equipment_id,
              booking_id,
              item_type,
              item_name,
              quantity,
              unit_price,
              total_price,
              discount_amount,
              tax_rate,
              tax_category_code,
              net_unit_price,
              line_tax_amount,
              item_discount_amount,
              created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
            RETURNING id, product_id, inventory_item_id, service_id, equipment_id, booking_id,
                      item_type, item_name, quantity, unit_price, discount_amount, total_price,
                      tax_rate, tax_category_code, net_unit_price, line_tax_amount, item_discount_amount, created_at`,
            [
              transactionItemId,
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
              item.grossItemTotal,
              item.item_discount_amount,
              item.tax_rate,
              item.tax_category_code || 'STANDARD_GOODS',
              item.net_unit_price,
              item.line_tax_amount,
              item.item_discount_amount,
            ]
          );

          const insertedItem = itemResult.rows[0];

          await POSTaxCalculator.createTaxTransaction(
            client,
            businessId,
            transaction.id,
            item,
            {
              taxRate: item.tax_rate,
              taxAmount: item.line_tax_amount,
              taxCategoryCode: item.tax_category_code,
              itemTotal: item.net_unit_price * item.quantity,
              taxId: item.tax_id,
              taxCode: item.tax_code,
              taxName: item.tax_name
            },
            transactionData.transaction_date || new Date(),
            customerType,
            transactionData.customer_id || null
          );

          processedTransactionItems.push({
            id: insertedItem.id,
            product_id: insertedItem.product_id,
            service_id: insertedItem.service_id,
            type: insertedItem.item_type,
            amount: insertedItem.unit_price,
            quantity: insertedItem.quantity,
            total_price: insertedItem.total_price,
            tax_amount: insertedItem.line_tax_amount,
            tax_id: item.tax_id,
            tax_code: item.tax_code
          });

          log.debug('POS item inserted successfully', {
            itemId: insertedItem.id,
            transactionId: transaction.id,
            itemName: insertedItem.item_name,
            quantity: insertedItem.quantity,
            netUnitPrice: insertedItem.net_unit_price,
            totalPrice: insertedItem.total_price,
            taxRate: insertedItem.tax_rate,
            taxId: item.tax_id,
            taxCode: item.tax_code
          });
        } catch (itemError) {
          log.error('Failed to insert POS item', {
            error: itemError.message,
            item: item.item_name,
            missingFields: { tax_category_code: !item.tax_category_code }
          });
          throw itemError;
        }
      }
      console.log(`🔵 [${new Date().toISOString()}] All ${processedItems.length} items inserted - ${Date.now() - requestStart}ms`);

      // ------------------------------------------------------------------
      // STEP 6: Update status to 'completed' to trigger accounting
      // ------------------------------------------------------------------
      await client.query(
        `UPDATE pos_transactions
         SET status = 'completed', updated_at = NOW()
         WHERE id = $1`,
        [transaction.id]
      );
      console.log(`🔵 [${new Date().toISOString()}] Status updated to 'completed' - Accounting trigger fired - ${Date.now() - requestStart}ms`);

      // ------------------------------------------------------------------
      // STEP 7: Discount allocation (after items exist for FK constraint)
      // ------------------------------------------------------------------
      if (discountResult && discountResult.totalDiscount > 0 && !requiresApproval) {
        try {
          const allocationResult = await createAllocationAfterTransaction(
            {
              businessId,
              transactionId: transaction.id,
              transactionType: 'POS',
              discountResult,
              items: processedTransactionItems.map(item => ({
                id: item.id,
                product_id: item.product_id,
                service_id: item.service_id,
                quantity: item.quantity,
                unit_price: item.amount,
                total_price: item.total_price,
                tax_amount: item.tax_amount
              })),
              userId
            },
            client
          );

          if (allocationResult && allocationResult.allocation) {
            transaction.discount_allocation_id = allocationResult.allocation.id;
            transaction.discount_info = {
              total_discount: discountResult.totalDiscount,
              applied_discounts: discountResult.appliedDiscounts,
              allocation: allocationResult.allocation,
              accounting: allocationResult.accounting
            };

            log.info('Discount allocation created successfully', {
              transactionId: transaction.id,
              allocationId: allocationResult.allocation.id,
              discountAmount: discountResult.totalDiscount
            });
          }
        } catch (allocationError) {
          log.error('Failed to create discount allocation after transaction', {
            error: allocationError.message,
            transactionId: transaction.id,
            stack: allocationError.stack
          });
        }
      }

      if (approvalId) {
        try {
          await client.query(
            `UPDATE discount_approvals
             SET pos_transaction_id = $1,
                 transaction_type = 'POS',
                 items = $2,
                 calculated_discount = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [
              transaction.id,
              JSON.stringify(processedItems),
              discountResult ? discountResult.totalDiscount : 0,
              approvalId
            ]
          );

          log.info('Approval updated with transaction ID', {
            approvalId,
            transactionId: transaction.id
          });
        } catch (approvalUpdateError) {
          log.error('Failed to update approval with transaction ID', {
            error: approvalUpdateError.message,
            approvalId,
            transactionId: transaction.id
          });
        }
      }

      const equipmentItems = processedItems.filter(
        item => item.item_type === 'equipment_hire'
      );
      if (equipmentItems.length > 0) {
        for (const equipmentItem of equipmentItems) {
          log.info('Processing equipment hire transaction', {
            equipment_id: equipmentItem.equipment_id,
            booking_id: equipmentItem.booking_id,
            transaction_id: transaction.id
          });
        }
      }

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
          customer_type: customerType,
          tax_items_count: processedItems.filter(item => item.tax_amount > 0).length,
          discount_amount: totalDiscount,
          requires_approval: requiresApproval,
          approval_id: approvalId
        }
      });

      await client.query('COMMIT');
      committed = true;
      client.release();
      console.log(`🔵 [${new Date().toISOString()}] COMMIT complete, connection released - ${Date.now() - requestStart}ms`);

      log.info('✅ POS transaction committed successfully (two-phase commit pattern)', {
        transactionId: transaction.id,
        businessId,
        subtotal: totalSubtotal,
        tax: totalTax,
        finalAmount,
        customerType,
        itemCount: processedItems.length,
        requiresApproval,
        note: 'Tax calculated on NET amount (post-discount)'
      });

      console.log(`🔵 [${new Date().toISOString()}] Verifying accounting trigger results... - ${Date.now() - requestStart}ms`);
      let accountingResult = { success: true, linesCreated: 0, message: "Handled by database trigger" };

      await new Promise(resolve => setTimeout(resolve, 100));

      const verifyClient = await getClient();
      try {
        const checkResult = await verifyClient.query(
          `SELECT COUNT(*) as count, SUM(CASE WHEN ca.account_code IN ('5100', '1300') THEN 1 ELSE 0 END) as cogs_count
           FROM journal_entries je
           JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
           JOIN chart_of_accounts ca ON jel.account_id = ca.id
           WHERE je.reference_type = 'pos_transaction' AND je.reference_id = $1::text`,
          [transaction.id]
        );

        const entryCount = parseInt(checkResult.rows[0].count);
        if (entryCount > 0) {
          accountingResult.linesCreated = entryCount;
          accountingResult.verified = true;
          accountingResult.cogs_detected = parseInt(checkResult.rows[0].cogs_count) > 0;

          log.info('✅ Database trigger created journal entries', {
            transactionId: transaction.id,
            linesCreated: entryCount,
            cogsDetected: accountingResult.cogs_detected
          });
        } else {
          accountingResult.verified = false;
          accountingResult.message = 'No journal entries found - trigger may not have fired';
          log.warn('⚠️ No journal entries found after trigger should have fired', {
            transactionId: transaction.id
          });
        }
      } finally {
        verifyClient.release();
      }

      const updateClient = await getClient();
      try {
        if (accountingResult?.verified === true) {
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
        } else {
          await updateClient.query(
            `UPDATE pos_transactions
             SET accounting_error = $1,
                 updated_at = NOW()
             WHERE id = $2 AND business_id = $3`,
            [
              accountingResult?.message || 'No journal entries created by database trigger',
              transaction.id,
              businessId
            ]
          );

          log.warn('⚠️ Updated accounting_error with warning message', {
            transactionId: transaction.id,
            error: accountingResult?.message
          });
        }
      } finally {
        updateClient.release();
      }

      const response = {
        ...transaction,
        status: 'completed',
        items: processedTransactionItems,
        tax_breakdown: {
          subtotal: subtotalAfterDiscount,
          gross_subtotal: totalSubtotal,
          tax_amount: totalTax,
          tax_rate: averageTaxRate,
          discount_amount: totalDiscount,
          final_amount: finalAmount,
          customer_type: customerType,
          tax_calculation_method: 'net_amount_after_discount'
        },
        discount_info:
          discountResult && !discountResult.requiresApproval
            ? {
                total_discount: discountResult.totalDiscount,
                applied_discounts: discountResult.appliedDiscounts,
                allocation: transaction.discount_info?.allocation,
                accounting: transaction.discount_info?.accounting
              }
            : null,
        requires_approval: requiresApproval,
        approval_id: approvalId,
        accounting_processed: accountingResult?.verified === true,
        accounting_error: accountingResult?.verified === true ? null : (accountingResult?.message || 'No journal entries created'),
        accounting_info: {
          method: 'database_trigger (two-phase commit)',
          status: accountingResult?.verified === true ? 'created' : 'failed',
          entries_created: accountingResult?.linesCreated || 0,
          note: accountingResult?.verified === true
            ? 'Complete journal entries created by database trigger (Cash debit, Revenue credit, Tax Payable credit, COGS debit, Inventory credit)'
            : accountingResult?.message || 'Accounting creation failed - check trigger status',
          tax_calculated: true,
          tax_calculation_base: 'NET amount (post-discount)',
          customer_type_used: customerType,
          items_with_tax: processedItems.filter(item => item.tax_amount > 0).length,
          two_phase_commit: 'pending→completed status transition fired trigger after items inserted'
        }
      };

      log.info('✅ POS transaction completed successfully (two-phase commit pattern)', {
        transactionId: transaction.id,
        businessId,
        accounting_processed: response.accounting_processed,
        accounting_verified: accountingResult?.verified === true,
        lines_created: accountingResult?.linesCreated || 0,
        requires_approval: requiresApproval,
        status_flow: 'pending → completed',
        tax_calculation: 'NET amount (post-discount)'
      });

      console.log(`🟢 [${new Date().toISOString()}] ========== POS TRANSACTION COMPLETE in ${Date.now() - requestStart}ms ==========\n`);
      return response;

    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK');
      }
      log.error('❌ POS transaction creation failed:', error);
      throw error;
    } finally {
      if (!committed) {
        client.release();
      }
    }
  }

  // ============================================================================
  // getTransactions
  // ============================================================================
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
          (SELECT COUNT(*) FROM journal_entries je
           WHERE je.reference_type = 'pos_transaction'
           AND je.reference_id = pt.id::text) as accounting_entries_count,
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

      queryStr +=
        ' GROUP BY pt.id, c.first_name, c.last_name, c.phone, u.full_name ORDER BY pt.transaction_date DESC';

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

      const transactionsWithProfit = result.rows.map(transaction => {
        const totalCogs = parseFloat(transaction.total_cogs) || 0;
        const finalAmount = parseFloat(transaction.final_amount) || 0;
        return {
          ...transaction,
          gross_profit: finalAmount - totalCogs,
          gross_margin:
            finalAmount > 0 ? ((finalAmount - totalCogs) / finalAmount) * 100 : 0
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

  // ============================================================================
  // getTransactionById
  // ============================================================================
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

      const transactionResult = await client.query(transactionQuery, [
        businessId,
        transactionId
      ]);

      if (transactionResult.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const transaction = transactionResult.rows[0];

      const itemsQuery =
        `SELECT
          pti.*,
          COALESCE(p.name, ii.name, s.name, fa.asset_name, pti.item_name) as item_display_name,
          fa.asset_name as equipment_name,
          fa.asset_code as equipment_code,
          ebb.booking_number as booking_number,
          ebb.status as booking_status,
          ii.id as inventory_item_id,
          ii.cost_price as inventory_cost_price,
          ii.current_stock as inventory_current_stock,
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

      transaction.tax_summary = {
        items_with_tax: transaction.items.filter(item => item.tax_amount > 0).length,
        total_tax: transaction.tax_amount || 0,
        average_tax_rate: transaction.tax_rate || 0
      };

      const taxAuditResult = await client.query(
        `SELECT tt.*, ttypes.tax_code, ttypes.tax_name
         FROM transaction_taxes tt
         LEFT JOIN tax_types ttypes ON tt.tax_type_id = ttypes.id
         WHERE tt.business_id = $1
           AND tt.transaction_id = $2
           AND tt.transaction_type = 'pos_sale'
         ORDER BY tt.created_at`,
        [businessId, transactionId]
      );
      transaction.tax_audit_trail = taxAuditResult.rows;

      const journalEntriesResult = await client.query(
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
          AND je.reference_id = $2::text
        GROUP BY je.id
        ORDER BY je.created_at`,
        [businessId, transactionId]
      );
      transaction.journal_entries = journalEntriesResult.rows;

      const inventoryTransactionsResult = await client.query(
        `SELECT it.*, ii.name as item_name, ii.sku
        FROM inventory_transactions it
        LEFT JOIN inventory_items ii ON it.inventory_item_id = ii.id
        WHERE it.business_id = $1
          AND it.reference_type = 'pos_transaction'
          AND it.reference_id = $2
        ORDER BY it.created_at`,
        [businessId, transactionId]
      );
      transaction.inventory_transactions = inventoryTransactionsResult.rows;

      try {
        transaction.accounting_summary =
          await TransactionAccountingService.getTransactionAccountingSummary(
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

  // ============================================================================
  // updateTransaction
  // ============================================================================
  static async updateTransaction(businessId, transactionId, updateData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const currentTransaction = await client.query(
        'SELECT * FROM pos_transactions WHERE id = $1 AND business_id = $2',
        [transactionId, businessId]
      );

      if (currentTransaction.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const currentStatus = currentTransaction.rows[0].status;
      const newStatus = updateData.status;

      const isVoidingCompleted =
        (newStatus === 'void' || newStatus === 'cancelled') &&
        currentStatus === 'completed';

      if (isVoidingCompleted) {
        log.info('Database will handle reversal accounting when status changes', {
          transaction_id: transactionId,
          old_status: currentStatus,
          new_status: newStatus,
          trigger: 'trigger_auto_pos_accounting'
        });
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

      const updateQuery =
        `UPDATE pos_transactions
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCount - 1} AND business_id = $${paramCount}
        RETURNING *`;

      log.info('🗄️ Database Query - updateTransaction:', {
        query: updateQuery,
        params: updateValues
      });

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

  // ============================================================================
  // deleteTransaction
  // ============================================================================
  static async deleteTransaction(businessId, transactionId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const currentTransaction = await client.query(
        'SELECT * FROM pos_transactions WHERE id = $1 AND business_id = $2',
        [transactionId, businessId]
      );

      if (currentTransaction.rows.length === 0) {
        throw new Error('POS transaction not found or access denied');
      }

      const transaction = currentTransaction.rows[0];

      const accountingCheck = await client.query(
        `SELECT COUNT(*) as count FROM journal_entries
         WHERE reference_type = 'pos_transaction' AND reference_id = $1::text`,
        [transactionId]
      );

      if (parseInt(accountingCheck.rows[0].count) > 0) {
        throw new Error(
          'Cannot delete transaction with accounting entries. Update status to "void" instead.'
        );
      }

      await client.query(
        'DELETE FROM pos_transaction_items WHERE business_id = $1 AND pos_transaction_id = $2',
        [businessId, transactionId]
      );

      await client.query(
        `DELETE FROM inventory_transactions
         WHERE business_id = $1 AND reference_id = $2 AND reference_type = 'pos_transaction'`,
        [businessId, transactionId]
      );

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

  // ============================================================================
  // getSalesAnalytics
  // ============================================================================
  static async getSalesAnalytics(businessId, startDate = null, endDate = null) {
    const client = await getClient();

    try {
      const queryStr =
        `SELECT
          sa.*,
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

      log.info('🗄️ Database Query - getSalesAnalytics:', { query: queryStr, params });

      const result = await client.query(queryStr, params);
      const analytics = result.rows[0] || {};

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
        gross_profit: analytics.gross_profit
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

  // ============================================================================
  // getTodaySales
  // ============================================================================
  static async getTodaySales(businessId) {
    const client = await getClient();

    try {
      const queryStr =
        `SELECT
          COUNT(*) as transaction_count,
          COALESCE(SUM(pt.final_amount), 0) as total_sales,
          COALESCE(AVG(pt.final_amount), 0) as average_transaction,
          COUNT(DISTINCT pt.customer_id) as customer_count,
          COALESCE(SUM(it.total_cost), 0) as total_cogs,
          COALESCE(SUM(pt.final_amount), 0) - COALESCE(SUM(it.total_cost), 0) as gross_profit,
          COUNT(*) FILTER (WHERE pt.payment_method = 'cash') as cash_count,
          COUNT(*) FILTER (WHERE pt.payment_method = 'card') as card_count,
          COUNT(*) FILTER (WHERE pt.payment_method = 'mobile_money') as mobile_money_count
        FROM pos_transactions pt
        LEFT JOIN inventory_transactions it ON pt.id = it.reference_id
          AND it.reference_type = 'pos_transaction'
          AND it.transaction_type = 'sale'
        WHERE pt.business_id = $1
          AND pt.status = 'completed'
          AND DATE(pt.transaction_date) = CURRENT_DATE`;

      log.info('🗄️ Database Query - getTodaySales:', {
        query: queryStr,
        params: [businessId]
      });

      const result = await client.query(queryStr, [businessId]);
      const todaySales = result.rows[0] || {};

      if (todaySales.total_sales > 0) {
        todaySales.gross_margin =
          (todaySales.gross_profit / todaySales.total_sales) * 100;
        todaySales.cogs_percentage =
          (todaySales.total_cogs / todaySales.total_sales) * 100;
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
      log.error('❌ Today sales query failed:', { error: error.message, businessId });
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // getPosCatalog
  // ============================================================================
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
          CASE
            WHEN p.inventory_item_id IS NOT NULL THEN 'synced'
            ELSE 'not_synced'
          END as inventory_sync_status,
          ii.name as inventory_item_name,
          ii.current_stock as inventory_stock,
          ii.cost_price as inventory_cost,
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
      log.error('❌ POS catalog query failed:', { error: error.message, businessId });
      throw error;
    } finally {
      client.release();
    }
  }
}
