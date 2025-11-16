import { query } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class FinancialReportService {
  /**
   * Get comprehensive financial report
   */
  static async getFinancialReport(businessId, startDate = null, endDate = null) {
    try {
      // Get income data from wallet transactions
      const incomeResult = await query(
        `SELECT
          SUM(amount) as total_income,
          COUNT(*) as transaction_count,
          wallet_type,
          EXTRACT(MONTH FROM wt.created_at) as month,
          EXTRACT(YEAR FROM wt.created_at) as year
         FROM wallet_transactions wt
         INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
         WHERE wt.business_id = $1 
           AND wt.transaction_type = 'income'
           ${startDate ? ' AND wt.created_at >= $2' : ''}
           ${endDate ? ' AND wt.created_at <= $3' : ''}
         GROUP BY wallet_type, month, year
         ORDER BY year, month, wallet_type`,
        [businessId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
      );

      // Get expense data
      const expenseResult = await query(
        `SELECT
          SUM(amount) as total_expenses,
          COUNT(*) as expense_count,
          ec.name as category_name,
          EXTRACT(MONTH FROM e.expense_date) as month,
          EXTRACT(YEAR FROM e.expense_date) as year
         FROM expenses e
         INNER JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.business_id = $1 
           AND e.status = 'approved'
           ${startDate ? ' AND e.expense_date >= $2' : ''}
           ${endDate ? ' AND e.expense_date <= $3' : ''}
         GROUP BY ec.name, month, year
         ORDER BY year, month, category_name`,
        [businessId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
      );

      // Get wallet balances
      const walletResult = await query(
        `SELECT
          name,
          wallet_type,
          current_balance
         FROM money_wallets
         WHERE business_id = $1 AND is_active = true
         ORDER BY wallet_type, name`,
        [businessId]
      );

      // Calculate net profit
      const totalIncome = incomeResult.rows.reduce((sum, row) => sum + parseFloat(row.total_income || 0), 0);
      const totalExpenses = expenseResult.rows.reduce((sum, row) => sum + parseFloat(row.total_expenses || 0), 0);
      const netProfit = totalIncome - totalExpenses;

      return {
        summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses,
          net_profit: netProfit,
          profit_margin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0
        },
        income_breakdown: incomeResult.rows,
        expense_breakdown: expenseResult.rows,
        wallet_balances: walletResult.rows,
        period: {
          start_date: startDate,
          end_date: endDate
        }
      };
    } catch (error) {
      log.error('Error generating financial report:', error);
      throw error;
    }
  }

  /**
   * Calculate tithe amount (optional feature)
   */
  static async calculateTithe(businessId, options = {}) {
    try {
      const {
        start_date = null,
        end_date = null,
        percentage = 10, // Default 10%, user can change
        enabled = true // User can disable tithe calculation
      } = options;

      if (!enabled) {
        return {
          enabled: false,
          message: 'Tithe calculation is disabled'
        };
      }

      // Calculate net profit for the period
      const financialReport = await this.getFinancialReport(businessId, start_date, end_date);
      const netProfit = financialReport.summary.net_profit;

      // Calculate tithe amount
      const titheAmount = netProfit * (percentage / 100);

      return {
        enabled: true,
        calculation_basis: 'net_profit',
        net_profit: netProfit,
        tithe_percentage: percentage,
        tithe_amount: titheAmount,
        period: {
          start_date: start_date,
          end_date: end_date
        },
        financial_summary: financialReport.summary
      };
    } catch (error) {
      log.error('Error calculating tithe:', error);
      throw error;
    }
  }

  /**
   * Get cash flow report
   */
  static async getCashFlowReport(businessId, startDate, endDate) {
    try {
      const cashFlowResult = await query(
        `SELECT
          DATE_TRUNC('month', wt.created_at) as period,
          SUM(CASE WHEN wt.transaction_type = 'income' THEN wt.amount ELSE 0 END) as total_income,
          SUM(CASE WHEN wt.transaction_type = 'expense' THEN wt.amount ELSE 0 END) as total_expenses,
          (SUM(CASE WHEN wt.transaction_type = 'income' THEN wt.amount ELSE 0 END) - 
           SUM(CASE WHEN wt.transaction_type = 'expense' THEN wt.amount ELSE 0 END)) as net_cash_flow
         FROM wallet_transactions wt
         WHERE wt.business_id = $1
           AND wt.created_at BETWEEN $2 AND $3
         GROUP BY DATE_TRUNC('month', wt.created_at)
         ORDER BY period`,
        [businessId, startDate, endDate]
      );

      return cashFlowResult.rows;
    } catch (error) {
      log.error('Error generating cash flow report:', error);
      throw error;
    }
  }

  /**
   * Get profit and loss statement
   */
  static async getProfitAndLoss(businessId, startDate, endDate) {
    try {
      const financialReport = await this.getFinancialReport(businessId, startDate, endDate);
      
      return {
        revenue: {
          total_income: financialReport.summary.total_income,
          breakdown: financialReport.income_breakdown
        },
        expenses: {
          total_expenses: financialReport.summary.total_expenses,
          breakdown: financialReport.expense_breakdown
        },
        net_profit: financialReport.summary.net_profit,
        profit_margin: financialReport.summary.profit_margin,
        period: {
          start_date: startDate,
          end_date: endDate
        }
      };
    } catch (error) {
      log.error('Error generating profit and loss statement:', error);
      throw error;
    }
  }
}
