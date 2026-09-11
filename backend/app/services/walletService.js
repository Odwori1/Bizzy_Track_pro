import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';
import { AccountingService } from './accountingService.js';

// Category → (contra account_code, required transaction_type)
const ADJUSTMENT_CATEGORY_MAP = {
  cash_shortage:      { account_code: '5209', required_type: 'expense' }, // Misc Expense
  cash_overage:       { account_code: '4400', required_type: 'income'  }, // Other Revenue
  bank_fee:           { account_code: '5209', required_type: 'expense' }, // Misc Expense
  bank_interest:      { account_code: '4400', required_type: 'income'  }, // Other Revenue
  owner_contribution: { account_code: '3100', required_type: 'income'  }, // Owner's Capital
  owner_withdrawal:   { account_code: '3200', required_type: 'expense' }, // Owner's Drawings
  other_income:       { account_code: '4400', required_type: 'income'  }, // Other Revenue
  other_expense:      { account_code: '5700', required_type: 'expense' }  // Other Expenses
};

// wallet_type → GL account_code, mirroring how ensure_business_has_default_wallets()
// resolves the three default types. credit_card and tithe are deliberately absent:
// credit_card is a liability by nature and cannot sync correctly through the current
// asset-only trg_sync_wallet_on_journal_entry check; tithe is out of scope pending
// the separate giving/zakat/sadaqah system.
const WALLET_TYPE_ACCOUNT_MAP = {
  cash:           '1110',
  cash_drawer:    '1110',
  petty_cash:     '1110',
  safe:           '1110',
  bank:           '1120',
  bank_account:   '1120',
  savings:        '1120',
  mobile_money:   '1130',
  digital_wallet: '1130'
};

export class WalletService {
  /**
   * Get wallet by ID
   */
  static async getWalletById(businessId, walletId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          mw.*,
          COUNT(wt.id) as transaction_count,
          SUM(CASE WHEN wt.transaction_type = 'income' THEN wt.amount ELSE 0 END) as total_income,
          SUM(CASE WHEN wt.transaction_type = 'expense' THEN wt.amount ELSE 0 END) as total_expense
         FROM money_wallets mw
         LEFT JOIN wallet_transactions wt ON mw.id = wt.wallet_id
         WHERE mw.id = $1 AND mw.business_id = $2
         GROUP BY mw.id`,
        [walletId, businessId]
      );

      if (result.rows.length === 0) {
        throw new Error('Wallet not found or access denied');
      }

      // Get recent transactions
      const transactionsResult = await client.query(
        `SELECT * FROM wallet_transactions
         WHERE wallet_id = $1 AND business_id = $2
         ORDER BY created_at DESC
         LIMIT 10`,
        [walletId, businessId]
      );

      const wallet = result.rows[0];
      wallet.recent_transactions = transactionsResult.rows;

      return wallet;
    } catch (error) {
      log.error('Get wallet by ID service error', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update wallet - FIXED: Handle optional fields properly
   */
  static async updateWallet(businessId, walletId, walletData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if wallet exists and belongs to business
      const walletCheck = await client.query(
        'SELECT * FROM money_wallets WHERE id = $1 AND business_id = $2',
        [walletId, businessId]
      );

      if (walletCheck.rows.length === 0) {
        throw new Error('Wallet not found or access denied');
      }

      const currentWallet = walletCheck.rows[0];

      // Check for duplicate wallet name (excluding current wallet)
      if (walletData.name && walletData.name !== currentWallet.name) {
        const nameCheck = await client.query(
          'SELECT id FROM money_wallets WHERE business_id = $1 AND name = $2 AND id != $3',
          [businessId, walletData.name, walletId]
        );

        if (nameCheck.rows.length > 0) {
          throw new Error('Wallet name already exists');
        }
      }

      // Use COALESCE to handle optional fields - keep current values if not provided
      const result = await client.query(
        `UPDATE money_wallets
         SET
           name = COALESCE($1, name),
           wallet_type = COALESCE($2, wallet_type),
           description = COALESCE($3, description),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
         WHERE id = $5 AND business_id = $6
         RETURNING *`,
        [
          walletData.name,
          walletData.wallet_type,
          walletData.description,
          walletData.is_active,
          walletId,
          businessId
        ]
      );

      const updatedWallet = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wallet.updated',
        resourceType: 'wallet',
        resourceId: walletId,
        newValues: walletData
      });

      await client.query('COMMIT');
      return updatedWallet;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create money wallet
   *
   * FIXED (v23.0 Step A′): resolve gl_account_id at creation time, the same
   * way ensure_business_has_default_wallets() does for the three auto-provisioned
   * types. Every wallet created via this path used to start unlinked, which meant
   * it would immediately fail the recordTransaction()/transferBetweenWallets()
   * guard shipped in v23.0 Step A the first time anyone tried to use it.
   *
   * wallet_type values not present in WALLET_TYPE_ACCOUNT_MAP (currently
   * 'credit_card' and 'tithe') fail closed with a named error rather than
   * silently creating another unlinked wallet.
   */
  static async createWallet(businessId, walletData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check for duplicate wallet name
      const nameCheck = await client.query(
        'SELECT id FROM money_wallets WHERE business_id = $1 AND name = $2',
        [businessId, walletData.name]
      );

      if (nameCheck.rows.length > 0) {
        throw new Error('Wallet name already exists');
      }

      // Resolve gl_account_id from wallet_type
      const accountCode = WALLET_TYPE_ACCOUNT_MAP[walletData.wallet_type];
      if (!accountCode) {
        throw new Error(
          `wallet_type '${walletData.wallet_type}' has no chart-of-accounts mapping and ` +
          `cannot be linked automatically. This wallet cannot be created until a GL ` +
          `account strategy for this type is decided.`
        );
      }

      const glAccountResult = await client.query(
        `SELECT id FROM chart_of_accounts WHERE business_id = $1 AND account_code = $2`,
        [businessId, accountCode]
      );

      const glAccountId = glAccountResult.rows[0]?.id;
      if (!glAccountId) {
        // Should not happen given the canonical 65-account chart, but fail loudly
        // rather than silently creating another unlinked wallet.
        throw new Error(
          `Chart-of-accounts entry '${accountCode}' not found for business ${businessId} — ` +
          `cannot link new wallet.`
        );
      }

      const result = await client.query(
        `INSERT INTO money_wallets (
          business_id, name, wallet_type, current_balance, description, is_active, gl_account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          businessId,
          walletData.name,
          walletData.wallet_type,
          walletData.current_balance || 0,
          walletData.description || '',
          walletData.is_active,
          glAccountId
        ]
      );

