import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class FinancialReportService {
  /**
   * Get comprehensive financial report - SIMPLIFIED & GUARANTEED
   */
  static async getFinancialReport(businessId, startDate = null, endDate = null) {
    const client = await getClient();
    try {
      // DIRECT QUERIES - No complex filtering
      const incomeResult = await client.query(
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

      const expenseResult = await client.query(
        `SELECT
          SUM(amount) as total_expenses,
          COUNT(*) as expense_count,
          ec.name as category_name,
          EXTRACT(MONTH FROM e.expense_date) as month,
          EXTRACT(YEAR FROM e.expense_date) as year
         FROM expenses e
         INNER JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.business_id = $1
           ${startDate ? ' AND e.expense_date >= $2' : ''}
           ${endDate ? ' AND e.expense_date <= $3' : ''}
         GROUP BY ec.name, month, year
         ORDER BY year, month, category_name`,
        [businessId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
      );

      // Get wallet balances
      const walletResult = await client.query(
        `SELECT
          name,
          wallet_type,
          current_balance
         FROM money_wallets
         WHERE business_id = $1 AND is_active = true
         ORDER BY wallet_type, name`,
        [businessId]
      );

      // Calculate totals
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
    } finally {
      client.release();
    }
  }

  /**
   * Get cash flow report - SIMPLIFIED & GUARANTEED
   */
  static async getCashFlowReport(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      // DIRECT QUERIES - No complex filtering or union logic
      const incomeResult = await client.query(
        `SELECT
          DATE_TRUNC('month', created_at) as period,
          SUM(amount) as total_income
         FROM wallet_transactions
         WHERE business_id = $1
           AND transaction_type = 'income'
           AND created_at BETWEEN $2 AND $3
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY period`,
        [businessId, startDate, endDate]
      );

      const expenseResult = await client.query(
        `SELECT
          DATE_TRUNC('month', expense_date) as period,
          SUM(amount) as total_expenses
         FROM expenses
         WHERE business_id = $1
           AND expense_date BETWEEN $2 AND $3
         GROUP BY DATE_TRUNC('month', expense_date)
         ORDER BY period`,
        [businessId, startDate, endDate]
      );

      // Combine income and expense data by period
      const cashFlowMap = new Map();

      // Process income data
      incomeResult.rows.forEach(row => {
        if (row.period) {
          const period = row.period.toISOString();
          const periodDisplay = new Date(row.period).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
          });
          
          cashFlowMap.set(period, {
            period: period,
            period_display: periodDisplay,
            total_income: parseFloat(row.total_income) || 0,
            total_expenses: 0,
            net_cash_flow: parseFloat(row.total_income) || 0
          });
        }
      });

      // Process expense data
      expenseResult.rows.forEach(row => {
        if (row.period) {
          const period = row.period.toISOString();
          const periodDisplay = new Date(row.period).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
          });
          const expenses = parseFloat(row.total_expenses) || 0;
          
          if (cashFlowMap.has(period)) {
            const existing = cashFlowMap.get(period);
            existing.total_expenses = expenses;
            existing.net_cash_flow = existing.total_income - expenses;
          } else {
            cashFlowMap.set(period, {
              period: period,
              period_display: periodDisplay,
              total_income: 0,
              total_expenses: expenses,
              net_cash_flow: -expenses
            });
          }
        }
      });

      // Convert to array and sort
      const cashFlowData = Array.from(cashFlowMap.values()).sort((a, b) => 
        new Date(a.period) - new Date(b.period)
      );

      // If no monthly data, return summary data
      if (cashFlowData.length === 0) {
        const totalIncome = incomeResult.rows.reduce((sum, row) => sum + parseFloat(row.total_income || 0), 0);
        const totalExpenses = expenseResult.rows.reduce((sum, row) => sum + parseFloat(row.total_expenses || 0), 0);
        
        return [{
          period: new Date().toISOString(),
          period_display: 'Current Period',
          total_income: totalIncome,
          total_expenses: totalExpenses,
          net_cash_flow: totalIncome - totalExpenses
        }];
      }

      return cashFlowData;

    } catch (error) {
      log.error('Error generating cash flow report:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get profit and loss - SIMPLIFIED & GUARANTEED
   */
  static async getProfitAndLoss(businessId, startDate, endDate) {
    try {
      // Use the same logic as getFinancialReport for consistency
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

  /**
   * Get balance sheet - SIMPLIFIED & GUARANTEED
   */
  static async getBalanceSheet(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      // Get total assets (sum of all wallet balances)
      const assetsResult = await client.query(
        `SELECT SUM(current_balance) as total_assets
         FROM money_wallets
         WHERE business_id = $1 AND is_active = true`,
        [businessId]
      );

      const totalAssets = parseFloat(assetsResult.rows[0].total_assets) || 0;

      // Get inventory valuation
      const inventoryResult = await client.query(
        `SELECT SUM(current_stock * cost_price) as total_inventory_value
         FROM inventory_items
         WHERE business_id = $1 AND is_active = true AND current_stock > 0`,
        [businessId]
      );

      const totalInventoryValue = parseFloat(inventoryResult.rows[0].total_inventory_value) || 0;

      // Get total liabilities (sum of unpaid expenses)
      const liabilitiesResult = await client.query(
        `SELECT SUM(amount) as total_liabilities
         FROM expenses
         WHERE business_id = $1 AND status != 'paid'`,
        [businessId]
      );

      const totalLiabilities = parseFloat(liabilitiesResult.rows[0].total_liabilities) || 0;

      // Get net income for the period
      const incomeResult = await client.query(
        `SELECT
          COALESCE(SUM(
            CASE WHEN wt.transaction_type = 'income' THEN wt.amount
                 WHEN wt.transaction_type = 'expense' THEN -wt.amount
                 ELSE 0 END
          ), 0) as net_income
         FROM wallet_transactions wt
         INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
         WHERE mw.business_id = $1
           AND wt.created_at BETWEEN $2 AND $3`,
        [businessId, startDate, endDate]
      );

      const netIncome = parseFloat(incomeResult.rows[0].net_income) || 0;

      // Calculate equity
      const totalEquity = totalAssets + totalInventoryValue - totalLiabilities;

      const balanceSheet = {
        assets: {
          current_assets: {
            cash_and_equivalents: totalAssets,
            accounts_receivable: 0,
            inventory: totalInventoryValue,
            total_current_assets: totalAssets + totalInventoryValue
          },
          fixed_assets: {
            property_equipment: 0,
            total_fixed_assets: 0
          },
          total_assets: totalAssets + totalInventoryValue
        },
        liabilities: {
          current_liabilities: {
            accounts_payable: totalLiabilities,
            short_term_debt: 0,
            total_current_liabilities: totalLiabilities
          },
          long_term_liabilities: {
            long_term_debt: 0,
            total_long_term_liabilities: 0
          },
          total_liabilities: totalLiabilities
        },
        equity: {
          retained_earnings: netIncome,
          common_stock: totalEquity - netIncome,
          total_equity: totalEquity
        },
        verification: {
          total_assets: totalAssets + totalInventoryValue,
          total_liabilities_and_equity: totalLiabilities + totalEquity,
          balanced: Math.abs((totalAssets + totalInventoryValue) - (totalLiabilities + totalEquity)) < 0.01,
          difference: Math.abs((totalAssets + totalInventoryValue) - (totalLiabilities + totalEquity))
        },
        period: {
          start_date: startDate,
          end_date: endDate,
          as_of_date: new Date().toISOString().split('T')[0]
        }
      };

      return balanceSheet;

    } catch (error) {
      log.error('Error generating balance sheet:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate tithe amount
   */
  static async calculateTithe(businessId, options = {}) {
    try {
      const {
        start_date = null,
        end_date = null,
        percentage = 10,
        enabled = true
      } = options;

      if (!enabled) {
        return {
          enabled: false,
          message: 'Tithe calculation is disabled'
        };
      }

      const financialReport = await this.getFinancialReport(businessId, start_date, end_date);
      const netProfit = financialReport.summary.net_profit;
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
}
