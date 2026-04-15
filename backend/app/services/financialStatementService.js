// File: backend/app/services/financialStatementService.js
// Pattern follows: openingBalanceService.js, taxService.js
// Purpose: Financial statement generation service

import { getClient } from '../utils/database.js';
import { auditLogger } from '../utils/auditLogger.js';
import { log } from '../utils/logger.js';

export class FinancialStatementService {

    /**
     * Get Profit & Loss Statement (Income Statement)
     * @param {string} businessId - Business UUID
     * @param {Date|string} startDate - Start date for period
     * @param {Date|string} endDate - End date for period
     * @param {boolean} compareWithPrevious - Include previous period comparison
     * @returns {Promise<Object>} Formatted P&L statement
     */
    static async getProfitLoss(businessId, startDate, endDate, compareWithPrevious = false) {
        const client = await getClient();

        try {
            let result;
            
            if (compareWithPrevious) {
                result = await client.query(
                    `SELECT * FROM get_profit_loss_with_comparison($1, $2, $3)`,
                    [businessId, startDate, endDate]
                );
            } else {
                result = await client.query(
                    `SELECT * FROM get_profit_loss($1, $2, $3, $4)`,
                    [businessId, startDate, endDate, false]
                );
            }

            // Process results into sections
            const revenue = [];
            const cogs = [];
            const expenses = [];

            let totalRevenue = 0;
            let totalCogs = 0;
            let totalExpenses = 0;

            for (const row of result.rows) {
                const item = {
                    account_code: row.account_code,
                    account_name: row.account_name,
                    current_amount: parseFloat(row.current_amount),
                    previous_amount: parseFloat(row.previous_amount || 0),
                    change_percentage: parseFloat(row.change_percentage || 0)
                };

                if (row.section === 'REVENUE') {
                    revenue.push(item);
                    totalRevenue += item.current_amount;
                } else if (row.section === 'COGS') {
                    cogs.push(item);
                    totalCogs += item.current_amount;
                } else if (row.section === 'EXPENSE') {
                    expenses.push(item);
                    totalExpenses += item.current_amount;
                }
            }

            const grossProfit = totalRevenue - totalCogs;
            const netProfit = grossProfit - totalExpenses;

            // Log audit
            await auditLogger.logAction({
                businessId,
                action: 'financial_statement.profit_loss.viewed',
                resourceType: 'report',
                newValues: {
                    start_date: startDate,
                    end_date: endDate,
                    total_revenue: totalRevenue,
                    total_expenses: totalExpenses,
                    net_profit: netProfit
                }
            });

            log.info('Profit & Loss statement generated', {
                businessId,
                startDate,
                endDate,
                totalRevenue,
                netProfit
            });

            return {
                success: true,
                period: {
                    start_date: startDate,
                    end_date: endDate
                },
                revenue: {
                    items: revenue,
                    total: totalRevenue
                },
                cost_of_goods_sold: {
                    items: cogs,
                    total: totalCogs
                },
                gross_profit: grossProfit,
                expenses: {
                    items: expenses,
                    total: totalExpenses
                },
                net_profit: netProfit,
                has_comparison: compareWithPrevious
            };

        } catch (error) {
            log.error('Error getting profit & loss statement:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get Balance Sheet
     * @param {string} businessId - Business UUID
     * @param {Date|string} asOfDate - Date for balance sheet
     * @param {boolean} includeComparative - Include prior year comparison
     * @returns {Promise<Object>} Formatted balance sheet
     */
    static async getBalanceSheet(businessId, asOfDate, includeComparative = false) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_balance_sheet($1, $2, $3)`,
                [businessId, asOfDate, includeComparative]
            );

            const assets = [];
            const liabilities = [];
            const equity = [];

            let totalAssets = 0;
            let totalLiabilities = 0;
            let totalEquity = 0;

            for (const row of result.rows) {
                const item = {
                    account_code: row.account_code,
                    account_name: row.account_name,
                    current_balance: parseFloat(row.current_balance),
                    previous_balance: parseFloat(row.previous_balance || 0)
                };

                if (row.section === 'ASSETS') {
                    assets.push(item);
                    totalAssets += item.current_balance;
                } else if (row.section === 'LIABILITIES') {
                    liabilities.push(item);
                    totalLiabilities += item.current_balance;
                } else if (row.section === 'EQUITY') {
                    equity.push(item);
                    totalEquity += item.current_balance;
                }
            }

            // Log audit
            await auditLogger.logAction({
                businessId,
                action: 'financial_statement.balance_sheet.viewed',
                resourceType: 'report',
                newValues: {
                    as_of_date: asOfDate,
                    total_assets: totalAssets,
                    total_liabilities: totalLiabilities,
                    total_equity: totalEquity
                }
            });

            log.info('Balance sheet generated', {
                businessId,
                asOfDate,
                totalAssets,
                totalLiabilities,
                totalEquity
            });

            return {
                success: true,
                as_of_date: asOfDate,
                assets: {
                    items: assets,
                    total: totalAssets
                },
                liabilities: {
                    items: liabilities,
                    total: totalLiabilities
                },
                equity: {
                    items: equity,
                    total: totalEquity
                },
                accounting_equation_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
                has_comparison: includeComparative
            };

        } catch (error) {
            log.error('Error getting balance sheet:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get Cash Flow Statement
     * @param {string} businessId - Business UUID
     * @param {Date|string} startDate - Start date for period
     * @param {Date|string} endDate - End date for period
     * @returns {Promise<Object>} Formatted cash flow statement
     */
    static async getCashFlow(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_cash_flow($1, $2, $3)`,
                [businessId, startDate, endDate]
            );

            const operatingActivities = [];
            let netCashOperating = 0;

            for (const row of result.rows) {
                const amount = parseFloat(row.amount);
                operatingActivities.push({
                    description: row.description,
                    amount: amount
                });
                if (row.description === 'Net Cash from Operating Activities') {
                    netCashOperating = amount;
                }
            }

            // Log audit
            await auditLogger.logAction({
                businessId,
                action: 'financial_statement.cash_flow.viewed',
                resourceType: 'report',
                newValues: {
                    start_date: startDate,
                    end_date: endDate,
                    net_cash_operating: netCashOperating
                }
            });

            log.info('Cash flow statement generated', {
                businessId,
                startDate,
                endDate,
                netCashOperating
            });

            return {
                success: true,
                period: {
                    start_date: startDate,
                    end_date: endDate
                },
                operating_activities: {
                    items: operatingActivities.filter(item => item.description !== 'Net Cash from Operating Activities'),
                    net_cash: netCashOperating
                }
            };

        } catch (error) {
            log.error('Error getting cash flow statement:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get Enhanced Trial Balance
     * @param {string} businessId - Business UUID
     * @param {Date|string} asOfDate - Date for trial balance
     * @param {boolean} includeZeroBalances - Include accounts with zero balance
     * @returns {Promise<Object>} Formatted trial balance
     */
    static async getTrialBalanceEnhanced(businessId, asOfDate, includeZeroBalances = false) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_trial_balance_enhanced($1, $2, $3)`,
                [businessId, asOfDate, includeZeroBalances]
            );

            const accounts = [];
            let totalOpeningDebits = 0;
            let totalOpeningCredits = 0;
            let totalPeriodDebits = 0;
            let totalPeriodCredits = 0;
            let totalClosingDebits = 0;
            let totalClosingCredits = 0;

            for (const row of result.rows) {
                const item = {
                    account_code: row.account_code,
                    account_name: row.account_name,
                    account_type: row.account_type,
                    opening_debits: parseFloat(row.opening_debits),
                    opening_credits: parseFloat(row.opening_credits),
                    period_debits: parseFloat(row.period_debits),
                    period_credits: parseFloat(row.period_credits),
                    closing_debits: parseFloat(row.closing_debits),
                    closing_credits: parseFloat(row.closing_credits)
                };

                accounts.push(item);

                totalOpeningDebits += item.opening_debits;
                totalOpeningCredits += item.opening_credits;
                totalPeriodDebits += item.period_debits;
                totalPeriodCredits += item.period_credits;
                totalClosingDebits += item.closing_debits;
                totalClosingCredits += item.closing_credits;
            }

            log.info('Enhanced trial balance generated', {
                businessId,
                asOfDate,
                accountCount: accounts.length,
                isBalanced: Math.abs(totalClosingDebits - totalClosingCredits) < 0.01
            });

            return {
                success: true,
                as_of_date: asOfDate,
                accounts: accounts,
                summary: {
                    opening: {
                        debits: totalOpeningDebits,
                        credits: totalOpeningCredits,
                        is_balanced: Math.abs(totalOpeningDebits - totalOpeningCredits) < 0.01
                    },
                    period: {
                        debits: totalPeriodDebits,
                        credits: totalPeriodCredits,
                        is_balanced: Math.abs(totalPeriodDebits - totalPeriodCredits) < 0.01
                    },
                    closing: {
                        debits: totalClosingDebits,
                        credits: totalClosingCredits,
                        is_balanced: Math.abs(totalClosingDebits - totalClosingCredits) < 0.01
                    }
                }
            };

        } catch (error) {
            log.error('Error getting enhanced trial balance:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get Financial Summary Dashboard
     * @param {string} businessId - Business UUID
     * @param {Date|string} startDate - Start date for period
     * @param {Date|string} endDate - End date for period
     * @returns {Promise<Object>} Financial summary metrics
     */
    static async getFinancialSummary(businessId, startDate, endDate) {
        const client = await getClient();

        try {
            const result = await client.query(
                `SELECT * FROM get_financial_summary($1, $2, $3)`,
                [businessId, startDate, endDate]
            );

            const metrics = {};
            for (const row of result.rows) {
                metrics[row.metric_name] = parseFloat(row.metric_value);
            }

            // Log audit
            await auditLogger.logAction({
                businessId,
                action: 'financial_statement.summary.viewed',
                resourceType: 'report',
                newValues: {
                    start_date: startDate,
                    end_date: endDate,
                    net_profit: metrics['Net Profit'] || 0,
                    total_assets: metrics['Total Assets'] || 0
                }
            });

            log.info('Financial summary generated', {
                businessId,
                startDate,
                endDate,
                netProfit: metrics['Net Profit']
            });

            return {
                success: true,
                period: {
                    start_date: startDate,
                    end_date: endDate
                },
                metrics: metrics,
                summary: {
                    revenue: metrics['Total Revenue'] || 0,
                    expenses: metrics['Total Expenses'] || 0,
                    net_profit: metrics['Net Profit'] || 0,
                    profit_margin: metrics['Profit Margin %'] || 0,
                    assets: metrics['Total Assets'] || 0,
                    liabilities: metrics['Total Liabilities'] || 0,
                    equity: metrics['Total Equity'] || 0,
                    current_ratio: metrics['Current Ratio'] || 0,
                    debt_to_equity: metrics['Debt to Equity'] || 0
                }
            };

        } catch (error) {
            log.error('Error getting financial summary:', error);
            throw error;
        } finally {
            client.release();
        }
    }
}

export default FinancialStatementService;
