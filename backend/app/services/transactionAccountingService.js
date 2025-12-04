import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * TRANSACTION ACCOUNTING SERVICE
 * GAAP-compliant accounting for all POS transaction types
 */
export class TransactionAccountingService {
  /**
   * Account codes for different transaction types
   */
  static ACCOUNT_CODES = {
    // Assets
    CASH: '1110',
    ACCOUNTS_RECEIVABLE: '1200',
    INVENTORY: '1300',

    // Revenue
    SALES_REVENUE: '4100',      // Product sales
    SERVICE_REVENUE: '4200',    // Services & equipment hire

    // Expenses
    COGS: '5100',               // Cost of Goods Sold
    COST_OF_SERVICES: '5110'
  };

  /**
   * Create accounting entries for any POS transaction type
   */
  static async createAccountingEntriesForTransaction(transactionData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const analysis = await this.analyzeTransactionItems(
        transactionData.business_id,
        transactionData.items
      );

      const results = {
        sales_revenue_entry: null,
        cogs_entry: null,
        analysis: analysis
      };

      // STEP 1: SALES REVENUE ENTRY
      if (analysis.total_revenue > 0) {
        results.sales_revenue_entry = await this.createSalesRevenueEntry(
          transactionData,
          analysis,
          userId
        );
      }

      // STEP 2: COGS ENTRY
      if (analysis.total_cogs > 0) {
        results.cogs_entry = await this.createCogsEntry(
          transactionData,
          analysis,
          userId
        );
      }

      // STEP 3: INVENTORY TRANSACTIONS
      if (analysis.inventory_items.length > 0) {
        results.inventory_transactions = await this.recordInventoryTransactions(
          transactionData,
          analysis.inventory_items,
          userId
        );
      }

      await client.query('COMMIT');

      log.info('Transaction accounting completed:', {
        transaction_id: transactionData.pos_transaction_id,
        revenue: analysis.total_revenue,
        cogs: analysis.total_cogs,
        gross_profit: analysis.total_revenue - analysis.total_cogs,
        item_types: analysis.summary_by_type
      });

      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Transaction accounting failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Analyze transaction items
   */
  static async analyzeTransactionItems(businessId, items) {
    const analysis = {
      total_revenue: 0,
      total_cogs: 0,
      inventory_items: [],
      service_items: [],
      equipment_items: [],
      summary_by_type: {}
    };

    for (const item of items) {
      const itemRevenue = item.total_price || (item.unit_price * item.quantity);
      analysis.total_revenue += itemRevenue;

      if (!analysis.summary_by_type[item.item_type]) {
        analysis.summary_by_type[item.item_type] = {
          count: 0,
          revenue: 0,
          cogs: 0
        };
      }

      analysis.summary_by_type[item.item_type].count++;
      analysis.summary_by_type[item.item_type].revenue += itemRevenue;

      switch (item.item_type) {
        case 'product':
        case 'inventory_item':
          const itemCogs = await this.calculateItemCogs(businessId, item);
          if (itemCogs > 0) {
            analysis.total_cogs += itemCogs;
            analysis.summary_by_type[item.item_type].cogs += itemCogs;

            analysis.inventory_items.push({
              ...item,
              cogs: itemCogs
            });
          }
          break;

        case 'service':
          analysis.service_items.push(item);
          break;

        case 'equipment_hire':
          analysis.equipment_items.push(item);
          break;

        default:
          log.warn(`Unknown item type: ${item.item_type}`);
      }
    }

    return analysis;
  }

  /**
   * Calculate COGS
   */
  static async calculateItemCogs(businessId, item) {
    const client = await getClient();

    try {
      if (item.inventory_item_id) {
        const result = await client.query(
          `SELECT cost_price FROM inventory_items
           WHERE id = $1 AND business_id = $2`,
          [item.inventory_item_id, businessId]
        );

        if (result.rows.length > 0) {
          return parseFloat(result.rows[0].cost_price) * item.quantity;
        }
      }

      if (item.product_id) {
        const result = await client.query(
          `SELECT ii.cost_price
           FROM products p
           LEFT JOIN inventory_items ii ON p.inventory_item_id = ii.id
           WHERE p.id = $1 AND p.business_id = $2`,
          [item.product_id, businessId]
        );

        if (result.rows.length > 0 && result.rows[0].cost_price) {
          return parseFloat(result.rows[0].cost_price) * item.quantity;
        }
      }

      return 0;

    } finally {
      client.release();
    }
  }

  /**
   * Create sales revenue journal entry
   */
  static async createSalesRevenueEntry(transactionData, analysis, userId) {
    const { AccountingService } = await import('./accountingService.js');

    const revenueLines = [];

    const productRevenue = analysis.summary_by_type.product?.revenue || 0;
    const inventoryRevenue = analysis.summary_by_type.inventory_item?.revenue || 0;
    const totalProductRevenue = productRevenue + inventoryRevenue;

    if (totalProductRevenue > 0) {
      revenueLines.push({
        account_code: this.ACCOUNT_CODES.SALES_REVENUE,
        description: 'Revenue from product sales',
        amount: totalProductRevenue,
        line_type: 'credit'
      });
    }

    const serviceRevenue = analysis.summary_by_type.service?.revenue || 0;
    const equipmentRevenue = analysis.summary_by_type.equipment_hire?.revenue || 0;
    const totalServiceRevenue = serviceRevenue + equipmentRevenue;

    if (totalServiceRevenue > 0) {
      revenueLines.push({
        account_code: this.ACCOUNT_CODES.SERVICE_REVENUE,
        description: 'Revenue from services & equipment hire',
        amount: totalServiceRevenue,
        line_type: 'credit'
      });
    }

    const debitLine = {
      account_code: transactionData.payment_method === 'cash'
        ? this.ACCOUNT_CODES.CASH
        : this.ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
      description: `Receivable from ${transactionData.payment_method} sale`,
      amount: analysis.total_revenue,
      line_type: 'debit'
    };

    const entryData = {
      business_id: transactionData.business_id,
      description: `POS Sale #${transactionData.pos_transaction_id}`,
      transaction_date: new Date(),
      reference_type: 'pos_transaction',
      reference_id: transactionData.pos_transaction_id,
      lines: [debitLine, ...revenueLines]
    };

    return await AccountingService.createJournalEntry(entryData, userId);
  }

  /**
   * Create COGS entry
   */
  static async createCogsEntry(transactionData, analysis, userId) {
    const { AccountingService } = await import('./accountingService.js');

    if (analysis.total_cogs <= 0) return null;

    const entryData = {
      business_id: transactionData.business_id,
      description: `COGS for POS Sale #${transactionData.pos_transaction_id}`,
      transaction_date: new Date(),
      reference_type: 'pos_transaction',
      reference_id: transactionData.pos_transaction_id,
      lines: [
        {
          account_code: this.ACCOUNT_CODES.COGS,
          description: 'Cost of inventory sold',
          amount: analysis.total_cogs,
          line_type: 'debit'
        },
        {
          account_code: this.ACCOUNT_CODES.INVENTORY,
          description: 'Reduction in inventory from sales',
          amount: analysis.total_cogs,
          line_type: 'credit'
        }
      ]
    };

    return await AccountingService.createJournalEntry(entryData, userId);
  }

  /**
   * Record inventory transactions
   */
  static async recordInventoryTransactions(transactionData, inventoryItems, userId) {
    const client = await getClient();
    const transactions = [];

    for (const item of inventoryItems) {
      const result = await client.query(
        `INSERT INTO inventory_transactions (
          business_id, inventory_item_id, product_id, transaction_type,
          quantity, unit_cost, total_cost, reference_type, reference_id,
          notes, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [
          transactionData.business_id,
          item.inventory_item_id,
          item.product_id,
          'sale',
          item.quantity,
          item.cogs / item.quantity,
          item.cogs,
          'pos_transaction',
          transactionData.pos_transaction_id,
          `POS Sale: ${item.item_name} (${item.quantity} units)`,
          userId
        ]
      );

      transactions.push(result.rows[0]);
    }

    return transactions;
  }

  /**
   * Get summary
   */
  static async getTransactionAccountingSummary(businessId, transactionId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          (SELECT json_agg(je.*)
           FROM journal_entries je
           WHERE je.business_id = $1
             AND je.reference_type = 'pos_transaction'
             AND je.reference_id = $2
             AND EXISTS (
               SELECT 1 FROM journal_entry_lines jel
               WHERE jel.journal_entry_id = je.id
                 AND jel.line_type = 'credit'
                 AND jel.account_code IN ('4100','4200')
             )) as revenue_entries,

          (SELECT json_agg(je.*)
           FROM journal_entries je
           WHERE je.business_id = $1
             AND je.reference_type = 'pos_transaction'
             AND je.reference_id = $2
             AND EXISTS (
               SELECT 1 FROM journal_entry_lines jel
               WHERE jel.journal_entry_id = je.id
                 AND jel.account_code = '5100'
             )) as cogs_entries,

          (SELECT json_agg(it.*)
           FROM inventory_transactions it
           WHERE it.business_id = $1
             AND it.reference_type = 'pos_transaction'
             AND it.reference_id = $2) as inventory_transactions,

          (SELECT COALESCE(SUM(jel.amount),0)
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
           WHERE je.business_id = $1
             AND je.reference_type='pos_transaction'
             AND je.reference_id=$2
             AND jel.line_type='credit'
             AND jel.account_code IN ('4100','4200')) as total_revenue,

          (SELECT COALESCE(SUM(jel.amount),0)
           FROM journal_entry_lines jel
           JOIN journal_entries je ON jel.journal_entry_id = je.id
           WHERE je.business_id=$1
             AND je.reference_type='pos_transaction'
             AND je.reference_id=$2
             AND jel.account_code='5100') as total_cogs
        `,
        [businessId, transactionId]
      );

      const summary = result.rows[0];
      summary.gross_profit = summary.total_revenue - summary.total_cogs;
      summary.gross_margin = summary.total_revenue > 0
        ? (summary.gross_profit / summary.total_revenue) * 100
        : 0;

      return summary;

    } catch (error) {
      log.error('Error getting transaction accounting summary:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

