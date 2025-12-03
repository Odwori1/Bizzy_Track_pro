import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * GAAP-COMPLIANT ACCOUNTING SERVICE
 * Handles all double-entry accounting transactions
 * Ensures Debits = Credits for all journal entries
 */
export class AccountingService {
  /**
   * Create a journal entry with double-entry accounting
   * @param {Object} entryData - Journal entry data
   * @param {UUID} entryData.business_id - Business ID
   * @param {String} entryData.description - Description of transaction
   * @param {Date} entryData.transaction_date - Date of transaction
   * @param {String} entryData.reference_type - Type of reference (invoice, pos, expense, etc.)
   * @param {UUID} entryData.reference_id - ID of the reference document
   * @param {Array} entryData.lines - Array of journal entry lines
   * @param {UUID} userId - User creating the entry
   * @returns {Object} Created journal entry with lines
   */
  static async createJournalEntry(entryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Validate that debits equal credits
      const totalDebits = entryData.lines
        .filter(line => line.normal_balance === 'debit')
        .reduce((sum, line) => sum + parseFloat(line.amount), 0);

      const totalCredits = entryData.lines
        .filter(line => line.normal_balance === 'credit')
        .reduce((sum, line) => sum + parseFloat(line.amount), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`Debits (${totalDebits}) do not equal Credits (${totalCredits})`);
      }

