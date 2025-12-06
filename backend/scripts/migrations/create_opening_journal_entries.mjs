// backend/scripts/migrations/create_opening_journal_entries.mjs - FIXED VERSION
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { OpeningBalanceCalculator } from './calculate_opening_balances.mjs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create opening journal entries for accounting migration
 * 
 * CREATES 4 JOURNAL ENTRIES:
 * 1. Opening Balances (Assets = Liabilities + Equity)
 * 2. Revenue Recognition (Split by type)
 * 3. COGS Recognition (Reduce inventory)
 * 4. Expense Recognition
 */

class JournalEntryCreator {
  constructor(businessId, userId) {
    this.businessId = businessId;
    this.userId = userId;
    this.pool = new Pool({
      host: 'localhost',
      port: 5434,
      database: 'bizzytrack_pro',
      user: 'postgres',
      password: '0791486006@postgres',
    });
    
    // Generate proper UUID for batch ID
    this.migrationBatchId = this.generateUUID();
    this.createdEntries = [];
    this.auditLogs = [];
  }

  // Simple UUID v4 generator
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
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
   * Get account ID from account code
   */
  async getAccountId(accountCode) {
    const query = `
      SELECT id FROM chart_of_accounts 
      WHERE business_id = $1 AND account_code = $2
    `;
    
    const result = await this.client.query(query, [this.businessId, accountCode]);
    
    if (result.rows.length === 0) {
      throw new Error(`Account not found: ${accountCode} for business ${this.businessId}`);
    }
    
    return result.rows[0].id;
  }

  /**
   * Create a single journal entry with audit trail
   */
  async createJournalEntry(entryData) {
    try {
      await this.client.query('BEGIN');

      // Validate debits = credits
      const totalDebits = entryData.lines
        .filter(line => line.line_type === 'debit')
        .reduce((sum, line) => sum + parseFloat(line.amount), 0);

      const totalCredits = entryData.lines
        .filter(line => line.line_type === 'credit')
        .reduce((sum, line) => sum + parseFloat(line.amount), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`Journal entry unbalanced: Debits ${totalDebits} ≠ Credits ${totalCredits}`);
      }

      // Generate reference number
      const referenceNumber = `JE-MIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create journal entry
      const journalEntryResult = await this.client.query(
        `INSERT INTO journal_entries (
          business_id, description, journal_date, reference_number,
          reference_type, reference_id, total_amount, status, created_by,
          migration_batch_id, migration_source_table, migration_source_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          this.businessId,
          entryData.description,
          entryData.journal_date || new Date(),
          referenceNumber,
          entryData.reference_type || 'migration',
          this.migrationBatchId, // Use batch ID as reference_id
          totalDebits,
          'posted',
          this.userId,
          this.migrationBatchId,
          'migration_script',
          entryData.entry_number?.toString() || '0'
        ]
      );

      const journalEntry = journalEntryResult.rows[0];

