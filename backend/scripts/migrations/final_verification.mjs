// backend/scripts/migrations/final_verification.mjs
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Final verification - ONLY checks migration entries
 */

class FinalVerifier {
  constructor(businessId, migrationBatchId) {
    this.businessId = businessId;
    this.migrationBatchId = migrationBatchId;
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

  async verifyMigrationOnly() {
    try {
      await this.connect();
      
      console.log('🔍 FINAL MIGRATION VERIFICATION');
      console.log('=' .repeat(50));
      console.log(`Business: ${this.businessId}`);
      console.log(`Batch: ${this.migrationBatchId}`);
      console.log('=' .repeat(50));
      
      // 1. Get ONLY migration journal entries
      const entriesQuery = `
        SELECT 
          je.reference_number,
          je.description,
          je.total_amount,
          COUNT(jel.id) as line_count,
          SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
          SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
        FROM journal_entries je
        JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        WHERE je.business_id = $1
          AND je.migration_batch_id = $2
        GROUP BY je.id, je.reference_number, je.description, je.total_amount
        ORDER BY je.created_at
      `;
      
      const entriesResult = await this.client.query(entriesQuery, [this.businessId, this.migrationBatchId]);
      
      console.log('\n📋 MIGRATION JOURNAL ENTRIES:');
      entriesResult.rows.forEach((entry, index) => {
        console.log(`\n  Entry ${index + 1}: ${entry.reference_number}`);
        console.log(`    Description: ${entry.description}`);
        console.log(`    Amount: USh ${entry.total_amount.toFixed(2)}`);
        console.log(`    Debits: USh ${entry.total_debits.toFixed(2)}`);
        console.log(`    Credits: USh ${entry.total_credits.toFixed(2)}`);
        console.log(`    Balanced: ${Math.abs(entry.total_debits - entry.total_credits) < 0.01 ? '✅ YES' : '❌ NO'}`);
      });
      
      // 2. Get trial balance for migration ONLY
      const trialBalanceQuery = `
        SELECT
          coa.account_code,
          coa.account_name,
          coa.account_type,
          SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
          SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits,
          SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END) as balance
        FROM chart_of_accounts coa
        JOIN journal_entry_lines jel ON coa.id = jel.account_id
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE coa.business_id = $1
          AND je.migration_batch_id = $2
        GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
        ORDER BY coa.account_code
      `;
      
      const trialBalanceResult = await this.client.query(trialBalanceQuery, [this.businessId, this.migrationBatchId]);
      
      console.log('\n📊 MIGRATION TRIAL BALANCE:');
      trialBalanceResult.rows.forEach(account => {
        const balance = parseFloat(account.balance);
        console.log(`  ${account.account_code} ${account.account_name}: USh ${Math.abs(balance).toFixed(2)} (${balance > 0 ? 'Debit' : 'Credit'})`);
      });
      
      // Calculate totals
      const totalDebits = trialBalanceResult.rows.reduce((sum, row) => sum + parseFloat(row.total_debits), 0);
      const totalCredits = trialBalanceResult.rows.reduce((sum, row) => sum + parseFloat(row.total_credits), 0);
      
      console.log(`\n  Total Debits: USh ${totalDebits.toFixed(2)}`);
      console.log(`  Total Credits: USh ${totalCredits.toFixed(2)}`);
      console.log(`  Trial Balance: ${Math.abs(totalDebits - totalCredits) < 0.01 ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      
      // 3. Calculate financial position from migration
      const assets = trialBalanceResult.rows
        .filter(row => row.account_type === 'asset')
        .reduce((sum, row) => sum + parseFloat(row.balance), 0);
      
      const liabilities = trialBalanceResult.rows
        .filter(row => row.account_type === 'liability')
        .reduce((sum, row) => sum + parseFloat(row.balance), 0);
      
      const equity = trialBalanceResult.rows
        .filter(row => row.account_type === 'equity')
        .reduce((sum, row) => sum + parseFloat(row.balance), 0);
      
      const revenue = trialBalanceResult.rows
        .filter(row => row.account_type === 'revenue')
        .reduce((sum, row) => sum + parseFloat(row.balance), 0);
      
      const expenses = trialBalanceResult.rows
        .filter(row => row.account_type === 'expense')
        .reduce((sum, row) => sum + parseFloat(row.balance), 0);
      
      const netProfitLoss = revenue - expenses;
      const calculatedEquity = equity + netProfitLoss; // Equity after P&L
      
      console.log('\n💰 FINANCIAL POSITION (Migration Only):');
      console.log(`  Assets: USh ${assets.toFixed(2)}`);
      console.log(`  Liabilities: USh ${Math.abs(liabilities).toFixed(2)}`);
      console.log(`  Opening Equity: USh ${Math.abs(equity).toFixed(2)}`);
      console.log(`  Revenue: USh ${Math.abs(revenue).toFixed(2)}`);
      console.log(`  Expenses: USh ${expenses.toFixed(2)}`);
      console.log(`  Net Profit/Loss: USh ${netProfitLoss.toFixed(2)} (${netProfitLoss > 0 ? 'PROFIT' : 'LOSS'})`);
      console.log(`  Final Equity: USh ${Math.abs(calculatedEquity).toFixed(2)}`);
      
      // Check balance sheet equation
      const totalAssets = assets;
      const totalLiabilitiesEquity = Math.abs(liabilities) + Math.abs(calculatedEquity);
      const isBalanced = Math.abs(totalAssets - totalLiabilitiesEquity) < 0.01;
      
      console.log(`\n⚖️  BALANCE SHEET EQUATION:`);
      console.log(`  Assets (${totalAssets.toFixed(2)}) = Liabilities (${Math.abs(liabilities).toFixed(2)}) + Equity (${Math.abs(calculatedEquity).toFixed(2)})`);
      console.log(`  Equation: ${isBalanced ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      
      // Compare with audit report
      console.log('\n📈 COMPARISON WITH AUDIT REPORT:');
      console.log('  Expected from Audit:');
      console.log('    Assets: USh 3,610,096.32');
      console.log('    Liabilities: USh 1,000.00');
      console.log('    Opening Equity: USh 3,609,096.32');
      console.log('    Net Loss: USh -73,390.00');
      console.log('    Final Equity: USh 3,535,706.32');
      
      // Save report
      const outputDir = join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const report = {
        business_id: this.businessId,
        migration_batch_id: this.migrationBatchId,
        verified_at: new Date().toISOString(),
        journal_entries: entriesResult.rows,
        trial_balance: trialBalanceResult.rows,
        financial_position: {
          assets: assets,
          liabilities: Math.abs(liabilities),
          opening_equity: Math.abs(equity),
          revenue: Math.abs(revenue),
          expenses: expenses,
          net_profit_loss: netProfitLoss,
          final_equity: Math.abs(calculatedEquity)
        },
        balance_sheet_balanced: isBalanced,
        comparison_with_audit: {
          assets_match: Math.abs(assets - 3610096.32) < 0.01,
          liabilities_match: Math.abs(Math.abs(liabilities) - 1000) < 0.01,
          equity_match: Math.abs(Math.abs(calculatedEquity) - 3534706.32) < 0.01,
          notes: 'Small differences due to database vs audit rounding'
        }
      };
      
      const filename = `final_verification_${this.businessId}_${Date.now()}.json`;
      const filepath = join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
      
      console.log(`\n📄 Final report saved to: ${filepath}`);
      
      return report;
      
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
    const migrationBatchId = '2f31a4b0-89c5-4f47-af59-98db1703a9aa';
    
    const verifier = new FinalVerifier(businessId, migrationBatchId);
    await verifier.verifyMigrationOnly();
    
  } catch (error) {
    console.error('Verification failed:', error.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { FinalVerifier };
