import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class WalletService {
  /**
   * Create money wallet
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

      const result = await client.query(
        `INSERT INTO money_wallets (
          business_id, name, wallet_type, current_balance, description, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          businessId,
          walletData.name,
          walletData.wallet_type,
          walletData.current_balance || 0,
          walletData.description || '',
          walletData.is_active
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
          initial_balance: wallet.current_balance
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
   * Record wallet transaction and update balance
   */
  static async recordTransaction(businessId, transactionData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify wallet belongs to business
      const walletCheck = await client.query(
        'SELECT id, current_balance FROM money_wallets WHERE id = $1 AND business_id = $2',
        [transactionData.wallet_id, businessId]
      );

      if (walletCheck.rows.length === 0) {
        throw new Error('Wallet not found or access denied');
      }

      const currentBalance = parseFloat(walletCheck.rows[0].current_balance);
      const amount = parseFloat(transactionData.amount);
      
      // Calculate new balance
      let newBalance;
      switch (transactionData.transaction_type) {
        case 'income':
          newBalance = currentBalance + amount;
          break;
        case 'expense':
          if (currentBalance < amount) {
            throw new Error('Insufficient wallet balance');
          }
          newBalance = currentBalance - amount;
          break;
        case 'transfer':
          // For transfers, balance remains same (handled separately)
          newBalance = currentBalance;
          break;
        default:
          throw new Error('Invalid transaction type');
      }

      // Record transaction
      const transactionResult = await client.query(
        `INSERT INTO wallet_transactions (
          business_id, wallet_id, transaction_type, amount,
          balance_after, description, reference_type, reference_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          transactionData.wallet_id,
          transactionData.transaction_type,
          amount,
          newBalance,
          transactionData.description,
          transactionData.reference_type || null,
          transactionData.reference_id || null,
          userId
        ]
      );

      const transaction = transactionResult.rows[0];

      // Update wallet balance (except for transfers)
      if (transactionData.transaction_type !== 'transfer') {
        await client.query(
          'UPDATE money_wallets SET current_balance = $1, updated_at = NOW() WHERE id = $2',
          [newBalance, transactionData.wallet_id]
        );
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wallet.transaction.created',
        resourceType: 'wallet_transaction',
        resourceId: transaction.id,
        newValues: {
          transaction_type: transaction.transaction_type,
          amount: transaction.amount,
          new_balance: newBalance
        }
      });

      await client.query('COMMIT');
      return { transaction, new_balance: newBalance };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Transfer money between wallets
   */
  static async transferBetweenWallets(businessId, transferData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify both wallets belong to business
      const fromWalletCheck = await client.query(
        'SELECT id, current_balance, name FROM money_wallets WHERE id = $1 AND business_id = $2',
        [transferData.from_wallet_id, businessId]
      );

      const toWalletCheck = await client.query(
        'SELECT id, current_balance, name FROM money_wallets WHERE id = $1 AND business_id = $2',
        [transferData.to_wallet_id, businessId]
      );

      if (fromWalletCheck.rows.length === 0 || toWalletCheck.rows.length === 0) {
        throw new Error('One or both wallets not found or access denied');
      }

      const fromWallet = fromWalletCheck.rows[0];
      const toWallet = toWalletCheck.rows[0];
      const amount = parseFloat(transferData.amount);

      // Check sufficient balance in source wallet
      if (parseFloat(fromWallet.current_balance) < amount) {
        throw new Error(`Insufficient balance in ${fromWallet.name}`);
      }

      // Calculate new balances
      const fromNewBalance = parseFloat(fromWallet.current_balance) - amount;
      const toNewBalance = parseFloat(toWallet.current_balance) + amount;

      // Record outgoing transaction (expense from source wallet)
      const fromTransaction = await client.query(
        `INSERT INTO wallet_transactions (
          business_id, wallet_id, transaction_type, amount,
          balance_after, description, reference_type, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          businessId,
          transferData.from_wallet_id,
          'expense',
          amount,
          fromNewBalance,
          `Transfer to ${toWallet.name}: ${transferData.description || ''}`,
          'wallet_transfer',
          userId
        ]
      );

      // Record incoming transaction (income to destination wallet)
      const toTransaction = await client.query(
        `INSERT INTO wallet_transactions (
          business_id, wallet_id, transaction_type, amount,
          balance_after, description, reference_type, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          businessId,
          transferData.to_wallet_id,
          'income',
          amount,
          toNewBalance,
          `Transfer from ${fromWallet.name}: ${transferData.description || ''}`,
          'wallet_transfer',
          userId
        ]
      );

      // Update both wallet balances
      await client.query(
        'UPDATE money_wallets SET current_balance = $1, updated_at = NOW() WHERE id = $2',
        [fromNewBalance, transferData.from_wallet_id]
      );

      await client.query(
        'UPDATE money_wallets SET current_balance = $1, updated_at = NOW() WHERE id = $2',
        [toNewBalance, transferData.to_wallet_id]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'wallet.transfer.completed',
        resourceType: 'wallet_transfer',
        resourceId: fromTransaction.rows[0].id,
        newValues: {
          from_wallet: fromWallet.name,
          to_wallet: toWallet.name,
          amount: amount,
          from_new_balance: fromNewBalance,
          to_new_balance: toNewBalance
        }
      });

      await client.query('COMMIT');
      
      return {
        transfer: {
          from_transaction: fromTransaction.rows[0],
          to_transaction: toTransaction.rows[0],
          amount: amount
        },
        new_balances: {
          from_wallet: fromNewBalance,
          to_wallet: toNewBalance
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
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
