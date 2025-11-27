import { query, getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';

export class FinancialReportService {
  /**
   * Get comprehensive financial report - FIXED: Excludes internal transfers
   */
  static async getFinancialReport(businessId, startDate = null, endDate = null) {
    const client = await getClient();
    try {
      // FIXED: Exclude wallet transfers from income
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
           AND (wt.reference_type IS NULL OR wt.reference_type != 'wallet_transfer')
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
   * Get cash flow report - FIXED: Excludes internal transfers
   */
  static async getCashFlowReport(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      // FIXED: Exclude wallet transfers from income
      const incomeResult = await client.query(
        `SELECT
          DATE_TRUNC('month', created_at) as period,
          SUM(amount) as total_income
         FROM wallet_transactions
         WHERE business_id = $1
           AND transaction_type = 'income'
           AND (reference_type IS NULL OR reference_type != 'wallet_transfer')
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
   * Get profit and loss - FIXED: Uses corrected financial report
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
   * Get balance sheet - FIXED: Includes assets
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

      // NEW: Get fixed assets total
      const fixedAssetsResult = await client.query(
        `SELECT SUM(current_value) as total_fixed_assets
         FROM fixed_assets
         WHERE business_id = $1 AND is_active = true`,
        [businessId]
      );

      const totalFixedAssets = parseFloat(fixedAssetsResult.rows[0].total_fixed_assets) || 0;

      // Get total liabilities (sum of unpaid expenses)
      const liabilitiesResult = await client.query(
        `SELECT SUM(amount) as total_liabilities
         FROM expenses
         WHERE business_id = $1 AND status != 'paid'`,
        [businessId]
      );

      const totalLiabilities = parseFloat(liabilitiesResult.rows[0].total_liabilities) || 0;

      // Get net income for the period (FIXED: exclude internal transfers)
      const incomeResult = await client.query(
        `SELECT
          COALESCE(SUM(
            CASE WHEN wt.transaction_type = 'income' AND (wt.reference_type IS NULL OR wt.reference_type != 'wallet_transfer') THEN wt.amount
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
      const totalCurrentAssets = totalAssets + totalInventoryValue;
      const totalAllAssets = totalCurrentAssets + totalFixedAssets;
      const totalEquity = totalAllAssets - totalLiabilities;

      const balanceSheet = {
        assets: {
          current_assets: {
            cash_and_equivalents: totalAssets,
            accounts_receivable: 0,
            inventory: totalInventoryValue,
            total_current_assets: totalCurrentAssets
          },
          fixed_assets: {
            property_equipment: totalFixedAssets,
            total_fixed_assets: totalFixedAssets
          },
          total_assets: totalAllAssets
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
          total_assets: totalAllAssets,
          total_liabilities_and_equity: totalLiabilities + totalEquity,
          balanced: Math.abs(totalAllAssets - (totalLiabilities + totalEquity)) < 0.01,
          difference: Math.abs(totalAllAssets - (totalLiabilities + totalEquity))
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
   * Calculate tithe amount - FIXED: Uses corrected financial data
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

  /**
   * NEW: Get monthly summary for quick reports
   */
  static async getMonthlySummary(businessId) {
    const client = await getClient();
    try {
      const currentDate = new Date();
      const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const previousMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const previousMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

      // Get current month data
      const currentMonthIncome = await client.query(
        `SELECT SUM(amount) as total_income
         FROM wallet_transactions
         WHERE business_id = $1
           AND transaction_type = 'income'
           AND (reference_type IS NULL OR reference_type != 'wallet_transfer')
           AND created_at BETWEEN $2 AND $3`,
        [businessId, currentMonthStart, currentMonthEnd]
      );

      const currentMonthExpenses = await client.query(
        `SELECT SUM(amount) as total_expenses
         FROM expenses
         WHERE business_id = $1
           AND expense_date BETWEEN $2 AND $3`,
        [businessId, currentMonthStart, currentMonthEnd]
      );

      // Get previous month data
      const previousMonthIncome = await client.query(
        `SELECT SUM(amount) as total_income
         FROM wallet_transactions
         WHERE business_id = $1
           AND transaction_type = 'income'
           AND (reference_type IS NULL OR reference_type != 'wallet_transfer')
           AND created_at BETWEEN $2 AND $3`,
        [businessId, previousMonthStart, previousMonthEnd]
      );

      const previousMonthExpenses = await client.query(
        `SELECT SUM(amount) as total_expenses
         FROM expenses
         WHERE business_id = $1
           AND expense_date BETWEEN $2 AND $3`,
        [businessId, previousMonthStart, previousMonthEnd]
      );

      const currentIncome = parseFloat(currentMonthIncome.rows[0].total_income) || 0;
      const currentExpenses = parseFloat(currentMonthExpenses.rows[0].total_expenses) || 0;
      const currentNetProfit = currentIncome - currentExpenses;

      const previousIncome = parseFloat(previousMonthIncome.rows[0].total_income) || 0;
      const previousExpenses = parseFloat(previousMonthExpenses.rows[0].total_expenses) || 0;
      const previousNetProfit = previousIncome - previousExpenses;

      // Calculate trends
      const incomeTrend = previousIncome > 0 ? ((currentIncome - previousIncome) / previousIncome) * 100 : 0;
      const expenseTrend = previousExpenses > 0 ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 : 0;
      const profitTrend = previousNetProfit > 0 ? ((currentNetProfit - previousNetProfit) / previousNetProfit) * 100 : 0;

      return {
        current_month: {
          income: currentIncome,
          expenses: currentExpenses,
          net_profit: currentNetProfit,
          profit_margin: currentIncome > 0 ? (currentNetProfit / currentIncome) * 100 : 0
        },
        previous_month: {
          income: previousIncome,
          expenses: previousExpenses,
          net_profit: previousNetProfit,
          profit_margin: previousIncome > 0 ? (previousNetProfit / previousIncome) * 100 : 0
        },
        trends: {
          income: incomeTrend,
          expenses: expenseTrend,
          profit: profitTrend
        },
        period: {
          current_month: currentMonthStart.toISOString().split('T')[0],
          previous_month: previousMonthStart.toISOString().split('T')[0]
        }
      };
    } catch (error) {
      log.error('Error generating monthly summary:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * NEW: Get expense analysis for quick reports
   */
  static async getExpenseAnalysis(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      const expenseResult = await client.query(
        `SELECT
          ec.name as category_name,
          SUM(e.amount) as total_amount,
          COUNT(*) as expense_count,
          AVG(e.amount) as average_amount
         FROM expenses e
         INNER JOIN expense_categories ec ON e.category_id = ec.id
         WHERE e.business_id = $1
           AND e.expense_date BETWEEN $2 AND $3
         GROUP BY ec.name
         ORDER BY total_amount DESC`,
        [businessId, startDate, endDate]
      );

      // Get monthly trend
      const monthlyTrend = await client.query(
        `SELECT
          DATE_TRUNC('month', expense_date) as month,
          SUM(amount) as monthly_total
         FROM expenses
         WHERE business_id = $1
           AND expense_date BETWEEN $2 AND $3
         GROUP BY DATE_TRUNC('month', expense_date)
         ORDER BY month`,
        [businessId, startDate, endDate]
      );

      const totalExpenses = expenseResult.rows.reduce((sum, row) => sum + parseFloat(row.total_amount || 0), 0);

      return {
        categories: expenseResult.rows.map(row => ({
          category: row.category_name,
          amount: parseFloat(row.total_amount) || 0,
          count: parseInt(row.expense_count) || 0,
          average: parseFloat(row.average_amount) || 0,
          percentage: totalExpenses > 0 ? (parseFloat(row.total_amount) / totalExpenses) * 100 : 0
        })),
        summary: {
          total_expenses: totalExpenses,
          category_count: expenseResult.rows.length,
          average_per_category: totalExpenses > 0 ? totalExpenses / expenseResult.rows.length : 0
        },
        trends: {
          monthly: monthlyTrend.rows.map(row => ({
            month: row.month.toISOString().split('T')[0],
            amount: parseFloat(row.monthly_total) || 0
          }))
        },
        period: {
          start_date: startDate,
          end_date: endDate
        }
      };
    } catch (error) {
      log.error('Error generating expense analysis:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * NEW: Get revenue report for quick reports
   */
  static async getRevenueReport(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      const revenueResult = await client.query(
        `SELECT
          wallet_type,
          SUM(amount) as total_revenue,
          COUNT(*) as transaction_count,
          AVG(amount) as average_transaction
         FROM wallet_transactions wt
         INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
         WHERE wt.business_id = $1
           AND wt.transaction_type = 'income'
           AND (wt.reference_type IS NULL OR wt.reference_type != 'wallet_transfer')
           AND wt.created_at BETWEEN $2 AND $3
         GROUP BY wallet_type
         ORDER BY total_revenue DESC`,
        [businessId, startDate, endDate]
      );

      // Get monthly trend
      const monthlyTrend = await client.query(
        `SELECT
          DATE_TRUNC('month', created_at) as month,
          SUM(amount) as monthly_revenue
         FROM wallet_transactions
         WHERE business_id = $1
           AND transaction_type = 'income'
           AND (reference_type IS NULL OR reference_type != 'wallet_transfer')
           AND created_at BETWEEN $2 AND $3
         GROUP BY DATE_TRUNC('month', created_at)
         ORDER BY month`,
        [businessId, startDate, endDate]
      );

      const totalRevenue = revenueResult.rows.reduce((sum, row) => sum + parseFloat(row.total_revenue || 0), 0);

      return {
        sources: revenueResult.rows.map(row => ({
          source: row.wallet_type,
          amount: parseFloat(row.total_revenue) || 0,
          count: parseInt(row.transaction_count) || 0,
          average: parseFloat(row.average_transaction) || 0,
          percentage: totalRevenue > 0 ? (parseFloat(row.total_revenue) / totalRevenue) * 100 : 0
        })),
        summary: {
          total_revenue: totalRevenue,
          source_count: revenueResult.rows.length,
          average_per_source: totalRevenue > 0 ? totalRevenue / revenueResult.rows.length : 0
        },
        trends: {
          monthly: monthlyTrend.rows.map(row => ({
            month: row.month.toISOString().split('T')[0],
            revenue: parseFloat(row.monthly_revenue) || 0
          }))
        },
        period: {
          start_date: startDate,
          end_date: endDate
        }
      };
    } catch (error) {
      log.error('Error generating revenue report:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}
