import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { AccountingService } from './accountingService.js';
import { InventorySyncService } from './inventorySyncService.js';

export class PurchaseOrderService {
  /**
   * Generate unique PO number
   */
  static async generatePONumber(businessId) {
    const client = await getClient();

    try {
      // Get business prefix
      const businessResult = await client.query(
        'SELECT name FROM businesses WHERE id = $1',
        [businessId]
      );

      let prefix = 'PO';
      if (businessResult.rows.length > 0) {
        prefix = businessResult.rows[0].name.substring(0, 3).toUpperCase();
      }

      // Get next sequence
      const sequenceResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_sequence
         FROM purchase_orders
         WHERE business_id = $1 AND po_number ~ ('^' || $2 || '-[0-9]+$')`,
        [businessId, prefix]
      );

      const nextSequence = sequenceResult.rows[0].next_sequence;
      return `${prefix}-${String(nextSequence).padStart(6, '0')}`;
    } finally {
      client.release();
    }
  }

  /**
   * Create a new purchase order
   */
  static async createPurchaseOrder(businessId, orderData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify supplier belongs to business
      const supplierCheck = await client.query(
        'SELECT id FROM suppliers WHERE id = $1 AND business_id = $2',
        [orderData.supplier_id, businessId]
      );

      if (supplierCheck.rows.length === 0) {
        throw new Error('Supplier not found or access denied');
      }

      // Generate PO number
      const poNumber = await this.generatePONumber(businessId);

      // Calculate total amount
      const totalAmount = orderData.items.reduce((sum, item) => sum + parseFloat(item.total_cost), 0);

      // Insert purchase order
      const orderResult = await client.query(
        `INSERT INTO purchase_orders (
          business_id, supplier_id, po_number, order_date,
          expected_delivery_date, total_amount, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          businessId,
          orderData.supplier_id,
          poNumber,
          orderData.order_date,
          orderData.expected_delivery_date || null,
          totalAmount,
          orderData.notes || '',
          userId
        ]
      );

      const purchaseOrder = orderResult.rows[0];

      // Insert purchase order items
      for (const item of orderData.items) {
        await client.query(
          `INSERT INTO purchase_order_items (
            business_id, purchase_order_id, product_id, inventory_item_id,
            item_name, quantity, unit_cost, total_cost
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            businessId,
            purchaseOrder.id,
            item.product_id || null,
            item.inventory_item_id || null,
            item.item_name,
            item.quantity,
            item.unit_cost,
            item.total_cost
          ]
        );
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase_order.created',
        resourceType: 'purchase_order',
        resourceId: purchaseOrder.id,
        newValues: {
          po_number: purchaseOrder.po_number,
          supplier_id: purchaseOrder.supplier_id,
          total_amount: purchaseOrder.total_amount
        }
      });

      await client.query('COMMIT');

      // Get complete purchase order with items
      const completeOrder = await this.getPurchaseOrderById(businessId, purchaseOrder.id);
      return completeOrder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all purchase orders with optional filters
   */
  static async getPurchaseOrders(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT
          po.*,
          s.name as supplier_name,
          s.contact_person as supplier_contact,
          COUNT(poi.id) as item_count,
          SUM(poi.received_quantity) as total_received
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        WHERE po.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.supplier_id) {
        paramCount++;
        queryStr += ` AND po.supplier_id = $${paramCount}`;
        params.push(filters.supplier_id);
      }

      if (filters.status) {
        paramCount++;
        queryStr += ` AND po.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.payment_status) {
        paramCount++;
        queryStr += ` AND po.payment_status = $${paramCount}`;
        params.push(filters.payment_status);
      }

      if (filters.start_date && filters.end_date) {
        paramCount++;
        queryStr += ` AND po.order_date BETWEEN $${paramCount}`;
        params.push(filters.start_date);

        paramCount++;
        queryStr += ` AND $${paramCount}`;
        params.push(filters.end_date);
      }

      queryStr += ' GROUP BY po.id, s.name, s.contact_person ORDER BY po.order_date DESC';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      const result = await client.query(queryStr, params);
      return result.rows;
    } catch (error) {
      log.error('Purchase orders query failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get purchase order by ID with items
   */
  static async getPurchaseOrderById(businessId, orderId) {
    const client = await getClient();

    try {
      // Get order details
      const orderQuery = `
        SELECT
          po.*,
          s.name as supplier_name,
          s.contact_person as supplier_contact,
          s.email as supplier_email,
          s.phone as supplier_phone
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.business_id = $1 AND po.id = $2
      `;

      const orderResult = await client.query(orderQuery, [businessId, orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Purchase order not found or access denied');
      }

      const purchaseOrder = orderResult.rows[0];

      // Get order items
      const itemsQuery = `
        SELECT
          poi.*,
          p.name as product_name,
          ii.name as inventory_item_name
        FROM purchase_order_items poi
        LEFT JOIN products p ON poi.product_id = p.id
        LEFT JOIN inventory_items ii ON poi.inventory_item_id = ii.id
        WHERE poi.business_id = $1 AND poi.purchase_order_id = $2
        ORDER BY poi.created_at
      `;

      const itemsResult = await client.query(itemsQuery, [businessId, orderId]);
      purchaseOrder.items = itemsResult.rows;

      return purchaseOrder;
    } catch (error) {
      log.error('Purchase order query failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve purchase order
   */
  static async approvePurchaseOrder(businessId, orderId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if order exists and is in draft/sent status
      const orderCheck = await client.query(
        `SELECT status FROM purchase_orders
         WHERE id = $1 AND business_id = $2`,
        [orderId, businessId]
      );

      if (orderCheck.rows.length === 0) {
        throw new Error('Purchase order not found or access denied');
      }

      const currentStatus = orderCheck.rows[0].status;
      if (!['draft', 'sent'].includes(currentStatus)) {
        throw new Error(`Cannot approve order in ${currentStatus} status`);
      }

      // Update order status
      const result = await client.query(
        `UPDATE purchase_orders
         SET status = 'confirmed',
             approved_by = $1,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND business_id = $3
         RETURNING *`,
        [userId, orderId, businessId]
      );

      const updatedOrder = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase_order.approved',
        resourceType: 'purchase_order',
        resourceId: orderId,
        newValues: { status: 'confirmed' }
      });

      await client.query('COMMIT');

      // Get complete order with items
      return await this.getPurchaseOrderById(businessId, orderId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Receive purchase order — creates accounting entries, updates stock,
   * and records received_quantity for every line item.
   *
   * v23.0 Step C implementation.
   *
   * DESIGN DECISION (multi-item PO / journal_entries unique constraint):
   * journal_entries has a UNIQUE constraint on (business_id, reference_type,
   * reference_id). Calling createJournalEntryForInventoryPurchase() once per
   * line item — the report's original literal design — would reuse the PO's
   * own id as reference_id on every call, violating that constraint on the
   * second item of any multi-item PO (invisible with single-item POs, which
   * is why this wasn't caught earlier). Fixed by creating ONE CONSOLIDATED
   * journal entry for the whole receive event (Dr 1300 total / Cr 2100
   * total), while still writing a SEPARATE inventory_transactions row per
   * line item — each pointing at the shared journal_entry_id — so per-item
   * FIFO valuation and any future single-item reversal have a real,
   * individually-attributable amount to work from without reconstructing it.
   *
   * No payment_method resolution here (unlike recordInventoryPurchase()):
   * receiving always credits 2100 (Accounts Payable) — the goods-received-
   * not-yet-paid pattern. Actual payment happens later via payPurchaseOrder().
   *
   * SCOPE: full-receive-only (Step F/partial receiving deferred). Every line
   * item must have a non-null inventory_item_id; a PO with any untracked
   * (product_id-only or unlinked) line items is rejected outright, listing
   * which item(s) are the problem, rather than silently skipped or misposted.
   *
   * REVERSAL: not implemented here — no cancellation/reversal path exists yet
   * for a received PO anywhere in the codebase (see audit memory). Design for
   * when it's built: never void this consolidated entry to reverse a single
   * item — post a new, small corrective entry for just that item's amount and
   * decrement only that item's received_quantity/stock. The consolidated
   * entry stays valid for whichever items weren't reversed. Only a full-PO
   * reversal should void this entry (and post an equal-and-opposite one).
   */
  static async receivePurchaseOrder(businessId, orderId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const orderResult = await client.query(
        `SELECT * FROM purchase_orders WHERE id = $1 AND business_id = $2 FOR UPDATE`,
        [orderId, businessId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Purchase order not found or access denied');
      }

      const order = orderResult.rows[0];

      if (order.status !== 'confirmed') {
        throw new Error(`Cannot receive order in ${order.status} status`);
      }

      const itemsResult = await client.query(
        `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1 AND business_id = $2`,
        [orderId, businessId]
      );

      const items = itemsResult.rows;

      if (items.length === 0) {
        throw new Error('Purchase order has no line items to receive');
      }

      // Fail closed: every item must be inventory-tracked. List which ones
      // aren't rather than silently skipping or misposting them.
      const untracked = items.filter(item => !item.inventory_item_id);
      if (untracked.length > 0) {
        throw new Error(
          `Cannot receive: ${untracked.length} line item(s) have no inventory_item_id ` +
          `(untracked items are outside this receive implementation's scope): ` +
          untracked.map(i => i.item_name).join(', ')
        );
      }

      const inventoryItemIds = items.map(i => i.inventory_item_id);
      const inventoryItemsResult = await client.query(
        `SELECT id, name FROM inventory_items WHERE id = ANY($1::uuid[]) AND business_id = $2`,
        [inventoryItemIds, businessId]
      );
      const itemNameById = new Map(inventoryItemsResult.rows.map(r => [r.id, r.name]));

      for (const item of items) {
        if (!itemNameById.has(item.inventory_item_id)) {
          throw new Error(
            `Inventory item ${item.inventory_item_id} referenced by PO item ` +
            `'${item.item_name}' not found or access denied`
          );
        }
      }

      // ── Consolidated journal entry for the whole receive event ────────────
      const totalAmount = items.reduce((sum, item) => sum + parseFloat(item.total_cost), 0);

      const journalEntry = await AccountingService.createJournalEntry(
        {
          business_id: businessId,
          description: `Inventory Received: PO ${order.po_number} (${items.length} item${items.length > 1 ? 's' : ''})`,
          journal_date: new Date(),
          reference_type: 'purchase_order',
          reference_id: order.id,
          lines: [
            {
              account_code: '1300',
              description: `Inventory received for PO ${order.po_number}`,
              amount: totalAmount,
              line_type: 'debit'
            },
            {
              account_code: '2100',
              description: `Accounts payable for PO ${order.po_number}`,
              amount: totalAmount,
              line_type: 'credit'
            }
          ]
        },
        userId,
        client
      );

      // ── Per-item: stock update + inventory_transactions row + received_quantity ──
      const inventoryTransactions = [];

      for (const item of items) {
        const quantity = parseFloat(item.quantity);
        const unitCost = parseFloat(item.unit_cost);
        const itemName = itemNameById.get(item.inventory_item_id);

        await client.query(
          'SELECT update_inventory_stock($1, $2, $3) as new_stock',
          [item.inventory_item_id, quantity, 'purchase']
        );

        const txResult = await client.query(
          `INSERT INTO inventory_transactions (
            business_id, inventory_item_id, transaction_type,
            quantity, unit_cost, reference_type, reference_id,
            journal_entry_id, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *`,
          [
            businessId,
            item.inventory_item_id,
            'purchase',
            quantity,
            unitCost,
            'purchase_order',
            order.id,
            journalEntry.journal_entry.id,
            `PO Receipt: ${quantity} units of ${itemName} (PO ${order.po_number})`,
            userId
          ]
        );

        inventoryTransactions.push(txResult.rows[0]);

        // Full-receive-only: received_quantity = ordered quantity.
        await client.query(
          `UPDATE purchase_order_items SET received_quantity = $1 WHERE id = $2`,
          [item.quantity, item.id]
        );
      }

      for (const item of items) {
        try {
          await InventorySyncService.syncInventoryToProduct(item.inventory_item_id, userId);
        } catch (syncError) {
          log.warn(`Failed to sync inventory to product after PO receive:`, syncError);
        }
      }

      const result = await client.query(
        `UPDATE purchase_orders
         SET status = 'received', updated_at = NOW()
         WHERE id = $1 AND business_id = $2
         RETURNING *`,
        [orderId, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase_order.received',
        resourceType: 'purchase_order',
        resourceId: orderId,
        newValues: {
          status: 'received',
          items_received: items.length,
          total_amount: totalAmount,
          journal_entry_id: journalEntry.journal_entry.id
        }
      });

      await client.query('COMMIT');

      const completeOrder = await this.getPurchaseOrderById(businessId, orderId);
      return {
        ...completeOrder,
        journal_entry: journalEntry,
        inventory_transactions: inventoryTransactions
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Purchase order receive error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Pay purchase order (full or partial payment) - COMPLETELY CORRECTED VERSION
   */
  static async payPurchaseOrder(businessId, orderId, paymentData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Get order details
      const orderResult = await client.query(
        `SELECT * FROM purchase_orders
         WHERE id = $1 AND business_id = $2`,
        [orderId, businessId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Purchase order not found or access denied');
      }

      const order = orderResult.rows[0];

      // 2. Validate payment
      if (order.status !== 'received') {
        throw new Error('Can only pay received purchase orders');
      }

      const paymentAmount = parseFloat(paymentData.amount);
      if (paymentAmount <= 0) {
        throw new Error('Payment amount must be greater than 0');
      }

      const alreadyPaid = parseFloat(order.paid_amount || 0);
      const remainingBalance = parseFloat(order.total_amount) - alreadyPaid;

      if (paymentAmount > remainingBalance) {
        throw new Error(`Payment amount (${paymentAmount}) exceeds remaining balance (${remainingBalance})`);
      }

      // 3. Create vendor payment FIRST
      const paymentResult = await client.query(
        `INSERT INTO vendor_payments (
          business_id, purchase_order_id, supplier_id,
          payment_date, amount, payment_method, wallet_id,
          reference_number, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          businessId,
          orderId,
          order.supplier_id,
          paymentData.payment_date || new Date(),
          paymentAmount,
          paymentData.payment_method,
          paymentData.wallet_id,
          paymentData.reference_number,
          paymentData.notes || '',
          userId
        ]
      );

      const vendorPayment = paymentResult.rows[0];

      // 4. Create journal entry for payment (WITH VENDOR PAYMENT ID)
      const journalEntry = await this.createPaymentJournalEntry(
        businessId,
        order,
        paymentData,
        userId,
        vendorPayment.id  // Pass vendor payment ID here
      );

      // 5. Update vendor payment with journal entry ID
      await client.query(
        `UPDATE vendor_payments SET journal_entry_id = $1 WHERE id = $2`,
        [journalEntry.id, vendorPayment.id]
      );

      // 6. Update purchase order paid amount and payment status
      const newPaidAmount = alreadyPaid + paymentAmount;
      const newPaymentStatus = newPaidAmount >= parseFloat(order.total_amount)
        ? 'paid'
        : (newPaidAmount > 0 ? 'partial' : 'unpaid');

      await client.query(
        `UPDATE purchase_orders
         SET paid_amount = $1,
             payment_status = $2,
             payment_method = COALESCE($3, payment_method),
             last_payment_date = NOW(),
             updated_at = NOW()
         WHERE id = $4 AND business_id = $5`,
        [
          newPaidAmount,
          newPaymentStatus,
          paymentData.payment_method,
          orderId,
          businessId
        ]
      );

      // 7. Handle wallet payments - CORRECTED: NO manual wallet updates!
      if (paymentData.payment_method !== 'accounts_payable' && paymentData.wallet_id) {
        // ✅ The UPDATED trigger sync_wallet_balance_from_journal() will handle everything:
        // 1. Creating the wallet transaction when journal entry lines are inserted
        // 2. Updating the wallet balance automatically
        // 3. Setting the correct reference_type and reference_id from journal entry

        // We only need to verify the wallet exists
        const walletCheck = await client.query(
          `SELECT id, current_balance FROM money_wallets
           WHERE id = $1 AND business_id = $2`,
          [paymentData.wallet_id, businessId]
        );

        if (walletCheck.rows.length === 0) {
          throw new Error('Wallet not found or access denied');
        }

        // Optional logging for debugging
        log.info(`Payment will use wallet: ${paymentData.wallet_id}, Current balance: ${walletCheck.rows[0].current_balance}`);

        // ⚠️ NO manual wallet balance update!
        // ⚠️ NO manual wallet transaction creation!
        // The trigger will fire when journal entry lines are inserted in createPaymentJournalEntry()
        // It will create ONE wallet transaction with proper references
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'purchase_order.paid',
        resourceType: 'vendor_payment',
        resourceId: vendorPayment.id,
        newValues: {
          purchase_order_id: orderId,
          amount: paymentAmount,
          payment_method: paymentData.payment_method,
          paid_amount: newPaidAmount,
          payment_status: newPaymentStatus
        }
      });

      await client.query('COMMIT');

      return {
        vendor_payment: vendorPayment,
        journal_entry: journalEntry,
        order_update: {
          paid_amount: newPaidAmount,
          payment_status: newPaymentStatus,
          last_payment_date: new Date()
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Payment processing error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create journal entry for payment
   */
  static async createPaymentJournalEntry(businessId, order, paymentData, userId, vendorPaymentId) {
    const client = await getClient();

    try {
      // Get account IDs
      const apAccountResult = await client.query(
        `SELECT id FROM chart_of_accounts
         WHERE business_id = $1 AND account_code = '2100'`,
        [businessId]
      );

      if (apAccountResult.rows.length === 0) {
        throw new Error('Accounts Payable account (2100) not found');
      }
      const apAccountId = apAccountResult.rows[0].id;

      let creditAccountId;
      if (paymentData.payment_method === 'accounts_payable') {
        // If paying with AP, we're just transferring between AP accounts
        creditAccountId = apAccountId;
      } else {
        // Get the appropriate payment account
        let accountCode;
        switch (paymentData.payment_method) {
          case 'cash': accountCode = '1110'; break;
          case 'bank': accountCode = '1120'; break;
          case 'mobile_money': accountCode = '1130'; break;
          default: throw new Error(`Unsupported payment method: ${paymentData.payment_method}`);
        }

        const paymentAccountResult = await client.query(
          `SELECT id FROM chart_of_accounts
           WHERE business_id = $1 AND account_code = $2`,
          [businessId, accountCode]
        );

        if (paymentAccountResult.rows.length === 0) {
          throw new Error(`${paymentData.payment_method} account (${accountCode}) not found`);
        }
        creditAccountId = paymentAccountResult.rows[0].id;
      }

      // Create new journal entry with VENDOR PAYMENT ID as reference
      const journalResult = await client.query(
        `INSERT INTO journal_entries (
          business_id, journal_date, reference_number,
          reference_type, reference_id, description,
          total_amount, created_by, posted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          paymentData.payment_date || new Date(),
          `PAY-${order.po_number}-${Date.now()}`,
          'vendor_payment',
          vendorPaymentId, // Use VENDOR PAYMENT ID here
          `Payment for PO ${order.po_number} - ${paymentData.notes || ''}`,
          paymentData.amount,
          userId,
          new Date()
        ]
      );

      const journalEntry = journalResult.rows[0];

      // Create journal entry lines
      // Line 1: Debit Accounts Payable
      await client.query(
        `INSERT INTO journal_entry_lines (
          business_id, journal_entry_id, account_id,
          line_type, amount, description
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          businessId,
          journalEntry.id,
          apAccountId,
          'debit',
          paymentData.amount,
          `Reduction in AP for PO ${order.po_number}`
        ]
      );

      // Line 2: Credit Payment Account
      await client.query(
        `INSERT INTO journal_entry_lines (
          business_id, journal_entry_id, account_id,
          line_type, amount, description
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          businessId,
          journalEntry.id,
          creditAccountId,
          'credit',
          paymentData.amount,
          `Payment made for PO ${order.po_number} via ${paymentData.payment_method}`
        ]
      );

      return journalEntry;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get purchase order payments
   */
  static async getPurchaseOrderPayments(businessId, orderId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT vp.*,
                w.name as wallet_name,
                je.reference_number as journal_reference
         FROM vendor_payments vp
         LEFT JOIN money_wallets w ON vp.wallet_id = w.id
         LEFT JOIN journal_entries je ON vp.journal_entry_id = je.id
         WHERE vp.business_id = $1 AND vp.purchase_order_id = $2
         ORDER BY vp.payment_date DESC, vp.created_at DESC`,
        [businessId, orderId]
      );

      return result.rows;
    } catch (error) {
      log.error('Error fetching payments:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get accounts payable aging report
   */
  static async getApAgingReport(businessId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          s.id as supplier_id,
          s.name as supplier_name,
          s.email as supplier_email,
          s.phone as supplier_phone,
          COUNT(po.id) as po_count,
          SUM(po.total_amount - COALESCE(po.paid_amount, 0)) as total_balance,
          SUM(CASE
            WHEN CURRENT_DATE - po.order_date <= 30 THEN po.total_amount - COALESCE(po.paid_amount, 0)
            ELSE 0
          END) as current_balance,
          SUM(CASE
            WHEN CURRENT_DATE - po.order_date > 30 AND CURRENT_DATE - po.order_date <= 60
            THEN po.total_amount - COALESCE(po.paid_amount, 0)
            ELSE 0
          END) as balance_31_60_days,
          SUM(CASE
            WHEN CURRENT_DATE - po.order_date > 60 AND CURRENT_DATE - po.order_date <= 90
            THEN po.total_amount - COALESCE(po.paid_amount, 0)
            ELSE 0
          END) as balance_61_90_days,
          SUM(CASE
            WHEN CURRENT_DATE - po.order_date > 90
            THEN po.total_amount - COALESCE(po.paid_amount, 0)
            ELSE 0
          END) as balance_over_90_days
         FROM purchase_orders po
         JOIN suppliers s ON po.supplier_id = s.id
         WHERE po.business_id = $1
           AND po.status = 'received'
           AND (po.paid_amount IS NULL OR po.paid_amount < po.total_amount)
         GROUP BY s.id, s.name, s.email, s.phone
         ORDER BY total_balance DESC`,
        [businessId]
      );

      // Calculate totals
      const totals = {
        total_balance: 0,
        current_balance: 0,
        balance_31_60_days: 0,
        balance_61_90_days: 0,
        balance_over_90_days: 0,
        supplier_count: result.rows.length
      };

      result.rows.forEach(row => {
        totals.total_balance += parseFloat(row.total_balance) || 0;
        totals.current_balance += parseFloat(row.current_balance) || 0;
        totals.balance_31_60_days += parseFloat(row.balance_31_60_days) || 0;
        totals.balance_61_90_days += parseFloat(row.balance_61_90_days) || 0;
        totals.balance_over_90_days += parseFloat(row.balance_over_90_days) || 0;
      });

      return {
        suppliers: result.rows,
        totals: totals,
        generated_at: new Date()
      };
    } catch (error) {
      log.error('Error fetching AP aging report:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
