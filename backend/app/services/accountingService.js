// File: backend/app/services/accountingService.js
import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

/**
 * GAAP-COMPLIANT ACCOUNTING SERVICE
 * FIXED: Schema mismatch - removed created_by from journal_entry_lines
 */
export class AccountingService {
  /**
   * Generate reference number for journal entries
   */
  static generateReferenceNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `JE-${timestamp}-${random}`;
  }

  /**
   * Generate UUID for manual entries
   */
  static generateManualEntryUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Create a journal entry with double-entry accounting
   * FIXED: Removed created_by from journal_entry_lines insert
   */
  static async createJournalEntry(entryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Validate that debits equal credits
      const totalDebits = entryData.lines
        .filter(line => line.line_type === 'debit')
        .reduce((sum, line) => sum + parseFloat(line.amount), 0);

      const totalCredits = entryData.lines
        .filter(line => line.line_type === 'credit')
        .reduce((sum, line) => sum + parseFloat(line.amount), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`Debits (${totalDebits}) do not equal Credits (${totalCredits}) - GAAP violation`);
      }

      // Generate reference number
      const referenceNumber = this.generateReferenceNumber();

      // Handle reference_id for manual entries
      let referenceId = entryData.reference_id;
      
      if (!referenceId && entryData.reference_type === 'manual_entry') {
        referenceId = this.generateManualEntryUUID();
      }

      // Create journal entry
      const journalEntryResult = await client.query(
        `INSERT INTO journal_entries (
          business_id, description, journal_date, reference_number,
          reference_type, reference_id, total_amount, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          entryData.business_id,
          entryData.description,
          entryData.journal_date || new Date(),
          referenceNumber,
          entryData.reference_type,
          referenceId,
          totalDebits,
          'posted',
          userId
        ]
      );

      const journalEntry = journalEntryResult.rows[0];

      // Create journal entry lines
      const journalEntryLines = [];
      for (const line of entryData.lines) {
        // Get account details
        const accountResult = await client.query(
          `SELECT id, account_code, account_name, account_type
           FROM chart_of_accounts
           WHERE business_id = $1 AND account_code = $2`,
          [entryData.business_id, line.account_code]
        );

        if (accountResult.rows.length === 0) {
          throw new Error(`Account not found: ${line.account_code} for business ${entryData.business_id}`);
        }

        const account = accountResult.rows[0];

        // FIXED: journal_entry_lines doesn't have created_by column
        const lineResult = await client.query(
          `INSERT INTO journal_entry_lines (
            journal_entry_id, business_id, account_id,
            line_type, amount, description
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            journalEntry.id,
            entryData.business_id,
            account.id,
            line.line_type,
            line.amount,
            line.description || ''
          ]
        );

        journalEntryLines.push(lineResult.rows[0]);
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
          line_count: journalEntryLines.length,
          reference_number: journalEntry.reference_number
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
   * Get trial balance for a business
   */
  static async getTrialBalance(businessId, startDate, endDate) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          coa.account_code,
          coa.account_name,
          coa.account_type,
          COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0) as total_debits,
          COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0) as total_credits
         FROM chart_of_accounts coa
         LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
         LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE coa.business_id = $1
           AND coa.is_active = true
           AND ($2::timestamp IS NULL OR je.journal_date >= $2::date)
           AND ($3::timestamp IS NULL OR je.journal_date <= $3::date)
         GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
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
          jel.id as journal_entry_line_id,
          jel.amount,
          jel.line_type,
          jel.description as line_description,
          jel.created_at,
          je.description as journal_description,
          je.reference_type,
          je.reference_id,
          je.journal_date,
          je.reference_number
         FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE jel.business_id = $1
           AND jel.account_id = $2
           AND je.voided_at IS NULL
           AND ($3::timestamp IS NULL OR je.journal_date >= $3::date)
           AND ($4::timestamp IS NULL OR je.journal_date <= $4::date)
         ORDER BY je.journal_date, jel.created_at`,
        [businessId, account.id, startDate, endDate]
      );

      // Calculate running balance
      let runningBalance = 0;
      const ledgerWithBalance = ledgerResult.rows.map(entry => {
        const isDebitAccount = ['asset', 'expense'].includes(account.account_type);

        if (isDebitAccount) {
          runningBalance += entry.line_type === 'debit' ? parseFloat(entry.amount) : -parseFloat(entry.amount);
        } else {
          runningBalance += entry.line_type === 'credit' ? parseFloat(entry.amount) : -parseFloat(entry.amount);
        }

        return {
          ...entry,
          running_balance: runningBalance,
          debit_amount: entry.line_type === 'debit' ? entry.amount : 0,
          credit_amount: entry.line_type === 'credit' ? entry.amount : 0
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

  /**
   * Get journal entries with lines
   */
  static async getJournalEntries(businessId, filters = {}) {
    const client = await getClient();

    try {
      // Build query for journal entries
      let query = `
        SELECT je.*, u.full_name as created_by_name
        FROM journal_entries je
        LEFT JOIN users u ON je.created_by = u.id
        WHERE je.business_id = $1
      `;

      const params = [businessId];
      let paramCount = 1;

      if (filters.start_date) {
        paramCount++;
        query += ` AND je.journal_date >= $${paramCount}::date`;
        params.push(new Date(filters.start_date));
      }

      if (filters.end_date) {
        paramCount++;
        query += ` AND je.journal_date <= $${paramCount}::date`;
        params.push(new Date(filters.end_date));
      }

      if (filters.reference_type) {
        paramCount++;
        query += ` AND je.reference_type = $${paramCount}`;
        params.push(filters.reference_type);
      }

      if (filters.status) {
        paramCount++;
        query += ` AND je.status = $${paramCount}`;
        params.push(filters.status);
      }

      // Get total count
      const countQuery = query.replace(
        'SELECT je.*, u.full_name as created_by_name',
        'SELECT COUNT(*) as total'
      );

      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Add ordering and pagination
      query += ' ORDER BY je.journal_date DESC, je.created_at DESC';

      const limit = filters.limit || 50;
      const page = filters.page || 1;
      const offset = (page - 1) * limit;

      query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit);
      params.push(offset);

      // Get entries
      const entriesResult = await client.query(query, params);

      // Get lines for each entry
      const entriesWithLines = await Promise.all(
        entriesResult.rows.map(async (entry) => {
          const linesResult = await client.query(
            `SELECT
              jel.*,
              coa.account_code,
              coa.account_name,
              coa.account_type
             FROM journal_entry_lines jel
             JOIN chart_of_accounts coa ON jel.account_id = coa.id
             WHERE jel.journal_entry_id = $1 AND jel.business_id = $2
             ORDER BY
               CASE WHEN jel.line_type = 'debit' THEN 0 ELSE 1 END,
               coa.account_code`,
            [entry.id, businessId]
          );

          const totalDebits = linesResult.rows
            .filter(line => line.line_type === 'debit')
            .reduce((sum, line) => sum + parseFloat(line.amount), 0);

          const totalCredits = linesResult.rows
            .filter(line => line.line_type === 'credit')
            .reduce((sum, line) => sum + parseFloat(line.amount), 0);

          return {
            ...entry,
            lines: linesResult.rows,
            line_count: linesResult.rows.length,
            total_debits: totalDebits,
            total_credits: totalCredits,
            is_balanced: Math.abs(totalDebits - totalCredits) < 0.01
          };
        })
      );

      return {
        entries: entriesWithLines,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      log.error('Accounting service error getting journal entries:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create journal entry for inventory purchase
   */
  static async createJournalEntryForInventoryPurchase(purchaseData, userId) {
    const journalEntryData = {
      business_id: purchaseData.business_id,
      description: `Inventory Purchase${purchaseData.purchase_order_id ? ` (PO: ${purchaseData.purchase_order_id})` : ''}`,
      journal_date: new Date(),
      reference_type: 'purchase_order',
      reference_id: purchaseData.purchase_order_id || this.generateManualEntryUUID(),
      lines: [
        {
          account_code: '1300',
          description: `Purchase: ${purchaseData.quantity} units @ ${purchaseData.unit_cost}`,
          amount: purchaseData.total_amount,
          line_type: 'debit'
        }
      ]
    };

    if (purchaseData.payment_method === 'cash') {
      journalEntryData.lines.push({
        account_code: '1110',
        description: `Cash payment for inventory purchase`,
        amount: purchaseData.total_amount,
        line_type: 'credit'
      });
    } else {
      journalEntryData.lines.push({
        account_code: '2100',
        description: `Payable for inventory purchase`,
        amount: purchaseData.total_amount,
        line_type: 'credit'
      });
    }

    return await this.createJournalEntry(journalEntryData, userId);
  }
}
