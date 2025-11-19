import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { auditLogger } from '../utils/auditLogger.js';

export const invoiceService = {
  async createInvoice(invoiceData, userId, businessId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Generate invoice number
      const invoiceNumberQuery = `
        SELECT COUNT(*) as invoice_count
        FROM invoices
        WHERE business_id = $1
      `;
      const countResult = await client.query(invoiceNumberQuery, [businessId]);
      const invoiceNumber = `INV-${(parseInt(countResult.rows[0].invoice_count) + 1).toString().padStart(4, '0')}`;

      // Calculate totals from line items
      let subtotal = 0;
      let totalTax = 0;

      invoiceData.line_items.forEach(item => {
        const itemTotal = item.quantity * item.unit_price;
        subtotal += itemTotal;
        const itemTax = itemTotal * (item.tax_rate || 0) / 100;
        totalTax += itemTax;
      });

      const totalAmount = subtotal + totalTax - (invoiceData.discount_amount || 0);

      // Create invoice
      const createInvoiceQuery = `
        INSERT INTO invoices (
          business_id, invoice_number, invoice_date, due_date,
          job_id, customer_id, subtotal, tax_amount, tax_rate,
          discount_amount, total_amount, notes, terms, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const invoiceValues = [
        businessId,
        invoiceNumber,
        invoiceData.invoice_date || new Date(),
        invoiceData.due_date,
        invoiceData.job_id || null,
        invoiceData.customer_id,
        subtotal,
        totalTax,
        invoiceData.tax_rate || 0,
        invoiceData.discount_amount || 0,
        totalAmount,
        invoiceData.notes || '',
        invoiceData.terms || '',
        userId
      ];

      const invoiceResult = await client.query(createInvoiceQuery, invoiceValues);
      const newInvoice = invoiceResult.rows[0];

      // Create line items - ONLY insert the basic fields, database computes total_price and tax_amount
      for (const item of invoiceData.line_items) {
        const lineItemQuery = `
          INSERT INTO invoice_line_items (
            invoice_id, service_id, description, quantity, unit_price, tax_rate
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await client.query(lineItemQuery, [
          newInvoice.id,
          item.service_id || null,
          item.description,
          item.quantity,
          item.unit_price,
          item.tax_rate || 0
        ]);
      }

      // Get complete invoice with line items using the same client
      const completeInvoice = await this.getInvoiceById(newInvoice.id, businessId, client);

      if (!completeInvoice) {
        throw new Error('Failed to retrieve created invoice from database');
      }

      // Log the audit action
      await auditLogger.logAction({
        businessId,
        userId,
        action: 'invoice.created',
        resourceType: 'invoice',
        resourceId: newInvoice.id,
        newValues: completeInvoice
      });

      await client.query('COMMIT');

      log.info('Invoice created successfully', {
        invoiceId: newInvoice.id,
        invoiceNumber: newInvoice.invoice_number,
        businessId,
        userId,
        totalAmount: newInvoice.total_amount
      });

      return completeInvoice;

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
          j.job_number,
          j.title as job_title,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ili.id,
                'service_id', ili.service_id,
                'description', ili.description,
                'quantity', ili.quantity,
                'unit_price', ili.unit_price,
                'total_price', ili.total_price,
                'tax_rate', ili.tax_rate,
                'tax_amount', ili.tax_amount,
                'service_name', s.name
              )
            ) FILTER (WHERE ili.id IS NOT NULL), '[]'
          ) as line_items
        FROM invoices i
        LEFT JOIN customers c ON i.customer_id = c.id AND c.business_id = i.business_id
        LEFT JOIN jobs j ON i.job_id = j.id AND j.business_id = i.business_id
        LEFT JOIN invoice_line_items ili ON i.id = ili.invoice_id
        LEFT JOIN services s ON ili.service_id = s.id AND s.business_id = i.business_id
        WHERE i.id = $1 AND i.business_id = $2
        GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone, c.company_name, j.job_number, j.title
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
        hasLineItems: invoice.line_items && invoice.line_items.length > 0
      });
      return invoice;

    } catch (error) {
      log.error('Failed to fetch invoice by ID', { invoiceId: id, businessId, error: error.message });
      throw error;
    } finally {
      // Only release the client if we created it internally
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
          j.job_number,
          COALESCE(
            json_agg(
              json_build_object(
                'id', ili.id,
                'service_id', ili.service_id,
                'description', ili.description,
                'quantity', ili.quantity,
                'unit_price', ili.unit_price,
                'total_price', ili.total_price,
                'tax_rate', ili.tax_rate,
                'tax_amount', ili.tax_amount,
                'service_name', s.name
              )
            ) FILTER (WHERE ili.id IS NOT NULL), '[]'
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

      // Filter by status if provided
      if (options.status) {
        selectQuery += ` AND i.status = $${paramCount}`;
        values.push(options.status);
        paramCount++;
      }

      // Filter by customer if provided
      if (options.customer_id) {
        selectQuery += ` AND i.customer_id = $${paramCount}`;
        values.push(options.customer_id);
        paramCount++;
      }

      selectQuery += ` GROUP BY i.id, c.first_name, c.last_name, c.company_name, j.job_number`;
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

      // Get current invoice using transaction client
      const currentInvoice = await this.getInvoiceById(invoiceId, businessId, client);
      if (!currentInvoice) {
        throw new Error('Invoice not found');
      }

      // Calculate new amounts
      const newAmountPaid = (parseFloat(currentInvoice.amount_paid) || 0) + parseFloat(paymentData.amount);
      const balanceDue = parseFloat(currentInvoice.total_amount) - newAmountPaid;

      // FIXED: Use valid status values that match database constraint
      let newStatus = currentInvoice.status;
      if (balanceDue <= 0) {
        newStatus = 'paid';
      } else if (newAmountPaid > 0 && currentInvoice.status === 'draft') {
        newStatus = 'sent'; // Move from draft to sent when first payment is made
      }
      // If already sent and partial payment, keep as 'sent'

      // Only update amount_paid and status, let database compute balance_due
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

      const result = await client.query(updateQuery, values);
      const updatedInvoice = result.rows[0];

      // Get complete updated invoice for audit (this will have the computed balance_due)
      const completeUpdatedInvoice = await this.getInvoiceById(invoiceId, businessId, client);

      // Log the audit action
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
          payment_method: paymentData.payment_method
        }
      });

      await client.query('COMMIT');

      log.info('Invoice payment recorded', {
        invoiceId,
        amountPaid: paymentData.amount,
        newStatus: completeUpdatedInvoice.status,
        newBalanceDue: completeUpdatedInvoice.balance_due,
        businessId,
        userId
      });

      return completeUpdatedInvoice;

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

      // Get complete updated invoice
      const completeUpdatedInvoice = await this.getInvoiceById(invoiceId, businessId, client);

      // Log the audit action
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

    // Format currency based on business settings
    const formatCurrency = (amount) => {
      const amountNum = parseFloat(amount || 0);
      return `${business.currency_symbol} ${amountNum.toFixed(2)}`;
    };

    // Ensure line_items is always an array
    const lineItems = invoice.line_items || [];

    return {
      ...invoice,
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
  }
};
