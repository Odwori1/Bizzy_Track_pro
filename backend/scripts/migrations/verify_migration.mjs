// backend/scripts/migrations/verify_migration.mjs
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Verify accounting migration was successful
 * 
 * CHECKS:
 * 1. Accounting equation (Debits = Credits)
 * 2. All 4 journal entries created
 * 3. Trial balance matches legacy data
 * 4. Financial reports can be generated
 */

class MigrationVerifier {
  constructor(businessId) {
    this.businessId = businessId;
    this.pool = new Pool({
      host: 'localhost',
      port: 5434,
      database: 'bizzytrack_pro',
      user: 'postgres',
      password: '0791486006@postgres',
    });
  }

  async connect() {
    this.client = await this.pool.connect();
  }

  async disconnect() {
    if (this.client) {
      this.client.release();
    }
    await this.pool.end();
  }

  /**
   * Verify accounting equation
   */
  async verifyAccountingEquation() {
    const query = `
      SELECT 
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE je.business_id = $1
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    const totalDebits = parseFloat(result.rows[0].total_debits) || 0;
    const totalCredits = parseFloat(result.rows[0].total_credits) || 0;
    
    return {
      total_debits: totalDebits,
      total_credits: totalCredits,
      is_balanced: Math.abs(totalDebits - totalCredits) < 0.01,
      difference: Math.abs(totalDebits - totalCredits)
    };
  }

  /**
   * Check migration journal entries
   */
  async checkMigrationEntries() {
    const query = `
      SELECT 
        COUNT(*) as total_entries,
        COUNT(DISTINCT migration_batch_id) as batch_count,
        MIN(created_at) as first_entry,
        MAX(created_at) as last_entry
      FROM journal_entries 
      WHERE business_id = $1 
        AND migration_batch_id IS NOT NULL
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    
    // Get detailed entries
    const detailsQuery = `
      SELECT 
        reference_number,
        description,
        total_amount,
        journal_date,
        migration_batch_id
      FROM journal_entries 
      WHERE business_id = $1 
        AND migration_batch_id IS NOT NULL
      ORDER BY created_at
    `;
    
    const detailsResult = await this.client.query(detailsQuery, [this.businessId]);
    
    return {
      summary: result.rows[0],
      entries: detailsResult.rows
    };
  }

  /**
   * Generate trial balance report
   */
  async generateTrialBalance() {
    const query = `
      SELECT
        coa.account_code,
        coa.account_name,
        coa.account_type,
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits,
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) as balance,
        CASE 
          WHEN coa.account_type IN ('asset', 'expense') AND 
               SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) > 0 THEN 'Debit'
          WHEN coa.account_type IN ('liability', 'equity', 'revenue') AND 
               SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) < 0 THEN 'Credit'
          ELSE 'Zero'
        END as normal_balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE coa.business_id = $1
        AND coa.is_active = true
      GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
      HAVING SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) != 0
         OR SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) != 0
      ORDER BY coa.account_code
    `;
    
    const result = await this.client.query(query, [this.businessId]);
    
    // Calculate totals
    const totalDebits = result.rows.reduce((sum, row) => sum + parseFloat(row.total_debits), 0);
    const totalCredits = result.rows.reduce((sum, row) => sum + parseFloat(row.total_credits), 0);
    
    return {
      accounts: result.rows,
      summary: {
        total_debits: totalDebits,
        total_credits: totalCredits,
        is_balanced: Math.abs(totalDebits - totalCredits) < 0.01
      }
    };
  }

