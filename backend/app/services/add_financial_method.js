const fs = require('fs');

const financialServicePath = 'financialReportService.js';
let content = fs.readFileSync(financialServicePath, 'utf8');

// Find the position to insert after getProfitAndLoss method
const insertPoint = content.indexOf('static async getProfitAndLoss(businessId, startDate, endDate) {');
const methodStart = content.lastIndexOf('static async', insertPoint);
const methodEnd = content.indexOf('}', content.indexOf('}', insertPoint)) + 1;

// Get the position after getProfitAndLoss method
const nextMethodStart = content.indexOf('static async', methodEnd);
const insertPosition = nextMethodStart > -1 ? nextMethodStart : content.lastIndexOf('}');

// The missing getBalanceSheet method
const newMethod = `
  /**
   * Get balance sheet report
   */
  static async getBalanceSheet(businessId, startDate, endDate) {
    const client = await getClient();
    try {
      // Get total assets (sum of all wallet balances)
      const assetsResult = await client.query(
        \`SELECT SUM(current_balance) as total_assets 
         FROM money_wallets 
         WHERE business_id = \$1 AND is_active = true\`,
        [businessId]
      );

      const totalAssets = parseFloat(assetsResult.rows[0].total_assets) || 0;

      // Get total liabilities (sum of unpaid expenses)
      const liabilitiesResult = await client.query(
        \`SELECT SUM(amount) as total_liabilities 
         FROM expenses 
         WHERE business_id = \$1 AND status != 'paid'\`,
        [businessId]
      );

      const totalLiabilities = parseFloat(liabilitiesResult.rows[0].total_liabilities) || 0;

      // Calculate equity (Assets - Liabilities)
      const totalEquity = totalAssets - totalLiabilities;

      // Get net income for the period for retained earnings calculation
      const incomeResult = await client.query(
        \`SELECT 
          COALESCE(SUM(
            CASE WHEN wt.transaction_type = 'income' THEN wt.amount 
                 WHEN wt.transaction_type = 'expense' THEN -wt.amount 
                 ELSE 0 END
          ), 0) as net_income
         FROM wallet_transactions wt
         INNER JOIN money_wallets mw ON wt.wallet_id = mw.id
         WHERE mw.business_id = \$1 
           AND wt.created_at BETWEEN \$2 AND \$3\`,
        [businessId, startDate, endDate]
      );

      const netIncome = parseFloat(incomeResult.rows[0].net_income) || 0;

      const balanceSheet = {
        assets: {
          current_assets: {
            cash_and_equivalents: totalAssets,
            accounts_receivable: 0, // Would need invoice data
            inventory: 0, // Would need inventory valuation
            total_current_assets: totalAssets
          },
          fixed_assets: {
            property_equipment: 0,
            total_fixed_assets: 0
          },
          total_assets: totalAssets
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
          total_assets: totalAssets,
          total_liabilities_and_equity: totalLiabilities + totalEquity,
          balanced: totalAssets === (totalLiabilities + totalEquity)
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
`;

// Insert the new method
const newContent = content.slice(0, insertPosition) + newMethod + content.slice(insertPosition);

fs.writeFileSync(financialServicePath, newContent);
console.log('✅ FinancialReportService.getBalanceSheet() implemented successfully!');
