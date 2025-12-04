import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class ExpenseService {
  /**
   * Get expense by ID
   */
  static async getExpenseById(businessId, expenseId) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          e.*,
          ec.name as category_name,
          mw.name as wallet_name,
          u_app.full_name as approved_by_name,
          u_created.full_name as created_by_name
         FROM expenses e
         LEFT JOIN expense_categories ec ON e.category_id = ec.id
         LEFT JOIN money_wallets mw ON e.wallet_id = mw.id
         LEFT JOIN users u_app ON e.approved_by = u_app.id
         LEFT JOIN users u_created ON e.created_by = u_created.id
         WHERE e.id = $1 AND e.business_id = $2`,
        [expenseId, businessId]
      );

      if (result.rows.length === 0) {
        throw new Error('Expense not found or access denied');
      }

      return result.rows[0];
    } catch (error) {
      log.error('Get expense by ID service error', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update expense
   */
  static async updateExpense(businessId, expenseId, expenseData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if expense exists and belongs to business
      const expenseCheck = await client.query(
        'SELECT * FROM expenses WHERE id = $1 AND business_id = $2',
        [expenseId, businessId]
      );

      if (expenseCheck.rows.length === 0) {
        throw new Error('Expense not found or access denied');
      }

      const currentExpense = expenseCheck.rows[0];

      // Verify category belongs to business if being updated
      if (expenseData.category_id) {
        const categoryCheck = await client.query(
          'SELECT id FROM expense_categories WHERE id = $1 AND business_id = $2',
          [expenseData.category_id, businessId]
        );

        if (categoryCheck.rows.length === 0) {
          throw new Error('Expense category not found or access denied');
        }
      }

      // Verify wallet belongs to business if being updated
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
        `UPDATE expenses
         SET
           category_id = COALESCE($1, category_id),
           wallet_id = COALESCE($2, wallet_id),
           amount = COALESCE($3, amount),
           description = COALESCE($4, description),
           expense_date = COALESCE($5, expense_date),
           receipt_url = COALESCE($6, receipt_url),
           status = COALESCE($7, status),
           updated_at = NOW()
         WHERE id = $8 AND business_id = $9
         RETURNING *`,
        [
          expenseData.category_id,
          expenseData.wallet_id,
          expenseData.amount,
          expenseData.description,
          expenseData.expense_date,
          expenseData.receipt_url,
          expenseData.status,
          expenseId,
          businessId
        ]
      );

      const updatedExpense = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.updated',
        resourceType: 'expense',
        resourceId: expenseId,
        newValues: expenseData
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
   * Delete expense
   */
  static async deleteExpense(businessId, expenseId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if expense exists and belongs to business
      const expenseCheck = await client.query(
        'SELECT * FROM expenses WHERE id = $1 AND business_id = $2',
        [expenseId, businessId]
      );

      if (expenseCheck.rows.length === 0) {
        throw new Error('Expense not found or access denied');
      }

      // Delete the expense
      await client.query(
        'DELETE FROM expenses WHERE id = $1 AND business_id = $2',
        [expenseId, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.deleted',
        resourceType: 'expense',
        resourceId: expenseId,
        oldValues: {
          id: expenseId,
          amount: expenseCheck.rows[0].amount,
          description: expenseCheck.rows[0].description
        }
      });

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create expense category
   */
  static async createCategory(businessId, categoryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO expense_categories (business_id, name, description, color, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          businessId,
          categoryData.name,
          categoryData.description || '',
          categoryData.color || '#3B82F6',
          categoryData.is_active !== undefined ? categoryData.is_active : true
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
   * Update expense category
   */
  static async updateCategory(businessId, categoryId, categoryData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if category exists and belongs to business
      const categoryCheck = await client.query(
        'SELECT * FROM expense_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Expense category not found or access denied');
      }

      const result = await client.query(
        `UPDATE expense_categories
         SET
           name = COALESCE($1, name),
           description = COALESCE($2, description),
           color = COALESCE($3, color),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
         WHERE id = $5 AND business_id = $6
         RETURNING *`,
        [
          categoryData.name,
          categoryData.description,
          categoryData.color,
          categoryData.is_active,
          categoryId,
          businessId
        ]
      );

      const updatedCategory = result.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.category.updated',
        resourceType: 'expense_category',
        resourceId: categoryId,
        newValues: categoryData
      });

      await client.query('COMMIT');
      return updatedCategory;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete expense category
   */
  static async deleteCategory(businessId, categoryId, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Check if category exists and belongs to business
      const categoryCheck = await client.query(
        'SELECT * FROM expense_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Expense category not found or access denied');
      }

      // Check if category has expenses
      const expenseCount = await client.query(
        'SELECT COUNT(*) as count FROM expenses WHERE category_id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      if (parseInt(expenseCount.rows[0].count) > 0) {
        throw new Error('Cannot delete category with existing expenses');
      }

      // Delete the category
      await client.query(
        'DELETE FROM expense_categories WHERE id = $1 AND business_id = $2',
        [categoryId, businessId]
      );

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.category.deleted',
        resourceType: 'expense_category',
        resourceId: categoryId,
        oldValues: {
          id: categoryId,
          name: categoryCheck.rows[0].name
        }
      });

      await client.query('COMMIT');
      return { success: true };
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
        SELECT
          ec.*,
          COUNT(e.id) as expense_count
        FROM expense_categories ec
        LEFT JOIN expenses e ON ec.id = e.category_id AND e.business_id = ec.business_id
        WHERE ec.business_id = $1
      `;
      const params = [businessId];
      let paramCount = 1;

      if (filters.is_active !== undefined) {
        paramCount++;
        queryStr += ` AND ec.is_active = $${paramCount}`;
        params.push(filters.is_active);
      }

      queryStr += ' GROUP BY ec.id, ec.name, ec.description, ec.color, ec.is_active, ec.created_at, ec.updated_at';
      queryStr += ' ORDER BY ec.name';

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
   * Create expense record WITH ACCOUNTING INTEGRATION
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

      // Create expense record
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

      // 🆕 ACCOUNTING INTEGRATION: Create journal entry if expense is paid
      if (expenseData.status === 'paid' || expenseData.status === 'approved') {
        try {
          const { AccountingService } = await import('./accountingService.js');
          
          // Map expense category to account code
          const accountCode = await this.mapExpenseCategoryToAccount(expenseData.category_id, businessId);
          
          const journalEntryData = {
            business_id: businessId,
            description: `Expense: ${expenseData.description}`,
            journal_date: expenseData.expense_date || new Date(),
            reference_type: 'expense',
            reference_id: expense.id,
            lines: [
              {
                account_code: accountCode, // Expense account
                description: `Expense: ${expenseData.description}`,
                amount: expenseData.amount,
                line_type: 'debit'
              },
              {
                account_code: expenseData.wallet_id ? '1110' : '2100', // Cash or Accounts Payable
                description: `Payment for expense: ${expenseData.description}`,
                amount: expenseData.amount,
                line_type: 'credit'
              }
            ]
          };

          await AccountingService.createJournalEntry(journalEntryData, userId);
          log.info('Accounting journal entry created for expense', {
            expenseId: expense.id,
            amount: expenseData.amount,
            accountCode: accountCode
          });
        } catch (accountingError) {
          // Don't fail expense creation if accounting fails
          log.error('Failed to create accounting entry for expense:', accountingError);
          // Expense is still created, accounting error is logged
        }
      }

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
   * Approve or reject expense WITH ACCOUNTING INTEGRATION
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

      // 🆕 ACCOUNTING INTEGRATION: Create journal entry when expense is approved/paid
      if (approvalData.status === 'approved' || approvalData.status === 'paid') {
        try {
          const { AccountingService } = await import('./accountingService.js');
          
          // Only create accounting entry if not already created (when expense was created as paid)
          const existingJournalCheck = await client.query(
            `SELECT COUNT(*) as count FROM journal_entries 
             WHERE business_id = $1 AND reference_type = 'expense' AND reference_id = $2`,
            [businessId, expenseId]
          );

          if (parseInt(existingJournalCheck.rows[0].count) === 0) {
            const accountCode = await this.mapExpenseCategoryToAccount(currentExpense.category_id, businessId);
            
            const journalEntryData = {
              business_id: businessId,
              description: `Expense Approval: ${currentExpense.description}`,
              journal_date: new Date(),
              reference_type: 'expense',
              reference_id: expenseId,
              lines: [
                {
                  account_code: accountCode,
                  description: `Expense: ${currentExpense.description}`,
                  amount: currentExpense.amount,
                  line_type: 'debit'
                },
                {
                  account_code: currentExpense.wallet_id ? '1110' : '2100',
                  description: `Payment for expense: ${currentExpense.description}`,
                  amount: currentExpense.amount,
                  line_type: 'credit'
                }
              ]
            };

            await AccountingService.createJournalEntry(journalEntryData, userId);
            log.info('Accounting journal entry created for approved expense', {
              expenseId: expenseId,
              amount: currentExpense.amount
            });
          }
        } catch (accountingError) {
          log.error('Failed to create accounting entry for approved expense:', accountingError);
        }
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

  /**
   * 🆕 Helper: Map expense category to accounting account code
   */
  static async mapExpenseCategoryToAccount(categoryId, businessId) {
    const client = await getClient();
    
    try {
      // Try to get custom mapping from expense_categories table
      const result = await client.query(
        `SELECT name, COALESCE(account_code, 
          CASE 
            WHEN name ILIKE '%rent%' THEN '5200'
            WHEN name ILIKE '%salary%' OR name ILIKE '%wage%' THEN '5500'
            WHEN name ILIKE '%utility%' THEN '5400'
            WHEN name ILIKE '%advertis%' OR name ILIKE '%market%' THEN '5500'
            ELSE '5300'  -- Default to Office Expenses
          END) as account_code
         FROM expense_categories 
         WHERE id = $1 AND business_id = $2`,
        [categoryId, businessId]
      );

      if (result.rows.length > 0) {
        return result.rows[0].account_code;
      }

      return '5300'; // Default Office Expenses
    } catch (error) {
      log.warn('Error mapping expense category to account code:', error);
      return '5300'; // Default fallback
    } finally {
      client.release();
    }
  }
}
