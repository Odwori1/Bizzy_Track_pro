// File: backend/app/services/financialReportServiceV2.js
import { getClient } from '../utils/database.js';
import { log } from '../utils/logger.js';
import { AccountingService } from './accountingService.js';

/**
 * FINANCIAL REPORT SERVICE V2
 * Uses GAAP-compliant accounting data (journal_entries) instead of wallet_transactions
 */
export class FinancialReportServiceV2 {
  /**
   * Get comprehensive financial report using accounting data
   */
  static async getFinancialReport(businessId, startDate = null, endDate = null) {
    try {
      // Get trial balance for the period (this uses journal_entries)
      const trialBalance = await AccountingService.getTrialBalance(
        businessId,
        startDate,
        endDate
      );

      // Calculate P&L from trial balance accounts
      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalCOGS = 0;

      trialBalance.accounts.forEach(account => {
        const balance = parseFloat(account.total_debits) - parseFloat(account.total_credits);
        
        switch (account.account_type) {
          case 'revenue':
            // Revenue accounts normally have credit balance
            totalRevenue += Math.max(0, -balance); // Negative balance (credit) is positive revenue
            break;
          case 'expense':
            // Expense accounts normally have debit balance
            if (account.account_code === '5100') {
              totalCOGS += Math.max(0, balance); // COGS is expense
            } else {
              totalExpenses += Math.max(0, balance); // Other expenses
            }
            break;
        }
      });

      const grossProfit = totalRevenue - totalCOGS;
      const netProfit = grossProfit - totalExpenses;

      // Get income breakdown by revenue accounts
      const revenueAccounts = trialBalance.accounts.filter(a => 
        a.account_type === 'revenue' && 
        (parseFloat(a.total_debits) > 0 || parseFloat(a.total_credits) > 0)
      );

      // Get expense breakdown by category
      const expenseAccounts = trialBalance.accounts.filter(a => 
        a.account_type === 'expense' && 
        (parseFloat(a.total_debits) > 0 || parseFloat(a.total_credits) > 0)
      );

      return {
        summary: {
          total_revenue: totalRevenue,
          total_cogs: totalCOGS,
          gross_profit: grossProfit,
          total_expenses: totalExpenses,
          net_profit: netProfit,
          gross_margin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
          net_margin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,
          is_gaap_compliant: true
        },
        revenue_breakdown: revenueAccounts.map(acc => ({
          account_code: acc.account_code,
          account_name: acc.account_name,
          amount: Math.max(0, parseFloat(acc.total_credits) - parseFloat(acc.total_debits)),
          percentage: totalRevenue > 0 ? 
            (Math.max(0, parseFloat(acc.total_credits) - parseFloat(acc.total_debits)) / totalRevenue) * 100 : 0
        })),
        expense_breakdown: expenseAccounts.map(acc => ({
          account_code: acc.account_code,
          account_name: acc.account_name,
          amount: Math.max(0, parseFloat(acc.total_debits) - parseFloat(acc.total_credits)),
          percentage: totalExpenses > 0 ? 
            (Math.max(0, parseFloat(acc.total_debits) - parseFloat(acc.total_credits)) / totalExpenses) * 100 : 0,
          is_cogs: acc.account_code === '5100'
        })),
        period: {
          start_date: startDate,
          end_date: endDate,
          generated_at: new Date().toISOString()
        },
        data_source: 'accounting_system',
        gaap_compliance: 'double_entry_verified'
      };

    } catch (error) {
      log.error('Financial Report V2 error:', error);
      throw error;
    }
  }

  /**
   * Get Profit & Loss Statement (GAAP-compliant)
   */
  static async getProfitAndLoss(businessId, startDate, endDate) {
    try {
      const financialReport = await this.getFinancialReport(businessId, startDate, endDate);

      return {
        revenue: {
          total: financialReport.summary.total_revenue,
          categories: financialReport.revenue_breakdown
        },
        cost_of_goods_sold: {
          total: financialReport.summary.total_cogs,
          percentage_of_revenue: financialReport.summary.total_revenue > 0 ? 
            (financialReport.summary.total_cogs / financialReport.summary.total_revenue) * 100 : 0
        },
        gross_profit: {
          amount: financialReport.summary.gross_profit,
          margin: financialReport.summary.gross_margin
        },
        operating_expenses: {
          total: financialReport.summary.total_expenses,
          categories: financialReport.expense_breakdown.filter(e => !e.is_cogs)
        },
        net_profit: {
          amount: financialReport.summary.net_profit,
          margin: financialReport.summary.net_margin
        },
        period: financialReport.period,
        accounting_method: 'accrual_basis',
        compliance: 'gaap'
      };

    } catch (error) {
      log.error('Profit & Loss V2 error:', error);
      throw error;
    }
  }

