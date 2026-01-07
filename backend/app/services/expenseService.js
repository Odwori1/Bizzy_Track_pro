import { query, getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class ExpenseService {
  /**
   * 🆕 Generate expense number
   */
  static async generateExpenseNumber(businessId) {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT generate_expense_number($1) as expense_number`,
        [businessId]
      );
      return result.rows[0].expense_number;
    } catch (error) {
      // Fallback if function doesn't exist
      const timestamp = Date.now();
      return `EXP-${timestamp}`;
    } finally {
      client.release();
    }
  }

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
           vendor_name = COALESCE($8, vendor_name),
           payment_method = COALESCE($9, payment_method),
           updated_at = NOW()
         WHERE id = $10 AND business_id = $11
         RETURNING *`,
        [
          expenseData.category_id,
          expenseData.wallet_id,
          expenseData.amount,
          expenseData.description,
          expenseData.expense_date,
          expenseData.receipt_url,
          expenseData.status,
          expenseData.vendor_name,
          expenseData.payment_method,
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
        `INSERT INTO expense_categories (business_id, name, description, color, is_active, account_code)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          businessId,
          categoryData.name,
          categoryData.description || '',
          categoryData.color || '#3B82F6',
          categoryData.is_active !== undefined ? categoryData.is_active : true,
          categoryData.account_code || null
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
           account_code = COALESCE($5, account_code),
           updated_at = NOW()
         WHERE id = $6 AND business_id = $7
         RETURNING *`,
        [
          categoryData.name,
          categoryData.description,
          categoryData.color,
          categoryData.is_active,
          categoryData.account_code,
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
   * 🆕 Create expense with proper accounting integration
   */
  static async createExpense(businessId, expenseData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Verify category belongs to business
      const categoryCheck = await client.query(
        'SELECT id, account_code FROM expense_categories WHERE id = $1 AND business_id = $2',
        [expenseData.category_id, businessId]
      );

      if (categoryCheck.rows.length === 0) {
        throw new Error('Expense category not found or access denied');
      }

      // Generate expense number
      const expenseNumber = await this.generateExpenseNumber(businessId);

      // Calculate total amount
      const taxAmount = expenseData.tax_amount || 0;
      const totalAmount = expenseData.amount + taxAmount;

      // Create expense record
      const result = await client.query(
        `INSERT INTO expenses (
          business_id, category_id, wallet_id, amount, description,
          expense_date, receipt_url, status, created_by, 
          vendor_name, payment_method, total_amount, tax_amount, expense_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          businessId,
          expenseData.category_id,
          expenseData.wallet_id || null,
          expenseData.amount,
          expenseData.description,
          expenseData.expense_date || new Date().toISOString().split('T')[0],
          expenseData.receipt_url || '',
          expenseData.status || 'pending',
          userId,
          expenseData.vendor_name || '',
          expenseData.payment_method || null,
          totalAmount,
          taxAmount,
          expenseNumber
        ]
      );

      const expense = result.rows[0];

      // 🆕 Create accounting entries if expense is paid
      if (expenseData.status === 'paid') {
        try {
          const journalEntryId = await client.query(
            `SELECT create_accounting_for_expense($1, $2) as journal_entry_id`,
            [expense.id, userId]
          );
          
          if (journalEntryId.rows[0].journal_entry_id) {
            await client.query(
              'UPDATE expenses SET journal_entry_id = $1 WHERE id = $2',
              [journalEntryId.rows[0].journal_entry_id, expense.id]
            );
            expense.journal_entry_id = journalEntryId.rows[0].journal_entry_id;
          }
          
          log.info('Accounting created for paid expense', {
            expenseId: expense.id,
            journalEntryId: expense.journal_entry_id
          });
        } catch (accountingError) {
          log.error('Failed to create accounting for expense:', accountingError);
          // Don't fail expense creation if accounting fails
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
          u_app.full_name as approved_by_name,
          u_created.full_name as created_by_name,
          u_paid.full_name as paid_by_name
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN money_wallets mw ON e.wallet_id = mw.id
        LEFT JOIN users u_app ON e.approved_by = u_app.id
        LEFT JOIN users u_created ON e.created_by = u_created.id
        LEFT JOIN users u_paid ON e.paid_by = u_paid.id
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

      if (filters.search) {
        paramCount++;
        queryStr += ` AND (e.description ILIKE $${paramCount} OR e.vendor_name ILIKE $${paramCount} OR e.expense_number ILIKE $${paramCount})`;
        params.push(`%${filters.search}%`);
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
   * 🆕 Approve expense with accounting
   */
  static async approveExpense(businessId, expenseId, approvalData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current expense
      const expenseResult = await client.query(
        'SELECT * FROM expenses WHERE id = $1 AND business_id = $2 FOR UPDATE',
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

      // 🆕 Create accounting for approved expenses
      if (approvalData.status === 'approved') {
        try {
          const journalEntryId = await client.query(
            `SELECT create_accounting_for_expense($1, $2) as journal_entry_id`,
            [expenseId, userId]
          );
          
          if (journalEntryId.rows[0].journal_entry_id) {
            // Update expense with journal entry ID
            await client.query(
              `UPDATE expenses SET journal_entry_id = $1 WHERE id = $2`,
              [journalEntryId.rows[0].journal_entry_id, expenseId]
            );
            
            updatedExpense.journal_entry_id = journalEntryId.rows[0].journal_entry_id;
            log.info('Accounting created for approved expense', {
              expenseId: expenseId,
              journalEntryId: journalEntryId.rows[0].journal_entry_id
            });
          }
        } catch (accountingError) {
          log.error('Failed to create accounting for approved expense:', accountingError);
          // Continue even if accounting fails
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
   * 🆕 Pay an expense (new endpoint from blueprint)
   */
  static async payExpense(businessId, expenseId, paymentData, userId) {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get current expense
      const expenseResult = await client.query(
        `SELECT * FROM expenses WHERE id = $1 AND business_id = $2 FOR UPDATE`,
        [expenseId, businessId]
      );

      if (expenseResult.rows.length === 0) {
        throw new Error('Expense not found or access denied');
      }

      const currentExpense = expenseResult.rows[0];

      // Validate expense can be paid
      if (currentExpense.status === 'paid') {
        throw new Error('Expense is already paid');
      }

      if (currentExpense.status !== 'approved') {
        throw new Error('Only approved expenses can be paid');
      }

      // Process payment
      const journalEntryId = await client.query(
        `SELECT process_expense_payment($1, $2, $3) as journal_entry_id`,
        [expenseId, paymentData.payment_method, userId]
      );

      // Update expense
      const updateResult = await client.query(
        `UPDATE expenses 
         SET status = 'paid', 
             payment_method = $1,
             paid_by = $2,
             paid_at = NOW(),
             journal_entry_id = COALESCE($3, journal_entry_id),
             updated_at = NOW()
         WHERE id = $4 AND business_id = $5
         RETURNING *`,
        [
          paymentData.payment_method,
          userId,
          journalEntryId.rows[0].journal_entry_id,
          expenseId,
          businessId
        ]
      );

      const updatedExpense = updateResult.rows[0];

      await auditLogger.logAction({
        businessId,
        userId,
        action: 'expense.paid',
        resourceType: 'expense',
        resourceId: expenseId,
        newValues: {
          status: 'paid',
          payment_method: paymentData.payment_method,
          paid_by: userId,
          paid_at: new Date().toISOString()
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
          SUM(total_amount) as total_amount,
          SUM(total_amount) FILTER (WHERE status = 'approved') as approved_amount,
          SUM(total_amount) FILTER (WHERE status = 'pending') as pending_amount,
          SUM(total_amount) FILTER (WHERE status = 'paid') as paid_amount,
          ec.name as category_name,
          COUNT(*) as category_count,
          SUM(e.total_amount) as category_amount
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
          SUM(total_amount) as total_amount,
          AVG(total_amount) as average_amount,
          SUM(tax_amount) as total_tax
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
      const result = await client.query(
        `SELECT account_code FROM expense_categories 
         WHERE id = $1 AND business_id = $2`,
        [categoryId, businessId]
      );

      if (result.rows.length > 0 && result.rows[0].account_code) {
        return result.rows[0].account_code;
      }

      return '5700'; // Default Other Expenses
    } catch (error) {
      log.warn('Error mapping expense category to account code:', error);
      return '5700'; // Default fallback
    } finally {
      client.release();
    }
  }
}
