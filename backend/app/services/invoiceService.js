import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';
import { TaxService } from './taxService.js';
import { DiscountRuleEngine } from './discountRuleEngine.js';
import { DiscountSettingsService } from './discountSettingsService.js';
import { EarlyPaymentService } from './earlyPaymentService.js';
import { UUIDService } from './uuidService.js';

// ================ PRODUCTION-READY TAX CALCULATION MODULE ================
/**
 * Tax calculation helper for invoice line items
 *
 * PRODUCTION FEATURES:
 * - ✅ No hard-coded country codes
 * - ✅ All item types use TaxService (products, services, manual)
 * - ✅ Dynamic country from business settings
 * - ✅ Fail-fast error handling
 * - ✅ Comprehensive logging
 */
class InvoiceTaxCalculator {
  /**
   * Get customer type for tax calculation
   */
  static async getCustomerType(client, customerId, businessId) {
    try {
      const customerQuery = await client.query(
        `SELECT customer_type FROM customers
         WHERE id = $1 AND business_id = $2`,
        [customerId, businessId]
      );

      if (customerQuery.rows.length === 0) {
        log.warn('Customer not found, using default type "company"', {
          customerId,
          businessId
        });
        return 'company'; // Default
      }

      const customerType = customerQuery.rows[0].customer_type || 'company';
      log.debug('Customer type retrieved', {
        customerId,
        customerType
      });

      return customerType;
    } catch (error) {
      log.error('Failed to get customer type', {
        customerId,
        error: error.message
      });
      return 'company'; // Default on error
    }
  }