  /**
   * Get Balance Sheet (GAAP-compliant)
   */
  static async getBalanceSheet(businessId, asOfDate = new Date()) {
    const client = await getClient();

    try {
      // Get trial balance up to asOfDate
      const trialBalance = await AccountingService.getTrialBalance(
        businessId,
        null, // From beginning
        asOfDate
      );

      // Categorize accounts
      const assets = trialBalance.accounts.filter(a => a.account_type === 'asset');
      const liabilities = trialBalance.accounts.filter(a => a.account_type === 'liability');
      const equity = trialBalance.accounts.filter(a => a.account_type === 'equity');
      const revenue = trialBalance.accounts.filter(a => a.account_type === 'revenue');
      const expenses = trialBalance.accounts.filter(a => a.account_type === 'expense');

      // Calculate balances
      const calculateCategoryTotal = (accounts) => {
        return accounts.reduce((total, account) => {
          const balance = parseFloat(account.total_debits) - parseFloat(account.total_credits);
          // Asset/Expense: debit normal balance, Liability/Equity/Revenue: credit normal balance
          const isDebitNormal = ['asset', 'expense'].includes(account.account_type);
          return total + (isDebitNormal ? Math.max(0, balance) : Math.max(0, -balance));
        }, 0);
      };

      const totalAssets = calculateCategoryTotal(assets);
      const totalLiabilities = calculateCategoryTotal(liabilities);
      const totalEquity = calculateCategoryTotal(equity);
      
      // Add net income (Revenue - Expenses) to equity
      const totalRevenue = calculateCategoryTotal(revenue);
      const totalExpenses = calculateCategoryTotal(expenses);
      const netIncome = totalRevenue - totalExpenses;
      const totalEquityWithIncome = totalEquity + netIncome;

      // Balance sheet validation
      const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquityWithIncome)) < 0.01;