  /**
   * Generate financial position report
   */
  async generateFinancialPosition() {
    // Assets
    const assetsQuery = `
      SELECT 
        coa.account_code,
        coa.account_name,
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) as balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE coa.business_id = $1
        AND coa.account_type = 'asset'
        AND coa.is_active = true
      GROUP BY coa.id, coa.account_code, coa.account_name
      HAVING SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) != 0
      ORDER BY coa.account_code
    `;
    
    // Liabilities
    const liabilitiesQuery = `
      SELECT 
        coa.account_code,
        coa.account_name,
        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END) as balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE coa.business_id = $1
        AND coa.account_type = 'liability'
        AND coa.is_active = true
      GROUP BY coa.id, coa.account_code, coa.account_name
      HAVING SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END) != 0
      ORDER BY coa.account_code
    `;
    
    // Equity
    const equityQuery = `
      SELECT 
        coa.account_code,
        coa.account_name,
        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END) as balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE coa.business_id = $1
        AND coa.account_type = 'equity'
        AND coa.is_active = true
      GROUP BY coa.id, coa.account_code, coa.account_name
      HAVING SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END) != 0
      ORDER BY coa.account_code
    `;
    
    // Revenue & Expenses (P&L)
    const plQuery = `
      SELECT 
        coa.account_type,
        coa.account_code,
        coa.account_name,
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) as balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE coa.business_id = $1
        AND coa.account_type IN ('revenue', 'expense')
        AND coa.is_active = true
      GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
      HAVING SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) != 0
      ORDER BY coa.account_type, coa.account_code
    `;
    
    const [assetsResult, liabilitiesResult, equityResult, plResult] = await Promise.all([
      this.client.query(assetsQuery, [this.businessId]),
      this.client.query(liabilitiesQuery, [this.businessId]),
      this.client.query(equityQuery, [this.businessId]),
      this.client.query(plQuery, [this.businessId])
    ]);
    
    const totalAssets = assetsResult.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);
    const totalLiabilities = liabilitiesResult.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);
    const totalEquity = equityResult.rows.reduce((sum, row) => sum + parseFloat(row.balance), 0);
    
    // Calculate P&L
    let totalRevenue = 0;
    let totalExpenses = 0;
    
    plResult.rows.forEach(row => {
      if (row.account_type === 'revenue') {
        totalRevenue += parseFloat(row.balance);
      } else if (row.account_type === 'expense') {
        totalExpenses += parseFloat(row.balance);
      }
    });
    
    const netProfitLoss = totalRevenue - totalExpenses;
    
    return {
      balance_sheet: {
        assets: {
          items: assetsResult.rows,
          total: totalAssets
        },
        liabilities: {
          items: liabilitiesResult.rows,
          total: totalLiabilities
        },
        equity: {
          items: equityResult.rows,
          total: totalEquity
        },
        equation_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        equation_difference: Math.abs(totalAssets - (totalLiabilities + totalEquity))
      },
      profit_loss: {
        revenue: {
          items: plResult.rows.filter(r => r.account_type === 'revenue'),
          total: totalRevenue
        },
        expenses: {
          items: plResult.rows.filter(r => r.account_type === 'expense'),
          total: totalExpenses
        },
        net_profit_loss: netProfitLoss,
        is_profit: netProfitLoss > 0
      }
    };
  }

  /**
   * Compare with legacy data (reconciliation)
   */
  async reconcileWithLegacy() {
    // Get legacy data from the migration plan
    const outputDir = join(__dirname, 'output');
    const migrationFiles = fs.readdirSync(outputDir)
      .filter(file => file.includes('migration_plan') && file.includes(this.businessId))
      .sort()
      .reverse();
    
    if (migrationFiles.length === 0) {
      return { error: 'No migration plan found for comparison' };
    }
    
    const latestPlanFile = join(outputDir, migrationFiles[0]);
    const migrationPlan = JSON.parse(fs.readFileSync(latestPlanFile, 'utf8'));
    
    // Get current accounting data
    const financialPosition = await this.generateFinancialPosition();
    
    return {
      legacy_data: {
        assets: migrationPlan.assets,
        liabilities: migrationPlan.liabilities,
        revenue: migrationPlan.revenue,
        expenses: migrationPlan.expenses,
        cogs: migrationPlan.cogs
      },
      accounting_data: financialPosition,
      reconciliation: this.generateReconciliationReport(migrationPlan, financialPosition)
    };
  }

  generateReconciliationReport(legacyData, accountingData) {
    const report = {
      assets: {},
      liabilities: {},
      revenue: {},
      expenses: {},
      discrepancies: []
    };
    
    // Check assets
    const legacyAssets = 
      (legacyData.assets?.cash?.amount || 0) +
      (legacyData.assets?.fixed_assets?.amount || 0) +
      (legacyData.assets?.inventory?.amount || 0) +
      (legacyData.assets?.accounts_receivable?.amount || 0);
    
    const accountingAssets = accountingData.balance_sheet.assets.total;
    
    if (Math.abs(legacyAssets - accountingAssets) > 0.01) {
      report.discrepancies.push({
        item: 'Total Assets',
        legacy: legacyAssets,
        accounting: accountingAssets,
        difference: Math.abs(legacyAssets - accountingAssets)
      });
    }
    
    // Add more reconciliation checks as needed
    
    return report;
  }

  async verifyAll() {
    try {
      await this.connect();
      
      console.log('🔍 VERIFYING ACCOUNTING MIGRATION');
      console.log('=' .repeat(50));
      console.log(`Business: ${this.businessId}`);
      console.log(`Time: ${new Date().toISOString()}`);
      console.log('=' .repeat(50));
      
      // Run all verification checks
      console.log('\n1. Checking accounting equation...');
      const equation = await this.verifyAccountingEquation();
      console.log(`   Total Debits: USh ${equation.total_debits.toFixed(2)}`);
      console.log(`   Total Credits: USh ${equation.total_credits.toFixed(2)}`);
      console.log(`   Status: ${equation.is_balanced ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      
      console.log('\n2. Checking migration entries...');
      const migrationEntries = await this.checkMigrationEntries();
      console.log(`   Total Migration Entries: ${migrationEntries.summary.total_entries}`);
      console.log(`   Migration Batches: ${migrationEntries.summary.batch_count}`);
      
      console.log('\n3. Generating trial balance...');
      const trialBalance = await this.generateTrialBalance();
      console.log(`   Accounts with activity: ${trialBalance.accounts.length}`);
      console.log(`   Trial Balance: ${trialBalance.summary.is_balanced ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      
      console.log('\n4. Generating financial position...');
      const financials = await this.generateFinancialPosition();
      console.log(`   Total Assets: USh ${financials.balance_sheet.assets.total.toFixed(2)}`);
      console.log(`   Total Liabilities: USh ${financials.balance_sheet.liabilities.total.toFixed(2)}`);
      console.log(`   Total Equity: USh ${financials.balance_sheet.equity.total.toFixed(2)}`);
      console.log(`   Balance Sheet: ${financials.balance_sheet.equation_balanced ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      console.log(`   Net Profit/Loss: USh ${financials.profit_loss.net_profit_loss.toFixed(2)}`);
      console.log(`   Status: ${financials.profit_loss.is_profit ? 'PROFIT' : 'LOSS'}`);
      
      console.log('\n5. Reconciling with legacy data...');
      const reconciliation = await this.reconcileWithLegacy();
      
      // Save verification report
      const outputDir = join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const verificationReport = {
        business_id: this.businessId,
        verified_at: new Date().toISOString(),
        equation_verification: equation,
        migration_entries: migrationEntries,
        trial_balance: trialBalance,
        financial_position: financials,
        reconciliation: reconciliation
      };
      
      const filename = `verification_report_${this.businessId}_${Date.now()}.json`;
      const filepath = join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(verificationReport, null, 2));
      
      console.log('\n✅ VERIFICATION COMPLETE');
      console.log('=' .repeat(50));
      console.log(`\n📊 FINAL STATUS:`);
      console.log(`   Accounting Equation: ${equation.is_balanced ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Migration Entries: ${migrationEntries.summary.total_entries >= 4 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Trial Balance: ${trialBalance.summary.is_balanced ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Balance Sheet: ${financials.balance_sheet.equation_balanced ? '✅ PASS' : '❌ FAIL'}`);
      
      console.log(`\n📄 Report saved to: ${filepath}`);
      
      return verificationReport;
      
    } catch (error) {
      console.error('Verification failed:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// Main execution
async function main() {
  try {
    const businessId = '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    
    console.log('🔍 ACCOUNTING MIGRATION VERIFICATION TOOL');
    console.log('=' .repeat(50));
    
    const verifier = new MigrationVerifier(businessId);
    await verifier.verifyAll();
    
  } catch (error) {
    console.error('Verification failed:', error.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { MigrationVerifier };