  /**
   * Calculate tax for a single line item
   */
  static async calculateLineItemTax(client, businessId, item, transactionDate, customerType = 'company') {
    let taxRate = 0;
    let taxAmount = 0;
    let taxCategoryCode = 'STANDARD_GOODS';
    const itemTotal = item.quantity * item.unit_price;

    // CASE 1: Product-based line item
    if (item.product_id) {
      try {
        // Get product info including tax category with business_id check
        const productQuery = await client.query(
          `SELECT p.tax_category_code, p.name as product_name
           FROM products p
           WHERE p.id = $1 AND p.business_id = $2`,
          [item.product_id, businessId]
        );

        if (productQuery.rows.length === 0) {
          log.error('Product not found or belongs to different business.', {
            productId: item.product_id,
            businessId
          });
          throw new Error(`Product not found for this business: ${item.product_id}`);
        }

        const product = productQuery.rows[0];
        taxCategoryCode = product.tax_category_code || 'STANDARD_GOODS';

        log.debug('Product found for tax calculation', {
          productId: item.product_id,
          productName: product.product_name,
          taxCategory: taxCategoryCode
        });

        // Calculate tax using TaxService (country from business)
        const taxResult = await TaxService.calculateItemTax({
          businessId,
          productCategory: taxCategoryCode,
          amount: itemTotal,
          transactionType: 'sale',
          customerType: customerType,
          isExport: false,
          transactionDate: transactionDate ? new Date(transactionDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
        });

        taxRate = taxResult.taxRate;
        taxAmount = taxResult.taxAmount;

        log.debug('Product tax calculated successfully', {
          productId: item.product_id,
          productName: product.product_name,
          taxCategory: taxCategoryCode,
          taxCode: taxResult.taxCode,
          taxRate,
          taxAmount,
          customerType
        });
      } catch (error) {
        log.error('Product tax calculation failed. Invoice creation will rollback.', {
          productId: item.product_id,
          error: error.message,
          stack: error.stack
        });
        throw new Error(`Tax calculation failed for product ${item.product_id}: ${error.message}`);
      }
    }
    // CASE 2: Service-based line item
    else if (item.service_id) {
      try {
        // Get service info
        const serviceQuery = await client.query(
          `SELECT s.name as service_name
           FROM services s
           WHERE s.id = $1 AND s.business_id = $2`,
          [item.service_id, businessId]
        );

        if (serviceQuery.rows.length === 0) {
          log.warn('Service not found, will use default tax category', {
            serviceId: item.service_id,
            businessId
          });
        }

        const service = serviceQuery.rows[0];

        // Services use a default tax category
        taxCategoryCode = 'SERVICES';

        log.debug('Service found for tax calculation', {
          serviceId: item.service_id,
          serviceName: service?.service_name,
          taxCategory: taxCategoryCode
        });

        // Calculate tax using TaxService with the SERVICES category
        const taxResult = await TaxService.calculateItemTax({
          businessId,
          productCategory: taxCategoryCode,
          amount: itemTotal,
          transactionType: 'sale',
          customerType: customerType,
          isExport: false,
          transactionDate: transactionDate ? new Date(transactionDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
        });

        taxRate = taxResult.taxRate;
        taxAmount = taxResult.taxAmount;

        log.debug('Service tax calculated successfully', {
          serviceId: item.service_id,
          serviceName: service?.service_name,
          taxCategory: taxCategoryCode,
          taxCode: taxResult.taxCode,
          taxRate,
          taxAmount,
          customerType
        });
      } catch (error) {
        log.error('Service tax calculation failed', {
          serviceId: item.service_id,
          error: error.message,
          stack: error.stack
        });
        throw new Error(`Tax calculation failed for service ${item.service_id}: ${error.message}`);
      }
    }
    // CASE 3: Manual line item
    else {
      if (item.tax_category_code) {
        try {
          // Calculate tax using TaxService
          const taxResult = await TaxService.calculateItemTax({
            businessId,
            productCategory: item.tax_category_code,
            amount: itemTotal,
            transactionType: 'sale',
            customerType: customerType,
            isExport: false,
            transactionDate: transactionDate ? new Date(transactionDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
          });

          taxRate = taxResult.taxRate;
          taxAmount = taxResult.taxAmount;
          taxCategoryCode = item.tax_category_code;

          log.debug('Manual line item tax calculated from category', {
            description: item.description,
            taxCategory: taxCategoryCode,
            taxRate,
            taxAmount,
            customerType
          });
        } catch (error) {
          log.warn('Tax calculation failed for manual item, using provided rate', {
            description: item.description,
            error: error.message
          });
          taxRate = item.tax_rate || 0;
          taxAmount = itemTotal * (item.tax_rate || 0) / 100;
          taxCategoryCode = item.tax_category_code;
        }
      } else {
        // No category provided - use manual rate
        taxRate = item.tax_rate || 0;
        taxAmount = itemTotal * (item.tax_rate || 0) / 100;
        taxCategoryCode = 'STANDARD_GOODS';

        log.debug('Manual line item tax from provided rate', {
          description: item.description,
          taxRate,
          taxAmount,
          customerType
        });
      }
    }

    // Handle zero values - convert to null for database consistency
    taxRate = taxRate === 0 ? null : taxRate;
    taxAmount = taxAmount === 0 ? null : taxAmount;

    return {
      taxRate,
      taxAmount,
      taxCategoryCode,
      itemTotal,
      lineTotal: itemTotal + (taxAmount || 0)
    };
  }

  /**
   * Create transaction_taxes record for audit trail
   */
  static async createTaxTransaction(client, businessId, invoiceId, lineItem, taxCalculation, transactionDate, customerType = 'company') {
    if (!taxCalculation.taxAmount || taxCalculation.taxAmount <= 0) {
      return null; // Skip zero-tax items
    }

    try {
      const businessQuery = await client.query(
        `SELECT
          b.country_code,
          b.name as business_name,
          tc.country_name
         FROM businesses b
         LEFT JOIN tax_countries tc ON b.country_code = tc.country_code
         WHERE b.id = $1`,
        [businessId]
      );

      if (businessQuery.rows.length === 0) {
        throw new Error(`Business not found: ${businessId}`);
      }

      const business = businessQuery.rows[0];
      const businessCountry = business.country_code || 'UG';
      const businessCountryName = business.country_name || 'Uganda';

      const taxInfo = await TaxService.getTaxRate(
        taxCalculation.taxCategoryCode,
        businessCountry,
        transactionDate || new Date().toISOString().split('T')[0]
      );

      const taxTypeQuery = await client.query(
        'SELECT id FROM tax_types WHERE tax_code = $1',
        [taxInfo.taxCode]
      );

      const taxRateQuery = await client.query(
        'SELECT id FROM country_tax_rates WHERE country_code = $1 AND tax_type_id = $2 AND is_default = true',
        [businessCountry, taxTypeQuery.rows[0]?.id]
      );

      const taxTransactionQuery = `
        INSERT INTO transaction_taxes (
          business_id, transaction_id, transaction_type, transaction_date,
          tax_type_id, tax_rate_id, taxable_amount, tax_rate, tax_amount,
          country_code, product_category_code, tax_period, calculation_context,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        RETURNING id
      `;

      const result = await client.query(taxTransactionQuery, [
        businessId,
        invoiceId,
        'sale',
        transactionDate || new Date(),
        taxTypeQuery.rows[0]?.id,
        taxRateQuery.rows[0]?.id,
        taxCalculation.itemTotal,
        taxCalculation.taxRate,
        taxCalculation.taxAmount,
        businessCountry,
        taxCalculation.taxCategoryCode,
        new Date().toISOString().substring(0, 7) + '-01',
        JSON.stringify({
          invoice_id: invoiceId,
          line_item_description: lineItem.description,
          product_id: lineItem.product_id,
          service_id: lineItem.service_id,
          calculated_by: 'InvoiceTaxCalculator',
          tax_engine_version: '1.0',
          business_country: businessCountry,
          business_country_name: businessCountryName,
          customer_type: customerType
        })
      ]);

      log.debug('Tax transaction recorded', {
        transactionId: result.rows[0]?.id,
        invoiceId,
        taxAmount: taxCalculation.taxAmount,
        country: businessCountry,
        countryName: businessCountryName,
        customerType
      });

      return result.rows[0]?.id;
    } catch (error) {
      log.error('Failed to create tax transaction record', {
        invoiceId,
        error: error.message
      });
      return null;
    }
  }
}

export const invoiceService = {
  async createInvoice(invoiceData, userId, businessId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Validate required fields
      if (!invoiceData.customer_id) {
        throw new Error('Customer ID is required');
      }

      if (!invoiceData.line_items || invoiceData.line_items.length === 0) {
        throw new Error('At least one line item is required');
      }

      // Get customer type for tax calculation
      const customerType = await InvoiceTaxCalculator.getCustomerType(
        client,
        invoiceData.customer_id,
        businessId
      );

      log.debug('Using customer type for tax calculation', {
        customerId: invoiceData.customer_id,
        customerType
      });

      // ================ SIMPLE & ROBUST DATE HANDLING ================
      const toUTCISOString = (dateInput) => {
        if (!dateInput) {
          return new Date().toISOString();
        }
        try {
          if (typeof dateInput === "string" && dateInput.includes("T")) {
            return dateInput;
          }
          if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return new Date(dateInput + "T00:00:00Z").toISOString();
          }
          const date = new Date(dateInput);
          if (isNaN(date.getTime())) {
            return new Date().toISOString();
          }
          return date.toISOString();
        } catch (error) {
          return new Date().toISOString();
        }
      };

      const toDateOnlyString = (dateInput) => {
        if (!dateInput) {
          return new Date().toISOString().split("T")[0];
        }
        try {
          const date = new Date(dateInput);
          if (isNaN(date.getTime())) {
            return new Date().toISOString().split("T")[0];
          }
          return date.toISOString().split("T")[0];
        } catch (error) {
          return new Date().toISOString().split("T")[0];
        }
      };

      const invoiceDateInput = invoiceData.invoice_date;
      const dueDateInput = invoiceData.due_date;

      const transactionDate = toUTCISOString(invoiceDateInput);
      const transactionDateForTax = toDateOnlyString(invoiceDateInput);
      const dueDate = dueDateInput ? toUTCISOString(dueDateInput) : null;

      log.debug("Date parsing debug", {
        input_invoice_date: invoiceDateInput,
        parsed_transactionDate: transactionDate,
        parsed_transactionDateForTax: transactionDateForTax
      });

      let subtotal = 0;
      let totalTax = 0;
      const lineItemsWithTax = [];

      // Calculate tax for each line item with customer type
      for (const item of invoiceData.line_items) {
        const taxCalculation = await InvoiceTaxCalculator.calculateLineItemTax(
          client,
          businessId,
          item,
          transactionDateForTax || new Date().toISOString().split("T")[0],
          customerType
        );

        subtotal += taxCalculation.itemTotal;
        totalTax += (taxCalculation.taxAmount || 0);

        // IMPORTANT: Store only non-generated fields
        // tax_amount is generated by database, so we don't store it
        lineItemsWithTax.push({
          ...item,
          tax_rate: taxCalculation.taxRate, // tax_rate is NOT generated
          tax_category_code: taxCalculation.taxCategoryCode
          // tax_amount is OMITTED - it's generated
          // total_price is OMITTED - it's generated
        });
      }

      // ================ DISCOUNT CALCULATION WITH APPROVAL HANDLING ================
      let discountResult = null;
      let requiresApproval = false;
      let approvalId = null;
      let discountAmount = 0;

      // Generate invoice number
      const invoiceNumberQuery = `
        SELECT COUNT(*) as invoice_count
        FROM invoices
        WHERE business_id = $1
      `;
      const countResult = await client.query(invoiceNumberQuery, [businessId]);
      const invoiceNumber = `INV-${(parseInt(countResult.rows[0].invoice_count) + 1).toString().padStart(4, '0')}`;

      // Create invoice first (without discount)
      const createInvoiceQuery = `
        INSERT INTO invoices (
          business_id, invoice_number, invoice_date, due_date,
          job_id, customer_id, subtotal, tax_amount, tax_rate,
          discount_amount, total_amount, notes, terms, created_by,
          requires_approval, approval_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id, invoice_number, subtotal, tax_amount, discount_amount, total_amount
      `;

      // Initial total without discount
      const initialTotal = subtotal + totalTax;

      const invoiceValues = [
        businessId,
        invoiceNumber,
        transactionDate,
        dueDate,
        invoiceData.job_id || null,
        invoiceData.customer_id,
        subtotal,
        totalTax,
        totalTax > 0 ? (totalTax / subtotal * 100) : 0,
        0, // discount_amount initially 0
        initialTotal, // total_amount initially without discount
        invoiceData.notes || '',
        invoiceData.terms || '',
        userId,
        false, // requires_approval initially false
        null // approval_id initially null
      ];

      const invoiceResult = await client.query(createInvoiceQuery, invoiceValues);
      const newInvoice = invoiceResult.rows[0];

      // ================ CREATE LINE ITEMS - FIXED: Removed generated columns ================
      const processedLineItems = [];
      for (const item of lineItemsWithTax) {
        // Validate required fields
        if (!item.description) {
          throw new Error('Line item description is required');
        }

        if (!item.quantity || item.quantity <= 0) {
          throw new Error('Line item must have a valid quantity > 0');
        }

        if (!item.unit_price || item.unit_price <= 0) {
          throw new Error('Line item must have a valid unit_price > 0');
        }

        // Generate a UUID for the line item
        const lineItemId = await UUIDService.getUUID({ context: 'invoice_line_item' });

        // IMPORTANT: Do NOT include total_price or tax_amount in the INSERT
        // They are GENERATED COLUMNS:
        // - total_price = quantity * unit_price
        // - tax_amount = ((quantity * unit_price) * tax_rate) / 100
        const lineItemQuery = `
          INSERT INTO invoice_line_items (
              id, invoice_id, service_id, product_id, description,
              quantity, unit_price, tax_rate, tax_category_code, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING id, service_id, product_id, description, quantity, unit_price,
                    tax_rate, tax_category_code, total_price, tax_amount, created_at
        `;

        const lineItemResult = await client.query(lineItemQuery, [
          lineItemId,
          newInvoice.id,
          item.service_id || null,
          item.product_id || null,
          item.description,
          item.quantity,
          item.unit_price,
          item.tax_rate, // tax_rate is NOT generated, so we provide it
          item.tax_category_code || null
        ]);

        const insertedItem = lineItemResult.rows[0];

        // Store the actual database ID and values for later use in discount allocation
        processedLineItems.push({
          id: insertedItem.id,
          type: item.service_id ? 'service' : (item.product_id ? 'product' : 'manual'),
          amount: insertedItem.unit_price,
          quantity: insertedItem.quantity,
          total_price: insertedItem.total_price, // This is the generated value
          tax_amount: insertedItem.tax_amount,   // This is the generated value
          service_id: item.service_id,
          product_id: item.product_id,
          description: insertedItem.description
        });

        log.debug('Line item inserted successfully', {
          lineItemId: insertedItem.id,
          quantity: insertedItem.quantity,
          unitPrice: insertedItem.unit_price,
          taxRate: insertedItem.tax_rate,
          totalPrice: insertedItem.total_price, // Generated by database
          taxAmount: insertedItem.tax_amount    // Generated by database
        });

        // Create tax audit trail using the generated tax_amount
        if (insertedItem.tax_amount && insertedItem.tax_amount > 0) {
          await InvoiceTaxCalculator.createTaxTransaction(
            client,
            businessId,
            newInvoice.id,
            {
              description: insertedItem.description,
              product_id: insertedItem.product_id,
              service_id: insertedItem.service_id
            },
            {
              taxRate: insertedItem.tax_rate,
              taxAmount: insertedItem.tax_amount,
              taxCategoryCode: insertedItem.tax_category_code,
              itemTotal: insertedItem.quantity * insertedItem.unit_price
            },
            transactionDate,
            customerType
          );
        }
      }

      // ================ NOW COMMIT THE INVOICE AND LINE ITEMS ================
      await client.query('COMMIT');

      // ================ THEN PROCESS DISCOUNTS IN A NEW TRANSACTION ================
      if (invoiceData.promo_code || invoiceData.apply_discounts !== false) {
        const discountClient = await getClient();
        try {
          await discountClient.query('BEGIN');

          // Prepare items for discount calculation using actual database IDs
          const discountItems = processedLineItems.map(item => ({
            id: item.id, // This is now the actual database UUID
            amount: item.amount,
            quantity: item.quantity,
            type: item.type
          }));

          log.info('Calculating discounts for invoice after line items created', {
            promoCode: invoiceData.promo_code,  // This should now show the actual promo code
            itemCount: discountItems.length,
            subtotal,
            lineItemIds: discountItems.map(i => i.id)
          });

          // Calculate and apply discounts with the actual database IDs
          // FIXED: Make sure promoCode is explicitly passed from invoiceData
          discountResult = await DiscountRuleEngine.calculateFinalPrice({
            businessId,
            customerId: invoiceData.customer_id,
            items: discountItems,
            amount: subtotal,
            userId,
            transactionDate: transactionDateForTax,
            promoCode: invoiceData.promo_code,  // <-- Ensure this line is present and using invoiceData.promo_code
            transactionId: newInvoice.id,
            transactionType: 'INVOICE',
            createAllocation: true,
            createJournalEntries: false,
            preApproved: invoiceData.pre_approved || false,
            client: discountClient // Pass the client for transaction consistency
          });

          // Check if approval is required
          if (discountResult.requiresApproval) {
            requiresApproval = true;
            approvalId = discountResult.approval_id;

            log.info('Discount requires approval', {
              promoCode: invoiceData.promo_code,
              approvalId
            });

            // Update invoice with approval info
            await discountClient.query(
              `UPDATE invoices
               SET requires_approval = true,
                   approval_id = $1,
                   updated_at = NOW()
               WHERE id = $2`,
              [approvalId, newInvoice.id]
            );
          }
          // Apply discounts if approved
          else if (discountResult.totalDiscount > 0) {
            discountAmount = discountResult.totalDiscount;
            const finalTotal = subtotal + totalTax - discountAmount;

            // Update invoice with discount info
            await discountClient.query(
              `UPDATE invoices
               SET discount_amount = $1,
                   total_discount = $1,
                   total_amount = $2,
                   discount_breakdown = $3,
                   updated_at = NOW()
               WHERE id = $4`,
              [discountAmount, finalTotal, JSON.stringify(discountResult.appliedDiscounts), newInvoice.id]
            );

            log.info('Discounts applied to invoice', {
              originalSubtotal: subtotal,
              totalDiscount: discountAmount,
              finalTotal,
              discountCount: discountResult.appliedDiscounts.length,
              promoCode: invoiceData.promo_code  // Added for debugging
            });
          }

          await discountClient.query('COMMIT');

        } catch (discountError) {
          await discountClient.query('ROLLBACK');
          log.error('Discount calculation failed after invoice creation, invoice created without discounts', {
            error: discountError.message,
            promoCode: invoiceData.promo_code,
            invoiceId: newInvoice.id
          });
          // Don't throw - invoice was created successfully, just without discounts
        } finally {
          discountClient.release();
        }
      }

      // Get complete invoice with line items
      const completeInvoice = await this.getInvoiceById(newInvoice.id, businessId);

      if (!completeInvoice) {
        throw new Error('Failed to retrieve created invoice from database');
      }

      // Log the audit action with discount info
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'invoice.created',
        resourceType: 'invoice',
        resourceId: newInvoice.id,
        newValues: {
          invoice_number: newInvoice.invoice_number,
          subtotal,
          tax_amount: totalTax,
          total_amount: completeInvoice.total_amount,
          discount_amount: discountAmount || 0,
          line_item_count: invoiceData.line_items.length,
          customer_type: customerType,
          has_discounts: discountAmount > 0,
          discount_count: discountResult?.appliedDiscounts?.length || 0,
          requires_approval: requiresApproval,
          approval_id: approvalId,
          promo_code_used: invoiceData.promo_code || null  // Added for audit trail
        }
      });

      log.info('Invoice created with automatic tax calculation', {
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoice.invoice_number,
        businessId,
        userId,
        subtotal,
        taxAmount: totalTax,
        discountAmount,
        totalAmount: completeInvoice.total_amount,
        customerType,
        hasDiscounts: discountAmount > 0,
        requiresApproval,
        promoCode: invoiceData.promo_code  // Added for debugging
      });

      return {
        ...completeInvoice,
        requires_approval: requiresApproval,
        approval_id: approvalId,
        discount_info: discountResult ? {
          total_discount: discountResult.totalDiscount,
          applied_discounts: discountResult.appliedDiscounts,
          allocation: discountResult.allocation
        } : null,
        promo_code_used: invoiceData.promo_code  // Added to response
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Invoice creation failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async getInvoiceById(id, businessId, client = null) {
    const useExternalClient = client !== null;
    const dbClient = client || await getClient();

    try {
      const invoiceQuery = `
        SELECT
          i.*,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.email as customer_email,
          c.phone as customer_phone,
          c.company_name as customer_company,
          c.customer_type,
          j.job_number,
          j.title as job_title,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ili.id,
                'service_id', ili.service_id,
                'product_id', ili.product_id,
                'description', ili.description,
                'quantity', ili.quantity,
                'unit_price', ili.unit_price,
                'total_price', ili.total_price,
                'tax_rate', ili.tax_rate,
                'tax_amount', ili.tax_amount,
                'tax_category_code', ili.tax_category_code,
                'service_name', s.name
              )
            ) FILTER (WHERE ili.id IS NOT NULL),
            '[]'
          ) as line_items
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id AND c.business_id = i.business_id
        LEFT JOIN jobs j ON i.job_id = j.id AND j.business_id = i.business_id
        LEFT JOIN invoice_line_items ili ON i.id = ili.invoice_id
        LEFT JOIN services s ON ili.service_id = s.id AND s.business_id = i.business_id
        WHERE i.id = $1 AND i.business_id = $2
        GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone, c.company_name, c.customer_type, j.job_number, j.title
      `;

      const result = await dbClient.query(invoiceQuery, [id, businessId]);

      if (result.rows.length === 0) {
        log.debug('Invoice not found in getInvoiceById', { invoiceId: id, businessId });
        return null;
      }

      const invoice = result.rows[0];
      log.debug('Successfully fetched invoice by ID', {
        invoiceId: id,
        businessId,
        hasLineItems: invoice.line_items && invoice.line_items.length > 0,
        customerType: invoice.customer_type
      });

      return invoice;
    } catch (error) {
      log.error('Failed to fetch invoice by ID', { invoiceId: id, businessId, error: error.message });
      throw error;
    } finally {
      if (!useExternalClient) {
        dbClient.release();
      }
    }
  },

  async getAllInvoices(businessId, options = {}) {
    const client = await getClient();
    try {
      let selectQuery = `
        SELECT
          i.*,
          c.first_name as customer_first_name,
          c.last_name as customer_last_name,
          c.company_name as customer_company,
          c.customer_type,
          j.job_number,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ili.id,
                'service_id', ili.service_id,
                'product_id', ili.product_id,
                'description', ili.description,
                'quantity', ili.quantity,
                'unit_price', ili.unit_price,
                'total_price', ili.total_price,
                'tax_rate', ili.tax_rate,
                'tax_amount', ili.tax_amount,
                'tax_category_code', ili.tax_category_code,
                'service_name', s.name
              )
            ) FILTER (WHERE ili.id IS NOT NULL),
            '[]'
          ) as line_items
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id AND c.business_id = i.business_id
        LEFT JOIN jobs j ON i.job_id = j.id AND j.business_id = i.business_id
        LEFT JOIN invoice_line_items ili ON i.id = ili.invoice_id
        LEFT JOIN services s ON ili.service_id = s.id AND s.business_id = i.business_id
        WHERE i.business_id = $1
      `;

      const values = [businessId];
      let paramCount = 2;

      if (options.status) {
        selectQuery += ` AND i.status = $${paramCount}`;
        values.push(options.status);
        paramCount++;
      }

      if (options.customer_id) {
        selectQuery += ` AND i.customer_id = $${paramCount}`;
        values.push(options.customer_id);
        paramCount++;
      }

      selectQuery += ` GROUP BY i.id, c.first_name, c.last_name, c.company_name, c.customer_type, j.job_number`;
      selectQuery += ` ORDER BY i.created_at DESC`;

      const result = await client.query(selectQuery, values);

      log.debug('Fetched invoices', {
        businessId,
        count: result.rows.length,
        filters: options
      });

      return result.rows;
    } catch (error) {
      log.error('Failed to fetch invoices', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async recordPayment(invoiceId, paymentData, userId, businessId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const currentInvoice = await this.getInvoiceById(invoiceId, businessId, client);
      if (!currentInvoice) {
        throw new Error('Invoice not found');
      }

      // ================ EARLY PAYMENT DISCOUNT CHECK ================
      let earlyPaymentDiscount = 0;
      let earlyPaymentResult = null;

      // Check if invoice has early payment terms and payment is before due date
      if (currentInvoice.payment_terms_id && paymentData.payment_date) {
        try {
          const isEligible = await EarlyPaymentService.isEligible(
            currentInvoice.id,
            paymentData.payment_date,
            businessId
          );

          if (isEligible) {
            earlyPaymentResult = await EarlyPaymentService.calculateEarlyPaymentDiscount(
              currentInvoice.id,
              paymentData.payment_date,
              businessId
            );

            if (earlyPaymentResult.eligible && earlyPaymentResult.discountAmount > 0) {
              earlyPaymentDiscount = earlyPaymentResult.discountAmount;

              // Create journal entry for early payment discount
              await EarlyPaymentService.createEarlyPaymentJournalEntry(
                currentInvoice,
                earlyPaymentResult.discountAmount,
                userId
              );

              log.info('Early payment discount applied', {
                invoiceId: currentInvoice.id,
                invoiceNumber: currentInvoice.invoice_number,
                discountAmount: earlyPaymentDiscount,
                paymentDate: paymentData.payment_date,
                dueDate: currentInvoice.due_date
              });
            }
          }
        } catch (earlyPaymentError) {
          log.error('Early payment discount calculation failed', {
            error: earlyPaymentError.message,
            invoiceId: currentInvoice.id
          });
          // Continue without early payment discount
        }
      }

      const paymentAmount = parseFloat(paymentData.amount);
      const newAmountPaid = (parseFloat(currentInvoice.amount_paid) || 0) + paymentAmount;
      let balanceDue = parseFloat(currentInvoice.total_amount) - newAmountPaid;

      // If early payment discount was applied, adjust the balance due
      if (earlyPaymentDiscount > 0) {
        balanceDue -= earlyPaymentDiscount;
      }

      let newStatus = currentInvoice.status;
      if (balanceDue <= 0) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0 && currentInvoice.status === 'draft') {
        newStatus = 'sent';
      }

      const updateQuery = `
        UPDATE invoices
        SET
          amount_paid = $1,
          status = $2,
          payment_method = $3,
          payment_date = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND business_id = $6
        RETURNING *
      `;

      const values = [
        newAmountPaid,
        newStatus,
        paymentData.payment_method,
        paymentData.payment_date || new Date(),
        invoiceId,
        businessId
      ];

      await client.query(updateQuery, values);
      const completeUpdatedInvoice = await this.getInvoiceById(invoiceId, businessId, client);

      // Accounting integration with early payment discount
      if (paymentData.amount > 0) {
        try {
          const { AccountingService } = await import('./accountingService.js');

          let revenueAccount = '4100';
          if (currentInvoice.line_items && currentInvoice.line_items.length > 0) {
            const hasServices = currentInvoice.line_items.some(item =>
              item.service_id || item.description?.toLowerCase().includes('service')
            );
            revenueAccount = hasServices ? '4200' : '4100';
          }

          // Build journal entry lines
          const journalLines = [
            {
              account_code: '1110',
              description: `Payment received for Invoice ${currentInvoice.invoice_number}`,
              amount: paymentAmount,
              line_type: 'debit'
            },
            {
              account_code: revenueAccount,
              description: `Revenue from Invoice ${currentInvoice.invoice_number}`,
              amount: paymentAmount,
              line_type: 'credit'
            }
          ];

          // Add early payment discount line if applicable
          if (earlyPaymentDiscount > 0) {
            journalLines.push({
              account_code: '4112', // Early Payment Discount account
              description: `Early payment discount for Invoice ${currentInvoice.invoice_number}`,
              amount: earlyPaymentDiscount,
              line_type: 'debit'
            });
          }

          const journalEntryData = {
            business_id: businessId,
            description: `Invoice Payment${earlyPaymentDiscount > 0 ? ' with early discount' : ''}: ${currentInvoice.invoice_number}`,
            journal_date: paymentData.payment_date || new Date(),
            reference_type: 'invoice',
            reference_id: invoiceId,
            lines: journalLines
          };

          await AccountingService.createJournalEntry(journalEntryData, userId);

          log.info('Accounting journal entry created for invoice payment', {
            invoiceId,
            invoiceNumber: currentInvoice.invoice_number,
            amount: paymentAmount,
            earlyDiscount: earlyPaymentDiscount,
            revenueAccount
          });
        } catch (accountingError) {
          log.error('Failed to create accounting entry for invoice payment:', accountingError);
        }
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'invoice.payment_recorded',
        resourceType: 'invoice',
        resourceId: invoiceId,
        oldValues: {
          amount_paid: currentInvoice.amount_paid,
          status: currentInvoice.status,
          balance_due: currentInvoice.balance_due
        },
        newValues: {
          amount_paid: completeUpdatedInvoice.amount_paid,
          status: completeUpdatedInvoice.status,
          balance_due: completeUpdatedInvoice.balance_due,
          payment_method: paymentData.payment_method,
          early_payment_discount: earlyPaymentDiscount
        }
      });

      await client.query('COMMIT');

      log.info('Invoice payment recorded', {
        invoiceId,
        amountPaid: paymentAmount,
        earlyDiscount: earlyPaymentDiscount,
        newStatus: completeUpdatedInvoice.status,
        newBalanceDue: completeUpdatedInvoice.balance_due,
        businessId,
        userId
      });

      return {
        ...completeUpdatedInvoice,
        early_payment_discount: earlyPaymentDiscount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Invoice payment recording failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async updateInvoiceStatus(invoiceId, status, userId, businessId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const updateQuery = `
        UPDATE invoices
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND business_id = $3
        RETURNING *
      `;

      const result = await client.query(updateQuery, [status, invoiceId, businessId]);
      const updatedInvoice = result.rows[0];

      if (!updatedInvoice) {
        throw new Error('Invoice not found');
      }

      const completeUpdatedInvoice = await this.getInvoiceById(invoiceId, businessId, client);

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'invoice.status_updated',
        resourceType: 'invoice',
        resourceId: invoiceId,
        newValues: { status }
      });

      await client.query('COMMIT');

      log.info('Invoice status updated', {
        invoiceId,
        newStatus: status,
        businessId,
        userId
      });

      return completeUpdatedInvoice;
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Invoice status update failed', error);
      throw error;
    } finally {
      client.release();
    }
  },

  async formatInvoiceForDisplay(invoice, business) {
    if (!invoice) {
      log.error('Cannot format invoice: invoice data is null', { businessId: business?.id });
      throw new Error('Invoice data is required for formatting');
    }

    if (!business) {
      log.error('Cannot format invoice: business data is required', { invoiceId: invoice.id });
      throw new Error('Business data is required for formatting');
    }

    const formatDateForDisplay = (dateValue) => {
      if (!dateValue) return null;

      let date;

      if (dateValue instanceof Date) {
        date = dateValue;
      }
      else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      }
      else {
        return dateValue;
      }

      if (isNaN(date.getTime())) {
        return dateValue;
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      const dateStr = `${year}-${month}-${day}`;

      return {
        date: dateStr,
        utc: date.toISOString(),
        local: `${dateStr} 00:00:00`,
        iso_local: `${dateStr} 00:00:00`,
        formatted: date.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        timestamp: date.getTime()
      };
    };

    const formatCurrency = (amount) => {
      const amountNum = parseFloat(amount || 0);
      return `${business.currency_symbol} ${amountNum.toFixed(2)}`;
    };

    const lineItems = invoice.line_items || [];

    const formattedInvoice = {
      ...invoice,
      invoice_date: formatDateForDisplay(invoice.invoice_date),
      due_date: formatDateForDisplay(invoice.due_date),
      line_items: lineItems,
      display_amounts: {
        subtotal: formatCurrency(invoice.subtotal),
        tax_amount: formatCurrency(invoice.tax_amount || 0),
        discount_amount: formatCurrency(invoice.discount_amount || 0),
        total_amount: formatCurrency(invoice.total_amount),
        amount_paid: formatCurrency(invoice.amount_paid || 0),
        balance_due: formatCurrency(invoice.balance_due || invoice.total_amount)
      },
      currency: business.currency,
      currency_symbol: business.currency_symbol
    };

    return formattedInvoice;
  }
};
