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
   * Get balance sheet — REWRITTEN (v18.0, Part 2.4 fix)
   *
   * Previously computed assets from money_wallets + inventory_items + fixed_assets
   * tables directly, and liabilities from `SUM(amount) FROM expenses WHERE status
   * != 'paid'` — a structural blind spot that could never see any ledger-recorded
   * liability (2100 Accounts Payable, 2120 Sales Tax Payable, 2130 WHT Payable,
   * etc), since those never appear as `expenses` rows. Confirmed live (2026-08-18,
   * business 90d29f85-...) to disagree with the ledger-derived balance sheet by
   * $19,840 in liabilities and $25,225 in assets on the same business, same date.
   *
   * Now sources every figure from get_balance_sheet() — the same GAAP-correct,
   * ledger-derived DB function FinancialStatementService.getBalanceSheet() uses
   * — and re-buckets the line items into this endpoint's richer categorized
   * shape (current vs fixed assets, current vs long-term liabilities, retained
   * earnings vs capital) so existing consumers (frontend, PDF/Excel export)
   * keep working unmodified while receiving correct numbers.
   *
   * Every account not explicitly named by the original shape lands in an
   * "other_*" bucket rather than being silently dropped, so nothing either
   * prior implementation surfaced is lost.
   *
   * asOfDate: uses endDate as the point-in-time balance sheet date, since a
   * balance sheet is a snapshot, not a period total. startDate is accepted
   * for API-contract compatibility but not used in the underlying query —
   * same limitation the old implementation had, just now stated explicitly.
   */
  static async getBalanceSheet(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      const asOfDate = endDate || new Date().toISOString().split('T')[0];

      const result = await client.query(
        `SELECT * FROM get_balance_sheet($1, $2, $3)`,
        [businessId, asOfDate, false]
      );

      const buckets = {
        cash_and_equivalents: 0,
        accounts_receivable: 0,
        inventory: 0,
        other_current_assets: 0,
        fixed_assets: 0,
        accounts_payable: 0,
        short_term_debt: 0,
        other_current_liabilities: 0,
        long_term_debt: 0,
        retained_earnings: 0,
        common_stock: 0,
        other_equity: 0
      };

      // Mapping confirmed against live chart_of_accounts (2026-08-18, 65 accounts).
      // Accumulated depreciation codes (1490-1495) are contra-asset but included
      // directly in fixed_assets — get_balance_sheet() already returns correctly
      // signed balances (confirmed via Migration 1518's contra-account handling),
      // so summing them in nets out correctly without special-casing the sign.
      const CASH_CODES = ['1110', '1120', '1130'];
      const AR_CODES = ['1200', '1115'];
      const INVENTORY_CODES = ['1300'];
      const FIXED_ASSET_CODES = [
        '1410', '1420', '1430', '1440', '1450', '1460', '1470', '1480',
        '1490', '1491', '1492', '1493', '1494', '1495'
      ];
      const AP_CODES = ['2100'];
      const SHORT_TERM_DEBT_CODES = ['2210'];
      const LONG_TERM_DEBT_CODES = ['2220'];
      const RETAINED_EARNINGS_CODES = ['3300', '3400'];
      const CAPITAL_CODES = ['3100', '3200'];

      const sourceAccounts = { assets: [], liabilities: [], equity: [] };

      for (const row of result.rows) {
        const code = row.account_code;
        const balance = parseFloat(row.current_balance);

        if (row.section === 'ASSETS') {
          sourceAccounts.assets.push(row);
          if (CASH_CODES.includes(code)) buckets.cash_and_equivalents += balance;
          else if (AR_CODES.includes(code)) buckets.accounts_receivable += balance;
          else if (INVENTORY_CODES.includes(code)) buckets.inventory += balance;
          else if (FIXED_ASSET_CODES.includes(code)) buckets.fixed_assets += balance;
          else buckets.other_current_assets += balance;
        } else if (row.section === 'LIABILITIES') {
          sourceAccounts.liabilities.push(row);
          if (AP_CODES.includes(code)) buckets.accounts_payable += balance;
          else if (SHORT_TERM_DEBT_CODES.includes(code)) buckets.short_term_debt += balance;
          else if (LONG_TERM_DEBT_CODES.includes(code)) buckets.long_term_debt += balance;
          else buckets.other_current_liabilities += balance;
        } else if (row.section === 'EQUITY') {
          sourceAccounts.equity.push(row);
          if (RETAINED_EARNINGS_CODES.includes(code)) buckets.retained_earnings += balance;
          else if (CAPITAL_CODES.includes(code)) buckets.common_stock += balance;
          else buckets.other_equity += balance;
        }
      }

      const totalCurrentAssets =
        buckets.cash_and_equivalents + buckets.accounts_receivable +
        buckets.inventory + buckets.other_current_assets;
      const totalFixedAssets = buckets.fixed_assets;
      const totalAssets = totalCurrentAssets + totalFixedAssets;

      const totalCurrentLiabilities =
        buckets.accounts_payable + buckets.short_term_debt + buckets.other_current_liabilities;
      const totalLongTermLiabilities = buckets.long_term_debt;
      const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

      const totalEquity = buckets.retained_earnings + buckets.common_stock + buckets.other_equity;

      return {
        assets: {
          current_assets: {
            cash_and_equivalents: buckets.cash_and_equivalents,
            accounts_receivable: buckets.accounts_receivable,
            inventory: buckets.inventory,
            other_current_assets: buckets.other_current_assets,
            total_current_assets: totalCurrentAssets
          },
          fixed_assets: {
            property_equipment: totalFixedAssets,
            total_fixed_assets: totalFixedAssets
          },
          total_assets: totalAssets
        },
        liabilities: {
          current_liabilities: {
            accounts_payable: buckets.accounts_payable,
            short_term_debt: buckets.short_term_debt,
            other_current_liabilities: buckets.other_current_liabilities,
            total_current_liabilities: totalCurrentLiabilities
          },
          long_term_liabilities: {
            long_term_debt: totalLongTermLiabilities,
            total_long_term_liabilities: totalLongTermLiabilities
          },
          total_liabilities: totalLiabilities
        },
        equity: {
          retained_earnings: buckets.retained_earnings,
          common_stock: buckets.common_stock,
          other_equity: buckets.other_equity,
          total_equity: totalEquity
        },
        verification: {
          total_assets: totalAssets,
          total_liabilities_and_equity: totalLiabilities + totalEquity,
          balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
          difference: Math.abs(totalAssets - (totalLiabilities + totalEquity))
        },
        period: {
          start_date: startDate,
          end_date: endDate,
          as_of_date: asOfDate
        },
        _source_accounts: sourceAccounts
      };

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