      const wallet = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wallet.created',
        resourceType: 'wallet',
        resourceId: wallet.id,
        newValues: {
          name: wallet.name,
          wallet_type: wallet.wallet_type,
          initial_balance: wallet.current_balance,
          gl_account_id: wallet.gl_account_id
        }
      });

      await client.query('COMMIT');
      return wallet;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all wallets for business
   */
  static async getWallets(businessId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT * FROM money_wallets
        WHERE business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.wallet_type) {
        paramCount++;
        queryStr += ` AND wallet_type = $${paramCount}`;
        params.push(filters.wallet_type);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      queryStr += ' ORDER BY name';

      log.info('🗄️ Database Query:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Database query failed in getWallets:', {
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
   * Record a manual wallet adjustment as a proper double-entry journal entry.
   *
   * FIXED (v22.0 Step A): previously wrote directly to money_wallets.current_balance
   * and wallet_transactions with no accounting record at all — a real, reachable
   * bypass of the double-entry system (any wallet:update permission could silently
   * desync the books from displayed wallet balances). Now routes through
   * AccountingService.createJournalEntry(); trg_sync_wallet_on_journal_entry
   * (AFTER INSERT ON journal_entry_lines) picks up the wallet-side line automatically
   * and creates the wallet_transactions row + balance update itself, so there is only
   * ever one source of truth.
   */
  static async recordTransaction(businessId, transactionData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const { wallet_id, transaction_type, adjustment_category, amount, description } = transactionData;

      const category = ADJUSTMENT_CATEGORY_MAP[adjustment_category];
      if (!category) {
        throw new Error(`Unknown adjustment_category: ${adjustment_category}`);
      }
      if (category.required_type !== transaction_type) {
        throw new Error(
          `adjustment_category '${adjustment_category}' requires transaction_type ` +
          `'${category.required_type}', got '${transaction_type}'`
        );
      }

      // Verify wallet belongs to business and has a linked GL account.
      const walletResult = await client.query(
        `SELECT id, current_balance, gl_account_id, is_active
         FROM money_wallets WHERE id = $1 AND business_id = $2`,
        [wallet_id, businessId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error('Wallet not found or access denied');
      }

      const wallet = walletResult.rows[0];

      if (!wallet.gl_account_id) {
        throw new Error(
          'This wallet is not linked to a chart-of-accounts entry (gl_account_id is null). ' +
          'Link it to a GL account before recording transactions against it.'
        );
      }

      const currentBalance = parseFloat(wallet.current_balance);
      const numericAmount = parseFloat(amount);

      // Pre-flight balance check for expenses — mirrors the read-only,
      // side-effect-free pattern used in InventoryAccountingService.recordInventoryPurchase().
      if (transaction_type === 'expense' && currentBalance < numericAmount) {
        throw new Error(
          `Insufficient wallet balance: adjustment of ${numericAmount} requested but ` +
          `wallet only has ${currentBalance} available`
        );
      }

      // Get the wallet's own GL account_code (createJournalEntry expects a code, not an id).
      const walletAccountResult = await client.query(
        `SELECT account_code FROM chart_of_accounts WHERE id = $1`,
        [wallet.gl_account_id]
      );
      const walletAccountCode = walletAccountResult.rows[0]?.account_code;

      if (!walletAccountCode) {
        throw new Error('Wallet GL account could not be resolved');
      }

      // income  → wallet debit, contra credit
      // expense → wallet credit, contra debit
      const lines = transaction_type === 'income'
        ? [
            { account_code: walletAccountCode, description, amount: numericAmount, line_type: 'debit' },
            { account_code: category.account_code, description, amount: numericAmount, line_type: 'credit' }
          ]
        : [
            { account_code: category.account_code, description, amount: numericAmount, line_type: 'debit' },
            { account_code: walletAccountCode, description, amount: numericAmount, line_type: 'credit' }
          ];

      const journalEntry = await AccountingService.createJournalEntry(
        {
          business_id: businessId,
          description,
          journal_date: new Date(),
          reference_type: adjustment_category,
          reference_id: AccountingService.generateManualEntryUUID(),
          lines
        },
        userId,
        client
      );

      // Wallet balance + wallet_transactions row are created by
      // trg_sync_wallet_on_journal_entry — no manual write here.
      const updatedWalletResult = await client.query(
        `SELECT current_balance FROM money_wallets WHERE id = $1`,
        [wallet_id]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wallet.transaction.created',
        resourceType: 'wallet_transaction',
        resourceId: journalEntry.journal_entry.id,
        newValues: {
          wallet_id,
          transaction_type,
          adjustment_category,
          amount: numericAmount,
          new_balance: updatedWalletResult.rows[0].current_balance
        }
      });

      await client.query('COMMIT');

      return {
        journal_entry: journalEntry,
        new_balance: parseFloat(updatedWalletResult.rows[0].current_balance)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Wallet transaction recording error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transfer money between two wallets as a proper double-entry journal entry.
   *
   * FIXED (v22.0 Step A): previously wrote directly to money_wallets.current_balance
   * (both wallets) and inserted two wallet_transactions rows by hand, with no
   * accounting record at all. Now a single journal entry (Dr destination / Cr source)
   * lets trg_sync_wallet_on_journal_entry create both wallet_transactions rows and
   * update both balances — reference_type 'wallet_transfer' is already specially
   * labeled by the trigger.
   */
  static async transferBetweenWallets(businessId, transferData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const { from_wallet_id, to_wallet_id, amount, description } = transferData;
      const numericAmount = parseFloat(amount);
      const transferDescription = description || 'Transfer between wallets';

      const walletsResult = await client.query(
        `SELECT mw.id, mw.name, mw.current_balance, mw.gl_account_id, ca.account_code
         FROM money_wallets mw
         LEFT JOIN chart_of_accounts ca ON ca.id = mw.gl_account_id
         WHERE mw.id = ANY($1::uuid[]) AND mw.business_id = $2`,
        [[from_wallet_id, to_wallet_id], businessId]
      );

      const fromWallet = walletsResult.rows.find(w => w.id === from_wallet_id);
      const toWallet = walletsResult.rows.find(w => w.id === to_wallet_id);

      if (!fromWallet || !toWallet) {
        throw new Error('One or both wallets not found or access denied');
      }

      for (const w of [fromWallet, toWallet]) {
        if (!w.gl_account_id || !w.account_code) {
          throw new Error(
            `Wallet '${w.name}' is not linked to a chart-of-accounts entry. ` +
            `Link it to a GL account before transferring to/from it.`
          );
        }
      }

      if (parseFloat(fromWallet.current_balance) < numericAmount) {
        throw new Error(`Insufficient balance in ${fromWallet.name}`);
      }

      const journalEntry = await AccountingService.createJournalEntry(
        {
          business_id: businessId,
          description: transferDescription,
          journal_date: new Date(),
          reference_type: 'wallet_transfer',
          reference_id: AccountingService.generateManualEntryUUID(),
          lines: [
            {
              account_code: toWallet.account_code,
              description: `Transfer from ${fromWallet.name}: ${transferDescription}`,
              amount: numericAmount,
              line_type: 'debit'
            },
            {
              account_code: fromWallet.account_code,
              description: `Transfer to ${toWallet.name}: ${transferDescription}`,
              amount: numericAmount,
              line_type: 'credit'
            }
          ]
        },
        userId,
        client
      );

      const updatedBalances = await client.query(
        `SELECT id, current_balance FROM money_wallets WHERE id = ANY($1::uuid[])`,
        [[from_wallet_id, to_wallet_id]]
      );
      const fromNewBalance = parseFloat(updatedBalances.rows.find(w => w.id === from_wallet_id).current_balance);
      const toNewBalance = parseFloat(updatedBalances.rows.find(w => w.id === to_wallet_id).current_balance);

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wallet.transfer.completed',
        resourceType: 'wallet_transfer',
        resourceId: journalEntry.journal_entry.id,
        newValues: {
          from_wallet: fromWallet.name,
          to_wallet: toWallet.name,
          amount: numericAmount,
          from_new_balance: fromNewBalance,
          to_new_balance: toNewBalance
        }
      });

      await client.query('COMMIT');

      return {
        journal_entry: journalEntry,
        new_balances: { from_wallet: fromNewBalance, to_wallet: toNewBalance }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Wallet transfer error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get wallet transactions
   */
  static async getWalletTransactions(businessId, walletId, filters = {}) {
    const client = await getClient();

    try {
      let queryStr = `
        SELECT wt.*, mw.name as wallet_name
        FROM wallet_transactions wt
        INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
        WHERE wt.business_id = $1 AND wt.wallet_id = $2
      `;
      const params = [businessId, walletId];
      let paramCount = 2;

      if (filters.transaction_type) {
        paramCount++;
        queryStr += ` AND wt.transaction_type = $${paramCount}`;
        params.push(filters.transaction_type);
      }

      if (filters.start_date) {
        paramCount++;
        queryStr += ` AND wt.created_at >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        queryStr += ` AND wt.created_at <= $${paramCount}`;
        params.push(filters.end_date);
      }

      queryStr += ' ORDER BY wt.created_at DESC';

      if (filters.page && filters.limit) {
        const offset = (filters.page - 1) * filters.limit;
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(filters.limit);

        paramCount++;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      log.info('🗄️ Database Query:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return result.rows;
    } catch (error) {
      log.error('❌ Database query failed in getWalletTransactions:', {
        error: error.message,
        businessId,
        walletId,
        filters
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all transactions across all wallets for a business
   */
  static async getAllTransactions(businessId, filters = {}) {
    const client = await getClient();
    try {
      const {
        transaction_type,
        start_date,
        end_date,
        page = 1,
        limit = 50
      } = filters;

      let queryStr = `
        SELECT
          wt.*,
          mw.name as wallet_name,
          mw.wallet_type
        FROM wallet_transactions wt
        INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
        WHERE mw.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (transaction_type) {
        paramCount++;
        queryStr += ` AND wt.transaction_type = $${paramCount}`;
        params.push(transaction_type);
      }

      if (start_date) {
        paramCount++;
        queryStr += ` AND wt.created_at >= $${paramCount}`;
        params.push(start_date);
      }

      if (end_date) {
        paramCount++;
        queryStr += ` AND wt.created_at <= $${paramCount}`;
        params.push(end_date);
      }

      queryStr += ` ORDER BY wt.created_at DESC`;

      // Add pagination
      if (limit) {
        paramCount++;
        queryStr += ` LIMIT $${paramCount}`;
        params.push(limit);
      }

      if (page && limit) {
        paramCount++;
        const offset = (page - 1) * limit;
        queryStr += ` OFFSET $${paramCount}`;
        params.push(offset);
      }

      const result = await client.query(queryStr, params);

      // Get total count for pagination info
      let countQuery = `
        SELECT COUNT(*)
        FROM wallet_transactions wt
        INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
        WHERE mw.business_id = $1
      `;
      const countParams = [businessId];

      if (transaction_type) {
        countQuery += ` AND wt.transaction_type = $2`;
        countParams.push(transaction_type);
      }

      const countResult = await client.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      return {
        transactions: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      log.error('Error fetching all wallet transactions:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get wallet statistics
   */
  static async getWalletStatistics(businessId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          COUNT(*) as total_wallets,
          COUNT(*) FILTER (WHERE is_active = true) as active_wallets,
          SUM(current_balance) as total_balance,
          wallet_type,
          COUNT(*) as type_count,
          SUM(current_balance) as type_balance
         FROM money_wallets
         WHERE business_id = $1
         GROUP BY wallet_type`,
        [businessId]
      );

      const totalStats = await client.query(
        `SELECT
          SUM(current_balance) as total_balance
         FROM money_wallets
         WHERE business_id = $1 AND is_active = true`,
        [businessId]
      );

      log.info('✅ Database query successful', {
        rowCount: result.rows.length,
        businessId
      });

      return {
        total_balance: parseFloat(totalStats.rows[0]?.total_balance || 0),
        wallet_types: result.rows
      };
    } catch (error) {
      log.error('❌ Database query failed in getWalletStatistics:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