      // Create journal entry
      const journalEntryResult = await client.query(
        `INSERT INTO journal_entries (
          business_id, description, transaction_date, reference_type, reference_id,
          total_amount, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          entryData.business_id,
          entryData.description,
          entryData.transaction_date || new Date(),
          entryData.reference_type,
          entryData.reference_id,
          totalDebits, // or totalCredits, they should be equal
          userId
        ]
      );

      const journalEntry = journalEntryResult.rows[0];

      // Create journal entry lines
      const journalEntryLines = [];
      for (const line of entryData.lines) {
        // Get account details
        const accountResult = await client.query(
          `SELECT id, account_code, account_name, account_type, normal_balance
           FROM chart_of_accounts 
           WHERE business_id = $1 AND account_code = $2`,
          [entryData.business_id, line.account_code]
        );

        if (accountResult.rows.length === 0) {
          throw new Error(`Account not found: ${line.account_code} for business ${entryData.business_id}`);
        }

        const account = accountResult.rows[0];

        // Validate normal balance
        if (account.normal_balance !== line.normal_balance) {
          throw new Error(
            `Account ${account.account_code} (${account.account_name}) has normal balance ` +
            `"${account.normal_balance}" but transaction specifies "${line.normal_balance}"`
          );
        }

        const lineResult = await client.query(
          `INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, account_code, account_name,
            description, amount, normal_balance, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            journalEntry.id,
            account.id,
            account.account_code,
            account.account_name,
            line.description || '',
            line.amount,
            line.normal_balance,
            userId
          ]
        );

        journalEntryLines.push(lineResult.rows[0]);

        // Update general ledger
        await client.query(
          `INSERT INTO general_ledger (
            business_id, account_id, journal_entry_line_id,
            transaction_date, description, debit_amount, credit_amount,
            balance, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            entryData.business_id,
            account.id,
            lineResult.rows[0].id,
            journalEntry.transaction_date,
            line.description || journalEntry.description,
            line.normal_balance === 'debit' ? line.amount : 0,
            line.normal_balance === 'credit' ? line.amount : 0,
            line.normal_balance === 'debit' ? line.amount : -line.amount,
            userId
          ]
        );
      }

      // Audit log
      await auditLogger.logAction({
        businessId: entryData.business_id,
        userId,
        action: 'accounting.journal_entry.created',
        resourceType: 'journal_entry',
        resourceId: journalEntry.id,
        newValues: {
          description: journalEntry.description,
          total_amount: journalEntry.total_amount,
          line_count: journalEntryLines.length
        }
      });

      await client.query('COMMIT');

      return {
        journal_entry: journalEntry,
        lines: journalEntryLines,
        summary: {
          total_debits: totalDebits,
          total_credits: totalCredits,
          is_balanced: Math.abs(totalDebits - totalCredits) < 0.01
        }
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Accounting service error creating journal entry:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create journal entry for POS sale with COGS
   * @param {Object} saleData - POS sale data
   * @param {UUID} saleData.business_id - Business ID
   * @param {UUID} saleData.pos_transaction_id - POS transaction ID
   * @param {Number} saleData.total_amount - Total sale amount
   * @param {Array} saleData.items - Array of sale items
   * @param {UUID} userId - User ID
   * @returns {Object} Created journal entries
   */
  static async createJournalEntryForPosSale(saleData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // 1. Get inventory items and calculate COGS
      let totalCogs = 0;
      const inventoryTransactions = [];

      for (const item of saleData.items) {
        if (item.inventory_item_id) {
          // Get cost from inventory item
          const inventoryResult = await client.query(
            `SELECT cost_price FROM inventory_items WHERE id = $1 AND business_id = $2`,
            [item.inventory_item_id, saleData.business_id]
          );

          if (inventoryResult.rows.length > 0) {
            const costPrice = parseFloat(inventoryResult.rows[0].cost_price);
            const itemCogs = costPrice * item.quantity;
            totalCogs += itemCogs;

            // Record inventory transaction for COGS
            const invTransactionResult = await client.query(
              `INSERT INTO inventory_transactions (
                business_id, inventory_item_id, transaction_type,
                quantity, unit_cost, reference_type, reference_id,
                notes, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              RETURNING id`,
              [
                saleData.business_id,
                item.inventory_item_id,
                'sale',
                item.quantity,
                costPrice,
                'pos_transaction',
                saleData.pos_transaction_id,
                `POS Sale: ${item.item_name}`,
                userId
              ]
            );

            inventoryTransactions.push(invTransactionResult.rows[0].id);
          }
        }
      }

      // 2. Create Sales Revenue journal entry
      const salesJournalEntry = await this.createJournalEntry({
        business_id: saleData.business_id,
        description: `POS Sale #${saleData.pos_transaction_id}`,
        transaction_date: new Date(),
        reference_type: 'pos_transaction',
        reference_id: saleData.pos_transaction_id,
        lines: [
          {
            account_code: '1110', // Cash (assuming cash sale)
            description: 'Cash received from POS sale',
            amount: saleData.total_amount,
            normal_balance: 'debit'
          },
          {
            account_code: '4100', // Sales Revenue
            description: 'Revenue from product sales',
            amount: saleData.total_amount,
            normal_balance: 'credit'
          }
        ]
      }, userId);

      // 3. Create COGS journal entry if there's inventory
      let cogsJournalEntry = null;
      if (totalCogs > 0) {
        cogsJournalEntry = await this.createJournalEntry({
          business_id: saleData.business_id,
          description: `COGS for POS Sale #${saleData.pos_transaction_id}`,
          transaction_date: new Date(),
          reference_type: 'pos_transaction',
          reference_id: saleData.pos_transaction_id,
          lines: [
            {
              account_code: '5100', // Cost of Goods Sold
              description: 'Cost of inventory sold',
              amount: totalCogs,
              normal_balance: 'debit'
            },
            {
              account_code: '1300', // Inventory
              description: 'Reduction in inventory from sales',
              amount: totalCogs,
              normal_balance: 'credit'
            }
          ]
        }, userId);

        // Link COGS journal entry to inventory transactions
        for (const invTransactionId of inventoryTransactions) {
          await client.query(
            `UPDATE inventory_transactions 
             SET cogs_entry_id = $1
             WHERE id = $2`,
            [cogsJournalEntry.journal_entry.id, invTransactionId]
          );
        }
      }

      await client.query('COMMIT');

      return {
        sales_entry: salesJournalEntry,
        cogs_entry: cogsJournalEntry,
        total_cogs: totalCogs,
        inventory_transactions: inventoryTransactions
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Accounting service error creating POS sale journal entry:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create journal entry for inventory purchase
   * @param {Object} purchaseData - Purchase data
   * @param {UUID} purchaseData.business_id - Business ID
   * @param {UUID} purchaseData.purchase_order_id - Purchase order ID
   * @param {Number} purchaseData.total_amount - Total purchase amount
   * @param {UUID} purchaseData.inventory_item_id - Inventory item ID
   * @param {Number} purchaseData.quantity - Quantity purchased
   * @param {Number} purchaseData.unit_cost - Unit cost
   * @param {String} purchaseData.payment_method - Payment method (cash, accounts_payable)
   * @param {UUID} userId - User ID
   * @returns {Object} Created journal entries
   */
  static async createJournalEntryForInventoryPurchase(purchaseData, userId) {
    const entryData = {
      business_id: purchaseData.business_id,
      description: `Inventory Purchase - PO# ${purchaseData.purchase_order_id}`,
      transaction_date: new Date(),
      reference_type: 'purchase_order',
      reference_id: purchaseData.purchase_order_id,
      lines: []
    };

    // Debit: Inventory (1300)
    entryData.lines.push({
      account_code: '1300',
      description: `Purchase of inventory: ${purchaseData.quantity} units`,
      amount: purchaseData.total_amount,
      normal_balance: 'debit'
    });

    // Credit: Payment method
    if (purchaseData.payment_method === 'cash') {
      entryData.lines.push({
        account_code: '1110', // Cash
        description: 'Cash payment for inventory purchase',
        amount: purchaseData.total_amount,
        normal_balance: 'credit'
      });
    } else if (purchaseData.payment_method === 'accounts_payable') {
      entryData.lines.push({
        account_code: '2100', // Accounts Payable
        description: 'Credit purchase - to be paid later',
        amount: purchaseData.total_amount,
        normal_balance: 'credit'
      });
    } else {
      throw new Error(`Unsupported payment method: ${purchaseData.payment_method}`);
    }

    const journalEntry = await this.createJournalEntry(entryData, userId);

    // Also record inventory transaction
    const client = await getClient();
    try {
      await client.query(
        `INSERT INTO inventory_transactions (
          business_id, inventory_item_id, transaction_type,
          quantity, unit_cost, reference_type, reference_id,
          journal_entry_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          purchaseData.business_id,
          purchaseData.inventory_item_id,
          'purchase',
          purchaseData.quantity,
          purchaseData.unit_cost,
          'purchase_order',
          purchaseData.purchase_order_id,
          journalEntry.journal_entry.id,
          `Inventory purchase - ${purchaseData.quantity} units`,
          userId
        ]
      );
    } finally {
      client.release();
    }

    return journalEntry;
  }

  /**
   * Get trial balance for a business
   * @param {UUID} businessId - Business ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} Trial balance data
   */
  static async getTrialBalance(businessId, startDate, endDate) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT 
          coa.account_code,
          coa.account_name,
          coa.account_type,
          coa.normal_balance,
          COALESCE(SUM(CASE WHEN jel.normal_balance = 'debit' THEN jel.amount ELSE 0 END), 0) as total_debits,
          COALESCE(SUM(CASE WHEN jel.normal_balance = 'credit' THEN jel.amount ELSE 0 END), 0) as total_credits,
          CASE coa.normal_balance
            WHEN 'debit' THEN 
              COALESCE(SUM(CASE WHEN jel.normal_balance = 'debit' THEN jel.amount ELSE -jel.amount END), 0)
            WHEN 'credit' THEN
              COALESCE(SUM(CASE WHEN jel.normal_balance = 'credit' THEN jel.amount ELSE -jel.amount END), 0)
          END as balance
         FROM chart_of_accounts coa
         LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
         LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE coa.business_id = $1
           AND ($2::timestamp IS NULL OR je.transaction_date >= $2)
           AND ($3::timestamp IS NULL OR je.transaction_date <= $3)
         GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.normal_balance
         ORDER BY coa.account_code`,
        [businessId, startDate, endDate]
      );

      const totalDebits = result.rows.reduce((sum, row) => sum + parseFloat(row.total_debits), 0);
      const totalCredits = result.rows.reduce((sum, row) => sum + parseFloat(row.total_credits), 0);

      return {
        accounts: result.rows,
        summary: {
          total_debits: totalDebits,
          total_credits: totalCredits,
          is_balanced: Math.abs(totalDebits - totalCredits) < 0.01
        },
        period: {
          start_date: startDate,
          end_date: endDate
        }
      };

    } catch (error) {
      log.error('Accounting service error getting trial balance:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get general ledger for an account
   * @param {UUID} businessId - Business ID
   * @param {String} accountCode - Account code
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Object} General ledger data
   */
  static async getGeneralLedger(businessId, accountCode, startDate, endDate) {
    const client = await getClient();

    try {
      // Get account details
      const accountResult = await client.query(
        `SELECT * FROM chart_of_accounts 
         WHERE business_id = $1 AND account_code = $2`,
        [businessId, accountCode]
      );

      if (accountResult.rows.length === 0) {
        throw new Error(`Account not found: ${accountCode} for business ${businessId}`);
      }

      const account = accountResult.rows[0];

      // Get ledger entries
      const ledgerResult = await client.query(
        `SELECT 
          gl.*,
          je.description as journal_description,
          je.reference_type,
          je.reference_id,
          je.transaction_date
         FROM general_ledger gl
         JOIN journal_entry_lines jel ON gl.journal_entry_line_id = jel.id
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE gl.business_id = $1 AND gl.account_id = $2
           AND ($3::timestamp IS NULL OR gl.transaction_date >= $3)
           AND ($4::timestamp IS NULL OR gl.transaction_date <= $4)
         ORDER BY gl.transaction_date, gl.created_at`,
        [businessId, account.id, startDate, endDate]
      );

      // Calculate running balance
      let runningBalance = 0;
      const ledgerWithBalance = ledgerResult.rows.map(entry => {
        if (account.normal_balance === 'debit') {
          runningBalance += parseFloat(entry.debit_amount) - parseFloat(entry.credit_amount);
        } else {
          runningBalance += parseFloat(entry.credit_amount) - parseFloat(entry.debit_amount);
        }

        return {
          ...entry,
          running_balance: runningBalance
        };
      });

      return {
        account: account,
        ledger_entries: ledgerWithBalance,
        period: {
          start_date: startDate,
          end_date: endDate
        },
        ending_balance: runningBalance
      };

    } catch (error) {
      log.error('Accounting service error getting general ledger:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
