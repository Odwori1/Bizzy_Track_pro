import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class ExpenseService {
  /**
   * Create expense category
   */
  static async createCategory(businessId, categoryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO expense_categories (business_id, name, description, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          businessId,
          categoryData.name,
          categoryData.description || '',
          categoryData.is_active
        ]
      );

      const category = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.category.created',
        resourceType: 'expense_category',
        resourceId: category.id,
        newValues: { name: category.name }
      });

      await client.query('COMMIT');
      return category;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all expense categories
   */
  static async getCategories(businessId, filters = {}) {
    const client = await getClient();
    
    try {
      let queryStr = `
        SELECT * FROM expense_categories 
        WHERE business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

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
      log.error('❌ Database query failed in getCategories:', {
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
   * Create expense record
   */
  static async createExpense(businessId, expenseData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify category belongs to business
      const categoryCheck = await client.query(
        'SELECT id FROM expense_categories WHERE id = $1 AND business_id = $2',
        [expenseData.category_id, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Expense category not found or access denied');
      }

      // If wallet is provided, verify it belongs to business
      if (expenseData.wallet_id) {
        const walletCheck = await client.query(
          'SELECT id FROM money_wallets WHERE id = $1 AND business_id = $2',
          [expenseData.wallet_id, businessId]
        );

        if (walletCheck.rows.length === 0) {
          throw new Error('Wallet not found or access denied');
        }
      }

      const result = await client.query(
        `INSERT INTO expenses (
          business_id, category_id, wallet_id, amount, description,
          expense_date, receipt_url, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          businessId,
          expenseData.category_id,
          expenseData.wallet_id || null,
          expenseData.amount,
          expenseData.description,
          expenseData.expense_date,
          expenseData.receipt_url || '',
          expenseData.status || 'pending',
          userId
        ]
      );

      const expense = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.created',
        resourceType: 'expense',
        resourceId: expense.id,
        newValues: {
          amount: expense.amount,
          description: expense.description,
          status: expense.status
        }
      });

      await client.query('COMMIT');
      return expense;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all expenses with filters
   */
  static async getExpenses(businessId, filters = {}) {
    const client = await getClient();
    
    try {
      let queryStr = `
        SELECT 
          e.*,
          ec.name as category_name,
          mw.name as wallet_name,
          u_app.full_name as approved_by_name
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN money_wallets mw ON e.wallet_id = mw.id
        LEFT JOIN users u_app ON e.approved_by = u_app.id
        WHERE e.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.category_id) {
        paramCount++;
        queryStr += ` AND e.category_id = $${paramCount}`;
        params.push(filters.category_id);
      }

      if (filters.status) {
        paramCount++;
        queryStr += ` AND e.status = $${paramCount}`;
        params.push(filters.status);
      }

      if (filters.wallet_id) {
        paramCount++;
        queryStr += ` AND e.wallet_id = $${paramCount}`;
        params.push(filters.wallet_id);
      }

      if (filters.start_date) {
        paramCount++;
        queryStr += ` AND e.expense_date >= $${paramCount}`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        paramCount++;
        queryStr += ` AND e.expense_date <= $${paramCount}`;
        params.push(filters.end_date);
      }

      queryStr += ' ORDER BY e.created_at DESC';

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
      log.error('❌ Database query failed in getExpenses:', {
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
   * Approve or reject expense
   */
  static async approveExpense(businessId, expenseId, approvalData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current expense
      const expenseResult = await client.query(
        'SELECT * FROM expenses WHERE id = $1 AND business_id = $2',
        [expenseId, businessId]
      );

      if (expenseResult.rows.length === 0) {
        throw new Error('Expense not found or access denied');
      }

      const currentExpense = expenseResult.rows[0];

      // Update expense status
      const updateResult = await client.query(
        `UPDATE expenses 
         SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
         WHERE id = $3 AND business_id = $4
         RETURNING *`,
        [
          approvalData.status,
          userId,
          expenseId,
          businessId
        ]
      );

      const updatedExpense = updateResult.rows[0];

      // If approved and has wallet, create wallet transaction
      if (approvalData.status === 'approved' && currentExpense.wallet_id) {
        const { WalletService } = await import('./walletService.js');
        
        await WalletService.recordTransaction(
          businessId,
          {
            wallet_id: currentExpense.wallet_id,
            transaction_type: 'expense',
            amount: currentExpense.amount,
            description: `Expense: ${currentExpense.description}`,
            reference_type: 'expense',
            reference_id: expenseId
          },
          userId
        );
      }

      await auditLogger.logAction({
        businessId,
        userId,
        action: `expense.${approvalData.status}`,
        resourceType: 'expense',
        resourceId: expenseId,
        newValues: {
          status: approvalData.status,
          approved_by: userId,
          approved_at: new Date().toISOString()
        }
      });

      await client.query('COMMIT');
      return updatedExpense;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get expense statistics
   */
  static async getExpenseStatistics(businessId, startDate = null, endDate = null) {
    const client = await getClient();
    
    try {
      let queryStr = `
        SELECT
          COUNT(*) as total_expenses,
          COUNT(*) FILTER (WHERE status = 'pending') as pending_expenses,
          COUNT(*) FILTER (WHERE status = 'approved') as approved_expenses,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected_expenses,
          COUNT(*) FILTER (WHERE status = 'paid') as paid_expenses,
          SUM(amount) as total_amount,
          SUM(amount) FILTER (WHERE status = 'approved') as approved_amount,
          SUM(amount) FILTER (WHERE status = 'pending') as pending_amount,
          ec.name as category_name,
          COUNT(*) as category_count,
          SUM(e.amount) as category_amount
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (startDate) {
        paramCount++;
        queryStr += ` AND e.expense_date >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        queryStr += ` AND e.expense_date <= $${paramCount}`;
        params.push(endDate);
      }

      queryStr += ` GROUP BY ec.name, ec.id
                    ORDER BY category_amount DESC`;

      log.info('🗄️ Database Query:', { query: queryStr, params });

      const result = await client.query(queryStr, params);

      // Get overall totals
      const totalsQuery = `
        SELECT
          COUNT(*) as total_count,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount
        FROM expenses
        WHERE business_id = $1
        ${startDate ? ' AND expense_date >= $2' : ''}
        ${endDate ? ' AND expense_date <= $3' : ''}
      `;

      const totalsParams = [businessId];
      if (startDate) totalsParams.push(startDate);
      if (endDate) totalsParams.push(endDate);

      log.info('🗄️ Database Query (totals):', { query: totalsQuery, params: totalsParams });

      const totalsResult = await client.query(totalsQuery, totalsParams);
      
      log.info('✅ Database query successful', { 
        rowCount: result.rows.length,
        businessId 
      });
      
      return {
        totals: totalsResult.rows[0],
        by_category: result.rows
      };
    } catch (error) {
      log.error('❌ Database query failed in getExpenseStatistics:', {
        error: error.message,
        businessId
      });
      throw error;
    } finally {
      client.release();
    }
  }
}
