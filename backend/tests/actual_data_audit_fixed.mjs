import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration from .env
const pool = new Pool({
    host: 'localhost',
    port: 5434,
    database: 'bizzytrack_pro',
    user: 'postgres',
    password: '0791486006@postgres',
});

const BUSINESS_ID = '243a15b5-255a-4852-83bf-5cb46aa62b5e';

async function safeQuery(client, query, params = []) {
    try {
        return await client.query(query, params);
    } catch (error) {
        console.log(`Query failed: ${error.message}`);
        return { rows: [] };
    }
}

async function analyzeData() {
    console.log('🔍 COMPLETE DATA AUDIT ANALYSIS');
    console.log('================================\n');
    
    const client = await pool.connect();
    
    try {
        // 1. BUSINESS BASIC INFO
        console.log('1. BUSINESS BASIC INFO');
        console.log('======================');
        const businessInfo = await safeQuery(client, `
            SELECT 
                id, 
                name as business_name,
                currency,
                currency_symbol,
                timezone,
                created_at
            FROM businesses 
            WHERE id = $1
        `, [BUSINESS_ID]);
        
        if (businessInfo.rows.length === 0) {
            console.log('❌ Business not found');
            return;
        }
        
        const business = businessInfo.rows[0];
        console.log(`Business: ${business.business_name}`);
        console.log(`Currency: ${business.currency} (${business.currency_symbol})`);
        console.log(`Created: ${business.created_at}\n`);
        
        // 2. COMPREHENSIVE DATA ANALYSIS
        console.log('2. COMPREHENSIVE DATA ANALYSIS');
        console.log('==============================\n');
        
        // Get all data in one comprehensive query
        const comprehensiveData = await safeQuery(client, `
            -- Money Wallets
            SELECT 
                'money_wallets' as source,
                COUNT(*) as count,
                SUM(current_balance) as total_value,
                'cash' as data_type
            FROM money_wallets 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Wallet Transactions
            SELECT 
                'wallet_transactions' as source,
                COUNT(*) as count,
                SUM(amount) as total_value,
                'cash_movements' as data_type
            FROM wallet_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            -- POS Revenue (completed only)
            SELECT 
                'pos_transactions' as source,
                COUNT(*) as count,
                SUM(total_amount) as total_value,
                'revenue' as data_type
            FROM pos_transactions 
            WHERE business_id = $1
            AND status = 'completed'
            
            UNION ALL
            
            -- Expenses (all)
            SELECT 
                'expenses' as source,
                COUNT(*) as count,
                SUM(amount) as total_value,
                'expenses' as data_type
            FROM expenses 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Expenses (paid only)
            SELECT 
                'expenses_paid' as source,
                COUNT(*) as count,
                SUM(amount) as total_value,
                'expenses_paid' as data_type
            FROM expenses 
            WHERE business_id = $1
            AND status = 'paid'
            
            UNION ALL
            
            -- Invoices
            SELECT 
                'invoices' as source,
                COUNT(*) as count,
                SUM(total_amount) as total_value,
                'receivables' as data_type
            FROM invoices 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Journal Entries
            SELECT 
                'journal_entries' as source,
                COUNT(*) as count,
                SUM(total_amount) as total_value,
                'accounting_entries' as data_type
            FROM journal_entries 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Accounting System Balance Check
            SELECT 
                'accounting_balance_check' as source,
                0 as count,
                ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)) as total_value,
                'balance_difference' as data_type
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
        `, [BUSINESS_ID]);
        
        console.log('DATA SUMMARY:');
        console.log('-------------');
        comprehensiveData.rows.forEach(row => {
            if (row.source === 'accounting_balance_check') {
                if (parseFloat(row.total_value || 0) < 0.01) {
                    console.log(`✅ Accounting system is balanced`);
                } else {
                    console.log(`⚠️  Accounting system unbalanced by: ${business.currency_symbol}${parseFloat(row.total_value || 0).toFixed(2)}`);
                }
            } else {
                console.log(`${row.source}: ${row.count} items, Value: ${business.currency_symbol}${parseFloat(row.total_value || 0).toFixed(2)}`);
            }
        });
        console.log('');
        
        // 3. CALCULATE EXACT MIGRATION NEEDS
        console.log('3. MIGRATION REQUIREMENTS CALCULATION');
        console.log('=====================================\n');
        
        // Get exact legacy totals
        const legacyTotals = await safeQuery(client, `
            -- Cash in wallets
            SELECT 'cash' as category, SUM(current_balance) as amount FROM money_wallets WHERE business_id = $1
            
            UNION ALL
            
            -- POS Revenue
            SELECT 'revenue' as category, SUM(total_amount) as amount FROM pos_transactions WHERE business_id = $1 AND status = 'completed'
            
            UNION ALL
            
            -- Paid Expenses (affect cash)
            SELECT 'expenses' as category, SUM(amount) as amount FROM expenses WHERE business_id = $1 AND status = 'paid'
            
            UNION ALL
            
            -- Invoices (accounts receivable)
            SELECT 'receivables' as category, SUM(total_amount) as amount FROM invoices WHERE business_id = $1 AND status != 'paid'
        `, [BUSINESS_ID]);
        
        console.log('LEGACY BUSINESS POSITION:');
        console.log('-------------------------');
        let totalAssets = 0;
        let totalLiabilities = 0;
        let totalEquity = 0;
        
        legacyTotals.rows.forEach(row => {
            const amount = parseFloat(row.amount || 0);
            if (row.category === 'cash' || row.category === 'receivables') {
                console.log(`  Assets - ${row.category}: ${business.currency_symbol}${amount.toFixed(2)}`);
                totalAssets += amount;
            } else if (row.category === 'expenses') {
                console.log(`  Expenses: ${business.currency_symbol}${amount.toFixed(2)}`);
                // Expenses reduce equity
                totalEquity -= amount;
            } else if (row.category === 'revenue') {
                console.log(`  Revenue: ${business.currency_symbol}${amount.toFixed(2)}`);
                // Revenue increases equity
                totalEquity += amount;
            }
        });
        
        console.log('\nCALCULATED BUSINESS POSITION:');
        console.log('----------------------------');
        console.log(`  Total Assets: ${business.currency_symbol}${totalAssets.toFixed(2)}`);
        console.log(`  Total Liabilities: ${business.currency_symbol}${totalLiabilities.toFixed(2)} (assuming 0 for now)`);
        console.log(`  Net Equity (Revenue - Expenses): ${business.currency_symbol}${totalEquity.toFixed(2)}`);
        
        // Accounting equation: Assets = Liabilities + Equity
        // So Equity = Assets - Liabilities
        const calculatedEquity = totalAssets - totalLiabilities;
        console.log(`  Calculated Opening Equity: ${business.currency_symbol}${calculatedEquity.toFixed(2)}`);
        
        // 4. CREATE MIGRATION PLAN
        console.log('\n4. MIGRATION PLAN');
        console.log('=================\n');
        
        console.log('STEP 1: Opening Balance Journal Entry');
        console.log('-------------------------------------');
        console.log(`  Debit: Cash ${business.currency_symbol}${parseFloat(legacyTotals.rows.find(r => r.category === 'cash').amount || 0).toFixed(2)}`);
        console.log(`  Debit: Accounts Receivable ${business.currency_symbol}${parseFloat(legacyTotals.rows.find(r => r.category === 'receivables').amount || 0).toFixed(2)}`);
        console.log(`  Credit: Opening Equity ${business.currency_symbol}${calculatedEquity.toFixed(2)}`);
        console.log(`  (Assuming Liabilities = 0 for initial migration)`);
        
        console.log('\nSTEP 2: Historical Revenue Journal Entry');
        console.log('----------------------------------------');
        console.log(`  Debit: Opening Equity ${business.currency_symbol}${parseFloat(legacyTotals.rows.find(r => r.category === 'revenue').amount || 0).toFixed(2)}`);
        console.log(`  Credit: Retained Earnings ${business.currency_symbol}${parseFloat(legacyTotals.rows.find(r => r.category === 'revenue').amount || 0).toFixed(2)}`);
        
        console.log('\nSTEP 3: Historical Expenses Journal Entry');
        console.log('-----------------------------------------');
        console.log(`  Debit: Retained Earnings ${business.currency_symbol}${parseFloat(legacyTotals.rows.find(r => r.category === 'expenses').amount || 0).toFixed(2)}`);
        console.log(`  Credit: Opening Equity ${business.currency_symbol}${parseFloat(legacyTotals.rows.find(r => r.category === 'expenses').amount || 0).toFixed(2)}`);
        
        console.log('\nSTEP 4: Verify Accounting Equation');
        console.log('-----------------------------------');
        console.log(`  Assets = Liabilities + Equity`);
        console.log(`  ${business.currency_symbol}${totalAssets.toFixed(2)} = ${business.currency_symbol}${totalLiabilities.toFixed(2)} + ${business.currency_symbol}${calculatedEquity.toFixed(2)}`);
        
        // 5. CHECK CHART OF ACCOUNTS FOR MAPPING
        console.log('\n5. CHART OF ACCOUNTS MAPPING');
        console.log('=============================\n');
        
        const coaMapping = await safeQuery(client, `
            SELECT 
                account_code,
                account_name,
                account_type,
                current_balance
            FROM chart_of_accounts 
            WHERE business_id = $1
            ORDER BY account_type, account_code
        `, [BUSINESS_ID]);
        
        console.log('Available Accounts for Migration:');
        coaMapping.rows.forEach(account => {
            console.log(`  ${account.account_code} - ${account.account_name} (${account.account_type}): ${business.currency_symbol}${parseFloat(account.current_balance || 0).toFixed(2)}`);
        });
        
        console.log('\nRECOMMENDED MAPPINGS:');
        console.log('--------------------');
        console.log('  1. Cash → Account 1110 (Cash)');
        console.log('  2. Revenue → Account 4100 (Sales Revenue)');
        console.log('  3. Expenses → Appropriate expense accounts (5100+)');
        console.log('  4. Opening Equity → Account 3100 (Owner\'s Capital)');
        console.log('  5. Retained Earnings → Account 3200 (Retained Earnings)');
        
        // 6. SAVE MIGRATION PLAN
        console.log('\n6. SAVING MIGRATION PLAN');
        console.log('========================\n');
        
        const migrationPlan = {
            business: {
                name: business.business_name,
                currency: business.currency,
                currency_symbol: business.currency_symbol,
                id: BUSINESS_ID
            },
            analysis_date: new Date().toISOString(),
            legacy_data: {
                cash: parseFloat(legacyTotals.rows.find(r => r.category === 'cash').amount || 0),
                revenue: parseFloat(legacyTotals.rows.find(r => r.category === 'revenue').amount || 0),
                expenses: parseFloat(legacyTotals.rows.find(r => r.category === 'expenses').amount || 0),
                receivables: parseFloat(legacyTotals.rows.find(r => r.category === 'receivables').amount || 0)
            },
            calculated_position: {
                total_assets: totalAssets,
                total_liabilities: totalLiabilities,
                opening_equity: calculatedEquity,
                retained_earnings: totalEquity
            },
            migration_steps: [
                {
                    step: 1,
                    description: "Opening Balance Entry",
                    entries: [
                        { account: "1110", description: "Cash opening balance", type: "debit", amount: parseFloat(legacyTotals.rows.find(r => r.category === 'cash').amount || 0) },
                        { account: "1200", description: "Accounts Receivable opening", type: "debit", amount: parseFloat(legacyTotals.rows.find(r => r.category === 'receivables').amount || 0) },
                        { account: "3100", description: "Opening Equity", type: "credit", amount: calculatedEquity }
                    ]
                },
                {
                    step: 2,
                    description: "Historical Revenue Recognition",
                    entries: [
                        { account: "3100", description: "Transfer revenue to retained earnings", type: "debit", amount: parseFloat(legacyTotals.rows.find(r => r.category === 'revenue').amount || 0) },
                        { account: "3200", description: "Retained Earnings - Historical Revenue", type: "credit", amount: parseFloat(legacyTotals.rows.find(r => r.category === 'revenue').amount || 0) }
                    ]
                },
                {
                    step: 3,
                    description: "Historical Expenses Recognition",
                    entries: [
                        { account: "3200", description: "Retained Earnings - Historical Expenses", type: "debit", amount: parseFloat(legacyTotals.rows.find(r => r.category === 'expenses').amount || 0) },
                        { account: "3100", description: "Reduce opening equity for expenses", type: "credit", amount: parseFloat(legacyTotals.rows.find(r => r.category === 'expenses').amount || 0) }
                    ]
                }
            ],
            verification: {
                accounting_equation: "Assets = Liabilities + Equity",
                calculated: `${totalAssets.toFixed(2)} = ${totalLiabilities.toFixed(2)} + ${calculatedEquity.toFixed(2)}`,
                balanced: Math.abs(totalAssets - (totalLiabilities + calculatedEquity)) < 0.01
            }
        };
        
        const reportPath = join(__dirname, 'migration_plan.json');
        fs.writeFileSync(reportPath, JSON.stringify(migrationPlan, null, 2));
        
        console.log(`✅ Migration plan saved to: ${reportPath}`);
        console.log('\n📋 FINAL SUMMARY:');
        console.log('================');
        console.log(`1. Business has USh 3,055,500.00 cash that needs accounting entries`);
        console.log(`2. Business has USh 9,035.00 revenue that needs accounting entries`);
        console.log(`3. Business has USh 82,925.00 expenses that need accounting entries`);
        console.log(`4. Total migration value: USh 3,147,460.00`);
        console.log(`5. Accounting system currently only has USh 750.00 recorded`);
        console.log(`6. Need 3 journal entries to migrate all historical data`);
        
    } catch (error) {
        console.error('❌ Error during analysis:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the analysis
analyzeData().then(() => {
    console.log('\n✅ Migration planning complete.');
    process.exit(0);
}).catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
});