      // Create journal entry lines
      const journalEntryLines = [];
      for (const line of entryData.lines) {
        const accountId = await this.getAccountId(line.account_code);
        
        const lineResult = await this.client.query(
          `INSERT INTO journal_entry_lines (
            journal_entry_id, business_id, account_id,
            line_type, amount, description
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            journalEntry.id,
            this.businessId,
            accountId,
            line.line_type,
            line.amount,
            line.description || ''
          ]
        );

        journalEntryLines.push(lineResult.rows[0]);
      }

      // Create audit log
      await this.client.query(
        `INSERT INTO audit_logs (
          business_id, user_id, action, resource_type, resource_id,
          old_values, new_values, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          this.businessId,
          this.userId,
          'accounting.migration.journal_entry.created',
          'journal_entry',
          journalEntry.id,
          '{}',
          JSON.stringify({
            description: journalEntry.description,
            total_amount: journalEntry.total_amount,
            reference_number: journalEntry.reference_number,
            line_count: journalEntryLines.length
          }),
          JSON.stringify({
            migration_batch_id: this.migrationBatchId,
            entry_number: entryData.entry_number,
            source: 'legacy_data_migration'
          })
        ]
      );

      await this.client.query('COMMIT');

      const result = {
        journal_entry: journalEntry,
        lines: journalEntryLines,
        summary: {
          total_debits: totalDebits,
          total_credits: totalCredits,
          is_balanced: Math.abs(totalDebits - totalCredits) < 0.01
        }
      };

      this.createdEntries.push(result);
      this.auditLogs.push({
        action: 'journal_entry_created',
        entry_number: entryData.entry_number,
        journal_entry_id: journalEntry.id,
        reference_number: journalEntry.reference_number,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Created Journal Entry ${entryData.entry_number}: ${journalEntry.reference_number}`);
      
      return result;

    } catch (error) {
      await this.client.query('ROLLBACK');
      console.error(`❌ Failed to create journal entry ${entryData.entry_number}:`, error.message);
      throw error;
    }
  }

  /**
   * Create migration audit record
   */
  async createMigrationAudit(plan, status, error = null) {
    const query = `
      INSERT INTO data_migration_audit (
        migration_batch_id, business_id, migration_type,
        description, records_processed, total_amount,
        status, started_at, completed_at, created_by,
        error_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const totalAmount = 
      (plan.assets?.cash?.amount || 0) +
      (plan.assets?.fixed_assets?.amount || 0) +
      (plan.assets?.inventory?.amount || 0) +
      (plan.assets?.accounts_receivable?.amount || 0);

    const result = await this.client.query(query, [
      this.migrationBatchId,
      this.businessId,
      'opening_balances',
      'Legacy Data to Accounting Migration',
      this.createdEntries.length,
      totalAmount,
      status,
      new Date(), // started_at
      status === 'completed' ? new Date() : null,
      this.userId,
      error ? JSON.stringify({ message: error.message, stack: error.stack }) : null
    ]);

    return result.rows[0];
  }

  /**
   * Verify migration was successful
   */
  async verifyMigration() {
    console.log('\n🔍 Verifying migration...');
    
    // 1. Check accounting equation
    const equationQuery = `
      SELECT 
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE je.business_id = $1 
        AND je.migration_batch_id = $2
    `;
    
    const equationResult = await this.client.query(equationQuery, [this.businessId, this.migrationBatchId]);
    const totalDebits = parseFloat(equationResult.rows[0].total_debits) || 0;
    const totalCredits = parseFloat(equationResult.rows[0].total_credits) || 0;
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
    
    // 2. Check journal entry count
    const countQuery = `
      SELECT COUNT(*) as entry_count
      FROM journal_entries 
      WHERE business_id = $1 AND migration_batch_id = $2
    `;
    
    const countResult = await this.client.query(countQuery, [this.businessId, this.migrationBatchId]);
    const entryCount = parseInt(countResult.rows[0].entry_count);
    
    // 3. Get trial balance
    const trialBalanceQuery = `
      SELECT
        coa.account_code,
        coa.account_name,
        coa.account_type,
        COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0) as total_credits
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
      LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
      WHERE coa.business_id = $1
        AND (je.migration_batch_id = $2 OR je.migration_batch_id IS NULL)
        AND coa.is_active = true
      GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
      HAVING COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0) != 0
         OR COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0) != 0
      ORDER BY coa.account_code
    `;
    
    const trialBalanceResult = await this.client.query(trialBalanceQuery, [this.businessId, this.migrationBatchId]);
    
    return {
      accounting_equation: {
        total_debits: totalDebits,
        total_credits: totalCredits,
        is_balanced: isBalanced,
        difference: Math.abs(totalDebits - totalCredits)
      },
      entry_count: entryCount,
      expected_count: 4,
      trial_balance: trialBalanceResult.rows,
      migration_batch_id: this.migrationBatchId
    };
  }

  /**
   * Execute the complete migration
   */
  async executeMigration() {
    try {
      await this.connect();
      
      console.log('🚀 Starting Accounting Migration');
      console.log(`Business: ${this.businessId}`);
      console.log(`User: ${this.userId}`);
      console.log(`Batch ID: ${this.migrationBatchId}`);
      console.log('=' .repeat(50));
      
      // First, calculate the opening balances
      console.log('\n📊 Step 1: Calculating opening balances...');
      const calculator = new OpeningBalanceCalculator(this.businessId);
      const migrationPlan = await calculator.calculateAll();
      
      // Save the migration plan for reference
      const outputDir = join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const planFile = join(outputDir, `migration_plan_${this.businessId}_${Date.now()}.json`);
      fs.writeFileSync(planFile, JSON.stringify(migrationPlan, null, 2));
      
      // Create migration audit record
      await this.createMigrationAudit(migrationPlan, 'in_progress');
      
      // Create the 4 journal entries
      console.log('\n📝 Step 2: Creating journal entries...');
      
      for (const entryData of migrationPlan.journal_entries) {
        await this.createJournalEntry(entryData);
      }
      
      // Verify migration
      console.log('\n✅ Step 3: Verifying migration...');
      const verification = await this.verifyMigration();
      
      // Update migration audit to completed
      await this.createMigrationAudit(migrationPlan, 'completed');
      
      // Save results
      const results = {
        migration_batch_id: this.migrationBatchId,
        business_id: this.businessId,
        user_id: this.userId,
        executed_at: new Date().toISOString(),
        migration_plan_file: planFile,
        created_entries: this.createdEntries.map(e => ({
          journal_entry_id: e.journal_entry.id,
          reference_number: e.journal_entry.reference_number,
          description: e.journal_entry.description
        })),
        verification: verification,
        audit_logs: this.auditLogs
      };
      
      const filename = `migration_results_${this.businessId}_${Date.now()}.json`;
      const filepath = join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
      
      // Print summary
      console.log('\n🎉 MIGRATION COMPLETE!');
      console.log('=' .repeat(50));
      
      console.log(`\n📋 Summary:`);
      console.log(`  Journal Entries Created: ${verification.entry_count}/4`);
      console.log(`  Total Debits: USh ${verification.accounting_equation.total_debits.toFixed(2)}`);
      console.log(`  Total Credits: USh ${verification.accounting_equation.total_credits.toFixed(2)}`);
      console.log(`  Accounting Equation: ${verification.accounting_equation.is_balanced ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      
      console.log(`\n📊 Trial Balance Summary:`);
      verification.trial_balance.forEach(account => {
        const balance = account.total_debits - account.total_credits;
        console.log(`  ${account.account_code} ${account.account_name}: USh ${balance.toFixed(2)} (${balance > 0 ? 'Debit' : 'Credit'})`);
      });
      
      console.log(`\n📄 Results saved to: ${filepath}`);
      console.log(`🔧 Migration Batch ID: ${this.migrationBatchId}`);
      
      return results;
      
    } catch (error) {
      console.error('\n❌ MIGRATION FAILED:', error);
      
      try {
        await this.createMigrationAudit({}, 'failed', error);
      } catch (auditError) {
        console.error('Failed to create audit log:', auditError);
      }
      
      throw error;
      
    } finally {
      await this.disconnect();
    }
  }
}

// Main execution
async function main() {
  try {
    // Get business ID and user ID from command line or use defaults
    const businessId = process.argv[2] || '243a15b5-255a-4852-83bf-5cb46aa62b5e';
    const userId = process.argv[3] || 'b4af1699-0149-47e2-bc55-66214c0572ba'; // From login response
    
    if (!businessId || !userId) {
      console.error('Usage: node create_opening_journal_entries.mjs <business_id> <user_id>');
      console.error('Or use defaults for test business');
      process.exit(1);
    }
    
    console.log('📝 ACCOUNTING MIGRATION TOOL');
    console.log('=' .repeat(50));
    
    const creator = new JournalEntryCreator(businessId, userId);
    await creator.executeMigration();
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { JournalEntryCreator };