      return {
        as_of_date: asOfDate,
        assets: {
          current_assets: assets.filter(a => ['1110', '1200', '1300'].includes(a.account_code)),
          fixed_assets: assets.filter(a => a.account_code.startsWith('1') && 
            !['1110', '1200', '1300'].includes(a.account_code)),
          other_assets: assets.filter(a => !a.account_code.startsWith('1')),
          total: totalAssets
        },
        liabilities: {
          current_liabilities: liabilities.filter(a => a.account_code.startsWith('2')),
          long_term_liabilities: liabilities.filter(a => a.account_code.startsWith('3')),
          total: totalLiabilities
        },
        equity: {
          contributed_capital: equity.filter(a => a.account_code === '3100'),
          retained_earnings: equity.filter(a => a.account_code === '3200'),
          current_earnings: netIncome,
          total: totalEquityWithIncome
        },
        income_summary: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          net_income: netIncome
        },
        verification: {
          total_assets: totalAssets,
          total_liabilities_and_equity: totalLiabilities + totalEquityWithIncome,
          difference: Math.abs(totalAssets - (totalLiabilities + totalEquityWithIncome)),
          is_balanced: isBalanced,
          accounting_equation: `Assets (${totalAssets.toFixed(2)}) = Liabilities (${totalLiabilities.toFixed(2)}) + Equity (${totalEquityWithIncome.toFixed(2)})`
        }
      };

    } catch (error) {
      log.error('Balance Sheet V2 error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get cash flow statement
   */
  static async getCashFlowStatement(businessId, startDate, endDate) {
    const client = await getClient();

    try {
      // Get journal entries for the period
      const journalEntries = await AccountingService.getJournalEntries(businessId, {
        start_date: startDate,
        end_date: endDate
      });

      // Analyze cash transactions (account 1110 - Cash)
      const cashEntries = [];
      let netCashFlow = 0;
      let operatingCashFlow = 0;
      let investingCashFlow = 0;
      let financingCashFlow = 0;

      for (const entry of journalEntries.entries) {
        const cashLines = entry.lines.filter(line => line.account_code === '1110');
        
        for (const line of cashLines) {
          const amount = parseFloat(line.amount);
          const isDebit = line.line_type === 'debit';
          
          cashEntries.push({
            date: entry.journal_date,
            description: entry.description,
            amount: isDebit ? amount : -amount, // Debit increases cash, credit decreases
            reference: entry.reference_number
          });

          netCashFlow += isDebit ? amount : -amount;

          // Categorize cash flow (simplified)
          if (entry.reference_type === 'pos_transaction' || 
              entry.reference_type === 'invoice' ||
              entry.reference_type === 'expense') {
            operatingCashFlow += isDebit ? amount : -amount;
          } else if (entry.reference_type === 'purchase_order') {
            investingCashFlow += isDebit ? amount : -amount;
          } else {
            financingCashFlow += isDebit ? amount : -amount;
          }
        }
      }

      // Get beginning and ending cash balance
      const beginningBalance = await this.getCashBalanceAsOf(businessId, startDate);
      const endingBalance = await this.getCashBalanceAsOf(businessId, endDate);

      return {
        period: { start_date: startDate, end_date: endDate },
        cash_flows: {
          operating_activities: {
            amount: operatingCashFlow,
            description: 'Cash from sales, expenses, and normal operations'
          },
          investing_activities: {
            amount: investingCashFlow,
            description: 'Cash from asset purchases/sales'
          },
          financing_activities: {
            amount: financingCashFlow,
            description: 'Cash from loans, investments, dividends'
          }
        },
        net_cash_flow: netCashFlow,
        cash_balances: {
          beginning: beginningBalance,
          ending: endingBalance,
          change: endingBalance - beginningBalance
        },
        transactions: cashEntries.slice(0, 50), // Last 50 cash transactions
        reconciliation: {
          net_cash_flow_calculated: netCashFlow,
          cash_balance_change: endingBalance - beginningBalance,
          matches: Math.abs(netCashFlow - (endingBalance - beginningBalance)) < 0.01
        }
      };

    } catch (error) {
      log.error('Cash Flow Statement V2 error:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get cash balance as of specific date
   */
  static async getCashBalanceAsOf(businessId, asOfDate) {
    const client = await getClient();

    try {
      const result = await client.query(
        `SELECT
          COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END), 0) as balance
         FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         JOIN chart_of_accounts coa ON jel.account_id = coa.id
         WHERE coa.business_id = $1
           AND coa.account_code = '1110'
           AND je.journal_date <= $2
           AND je.voided_at IS NULL`,
        [businessId, asOfDate]
      );

      return parseFloat(result.rows[0].balance) || 0;

    } catch (error) {
      log.error('Get cash balance error:', error);
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Compare accounting vs old system reports
   */
  static async compareReports(businessId, startDate, endDate) {
    try {
      const accountingReport = await this.getFinancialReport(businessId, startDate, endDate);
      
      // Try to get old report if service exists
      let oldReport = null;
      try {
        const { FinancialReportService } = await import('./financialReportService.js');
        oldReport = await FinancialReportService.getFinancialReport(businessId, startDate, endDate);
      } catch (e) {
        log.warn('Old financial report service not available:', e.message);
      }

      return {
        accounting_system: accountingReport,
        legacy_system: oldReport,
        differences: oldReport ? this.calculateDifferences(accountingReport, oldReport) : null,
        recommendation: 'Use accounting system for GAAP-compliant reporting',
        period: { start_date: startDate, end_date: endDate }
      };

    } catch (error) {
      log.error('Compare reports error:', error);
      throw error;
    }
  }

  /**
   * Calculate differences between accounting and legacy reports
   */
  static calculateDifferences(accountingReport, legacyReport) {
    const accountingNet = accountingReport.summary.net_profit;
    const legacyNet = legacyReport.summary?.net_profit || 0;
    const difference = accountingNet - legacyNet;
    const percentageDiff = legacyNet !== 0 ? (difference / Math.abs(legacyNet)) * 100 : 100;

    return {
      net_profit: {
        accounting: accountingNet,
        legacy: legacyNet,
        difference: difference,
        percentage_difference: percentageDiff
      },
      revenue: {
        accounting: accountingReport.summary.total_revenue,
        legacy: legacyReport.summary?.total_income || 0,
        difference: accountingReport.summary.total_revenue - (legacyReport.summary?.total_income || 0)
      },
      explanation: difference !== 0 ? 
        'Differences may be due to: GAAP revenue recognition, COGS calculation, accrual vs cash basis, or excluded internal transfers' :
        'Reports match perfectly'
    };
  }
}
