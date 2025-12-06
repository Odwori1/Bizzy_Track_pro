// backend/scripts/migrations/create_opening_journal_entries_clean.mjs
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
 * SIMPLIFIED VERSION: Uses proper UUIDs for all UUID columns
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
   * Create a single journal entry with audit trail - SIMPLIFIED
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
      
      // Generate unique UUID for this entry's reference_id
      const entryReferenceId = this.generateUUID();

      console.log(`Creating entry ${entryData.entry_number} with reference_id: ${entryReferenceId}`);

      // SIMPLIFIED INSERT: Only required columns
      const journalEntryResult = await this.client.query(
        `INSERT INTO journal_entries (
          business_id, description, journal_date, reference_number,
          reference_type, reference_id, total_amount, status, created_by,
          migration_batch_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          this.businessId,
          entryData.description,
          entryData.journal_date || new Date(),
          referenceNumber,
          'migration', // reference_type
          entryReferenceId, // Proper UUID
          totalDebits,
          'posted',
          this.userId,
          this.migrationBatchId
          // Skip migration_source_table and migration_source_id for now
        ]
      );

      const journalEntry = journalEntryResult.rows[0];

      // Create journal entry lines
      for (const line of entryData.lines) {
        const accountId = await this.getAccountId(line.account_code);
        
        await this.client.query(
          `INSERT INTO journal_entry_lines (
            journal_entry_id, business_id, account_id,
            line_type, amount, description
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            journalEntry.id,
            this.businessId,
            accountId,
            line.line_type,
            line.amount,
            line.description || ''
          ]
        );
      }

      // Simple audit log
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
            reference_number: journalEntry.reference_number
          }),
          JSON.stringify({
            migration_batch_id: this.migrationBatchId,
            entry_number: entryData.entry_number
          })
        ]
      );

      await this.client.query('COMMIT');

      console.log(`✅ Created Journal Entry ${entryData.entry_number}: ${journalEntry.reference_number}`);
      
      return {
        journal_entry_id: journalEntry.id,
        reference_number: journalEntry.reference_number,
        description: journalEntry.description,
        total_amount: journalEntry.total_amount
      };

    } catch (error) {
      await this.client.query('ROLLBACK');
      console.error(`❌ Failed to create journal entry ${entryData.entry_number}:`, error.message);
      throw error;
    }
  }

  /**
   * Execute the complete migration - SIMPLIFIED
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
      
      // Save the migration plan
      const outputDir = join(__dirname, 'output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const planFile = join(outputDir, `migration_plan_${this.businessId}_${Date.now()}.json`);
      fs.writeFileSync(planFile, JSON.stringify(migrationPlan, null, 2));
      console.log(`📄 Migration plan saved to: ${planFile}`);
      
      // Create the 4 journal entries
      console.log('\n📝 Step 2: Creating 4 journal entries...');
      
      const createdEntries = [];
      for (const entryData of migrationPlan.journal_entries) {
        const result = await this.createJournalEntry(entryData);
        createdEntries.push(result);
      }
      
      // Verify
      console.log('\n✅ Step 3: Verifying migration...');
      
      // Check accounting equation
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
      
      // Check count
      const countResult = await this.client.query(
        `SELECT COUNT(*) as entry_count FROM journal_entries WHERE business_id = $1 AND migration_batch_id = $2`,
        [this.businessId, this.migrationBatchId]
      );
      const entryCount = parseInt(countResult.rows[0].entry_count);
      
      // Save results
      const results = {
        migration_batch_id: this.migrationBatchId,
        business_id: this.businessId,
        user_id: this.userId,
        executed_at: new Date().toISOString(),
        created_entries: createdEntries,
        verification: {
          entry_count: entryCount,
          expected_count: 4,
          total_debits: totalDebits,
          total_credits: totalCredits,
          is_balanced: isBalanced,
          difference: Math.abs(totalDebits - totalCredits)
        }
      };
      
      const filename = `migration_results_${this.businessId}_${Date.now()}.json`;
      const filepath = join(outputDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
      
      // Print summary
      console.log('\n🎉 MIGRATION COMPLETE!');
      console.log('=' .repeat(50));
      
      console.log(`\n📋 Summary:`);
      console.log(`  Journal Entries Created: ${entryCount}/4`);
      console.log(`  Total Debits: USh ${totalDebits.toFixed(2)}`);
      console.log(`  Total Credits: USh ${totalCredits.toFixed(2)}`);
      console.log(`  Accounting Equation: ${isBalanced ? '✅ BALANCED' : '❌ UNBALANCED'}`);
      
      console.log(`\n📄 Results saved to: ${filepath}`);
      console.log(`🔧 Migration Batch ID: ${this.migrationBatchId}`);
      
      return results;
      
    } catch (error) {
      console.error('\n❌ MIGRATION FAILED:', error.message);
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
    const userId = 'b4af1699-0149-47e2-bc55-66214c0572ba';
    
    console.log('📝 ACCOUNTING MIGRATION TOOL - SIMPLIFIED');
    console.log('=' .repeat(50));
    
    const creator = new JournalEntryCreator(businessId, userId);
    await creator.executeMigration();
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { JournalEntryCreator };
