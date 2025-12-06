import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
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
    console.log('🔍 ACTUAL DATA AUDIT ANALYSIS');
    console.log('=============================\n');
    
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
        
        // 2. CHECK WHAT TABLES HAVE DATA
        console.log('2. DATA COUNTS PER TABLE');
        console.log('========================\n');
        
        // List of tables to check (based on what we know exists)
        const tablesToCheck = [
            { name: 'money_wallets', query: "SELECT COUNT(*) as count, SUM(current_balance) as total FROM money_wallets WHERE business_id = $1" },
            { name: 'wallet_transactions', query: "SELECT COUNT(*) as count, SUM(amount) as total FROM wallet_transactions WHERE business_id = $1" },
            { name: 'pos_transactions', query: "SELECT COUNT(*) as count, SUM(total_amount) as total FROM pos_transactions WHERE business_id = $1 AND status = 'completed'" },
            { name: 'expenses', query: "SELECT COUNT(*) as count, SUM(amount) as total FROM expenses WHERE business_id = $1" },
            { name: 'invoices', query: "SELECT COUNT(*) as count, SUM(total_amount) as total FROM invoices WHERE business_id = $1" },
            { name: 'inventory_items', query: "SELECT COUNT(*) as count, SUM(current_stock * unit_cost) as total FROM inventory_items WHERE business_id = $1 AND current_stock > 0" },
            { name: 'journal_entries', query: "SELECT COUNT(*) as count FROM journal_entries WHERE business_id = $1" },
            { name: 'journal_entry_lines', query: "SELECT COUNT(*) as count FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id WHERE je.business_id = $1" },
            { name: 'chart_of_accounts', query: "SELECT COUNT(*) as count FROM chart_of_accounts WHERE business_id = $1" }
        ];
        
        const results = {};
        for (const table of tablesToCheck) {
            const result = await safeQuery(client, table.query, [BUSINESS_ID]);
            results[table.name] = result.rows[0] || { count: 0, total: 0 };
            console.log(`${table.name}:`);
            console.log(`  Count: ${results[table.name].count}`);
            if (results[table.name].total !== null && results[table.name].total !== undefined) {
                console.log(`  Total: ${business.currency_symbol}${parseFloat(results[table.name].total || 0).toFixed(2)}`);
            }
            console.log('');
        }
        
        // 3. DETAILED CASH ANALYSIS
        console.log('3. DETAILED CASH ANALYSIS');
        console.log('=========================\n');
        
        if (results.money_wallets.count > 0) {
            const wallets = await safeQuery(client, `
                SELECT name, wallet_type, current_balance, created_at
                FROM money_wallets 
                WHERE business_id = $1
                ORDER BY current_balance DESC
            `, [BUSINESS_ID]);
            
            console.log('Wallet Details:');
            wallets.rows.forEach(wallet => {
                console.log(`  ${wallet.name} (${wallet.wallet_type}): ${business.currency_symbol}${parseFloat(wallet.current_balance).toFixed(2)}`);
            });
            console.log(`Total Cash: ${business.currency_symbol}${parseFloat(results.money_wallets.total || 0).toFixed(2)}\n`);
        }
        
        // 4. DETAILED REVENUE ANALYSIS
        console.log('4. DETAILED REVENUE ANALYSIS');
        console.log('============================\n');
        
        if (results.pos_transactions.count > 0) {
            const revenueDetails = await safeQuery(client, `
                SELECT 
                    payment_method,
                    COUNT(*) as transaction_count,
                    SUM(total_amount) as total_amount,
                    MIN(created_at) as first_transaction,
                    MAX(created_at) as last_transaction
                FROM pos_transactions 
                WHERE business_id = $1
                AND status = 'completed'
                GROUP BY payment_method
                ORDER BY SUM(total_amount) DESC
            `, [BUSINESS_ID]);
            
            console.log('Revenue by Payment Method:');
            revenueDetails.rows.forEach(row => {
                console.log(`  ${row.payment_method || 'Unknown'}: ${business.currency_symbol}${parseFloat(row.total_amount).toFixed(2)} (${row.transaction_count} transactions)`);
            });
            console.log(`Total Revenue: ${business.currency_symbol}${parseFloat(results.pos_transactions.total || 0).toFixed(2)}\n`);
        }
        
        // 5. DETAILED EXPENSE ANALYSIS
        console.log('5. DETAILED EXPENSE ANALYSIS');
        console.log('============================\n');
        
        if (results.expenses.count > 0) {
            // First check expense columns
            const expenseColumns = await safeQuery(client, `
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'expenses' 
                AND table_schema = 'public'
                ORDER BY ordinal_position
            `);
            
            const hasCategoryId = expenseColumns.rows.some(col => col.column_name === 'category_id');
            const hasCategory = expenseColumns.rows.some(col => col.column_name === 'category');
            
            let categoryField = 'NULL as category';
            if (hasCategory) {
                categoryField = 'category';
            } else if (hasCategoryId) {
                // We would need to join with categories table if it exists
                categoryField = 'category_id::text';
            }
            
            const expenseDetails = await safeQuery(client, `
                SELECT 
                    status,
                    ${categoryField} as category,
                    COUNT(*) as expense_count,
                    SUM(amount) as total_amount,
                    MIN(created_at) as first_expense,
                    MAX(created_at) as last_expense
                FROM expenses 
                WHERE business_id = $1
                GROUP BY status, ${categoryField}
                ORDER BY status, SUM(amount) DESC
            `, [BUSINESS_ID]);
            
            console.log('Expenses by Status:');
            const statusTotals = {};
            expenseDetails.rows.forEach(row => {
                if (!statusTotals[row.status]) {
                    statusTotals[row.status] = { count: 0, total: 0 };
                }
                statusTotals[row.status].count += parseInt(row.expense_count);
                statusTotals[row.status].total += parseFloat(row.total_amount);
                
                console.log(`  ${row.status}${row.category ? ` - ${row.category}` : ''}: ${business.currency_symbol}${parseFloat(row.total_amount).toFixed(2)} (${row.expense_count} expenses)`);
            });
            
            console.log('\nExpense Summary:');
            Object.keys(statusTotals).forEach(status => {
                console.log(`  ${status}: ${business.currency_symbol}${statusTotals[status].total.toFixed(2)} (${statusTotals[status].count} expenses)`);
            });
            console.log(`Total Expenses: ${business.currency_symbol}${parseFloat(results.expenses.total || 0).toFixed(2)}\n`);
        }
        
        // 6. ACCOUNTING SYSTEM ANALYSIS
        console.log('6. ACCOUNTING SYSTEM ANALYSIS');
        console.log('=============================\n');
        
        if (results.journal_entries.count > 0) {
            console.log('Journal Entries Found:');
            
            // Get journal entries with details
            const journalEntries = await safeQuery(client, `
                SELECT 
                    je.id,
                    je.description,
                    je.journal_date,
                    je.reference_type,
                    COUNT(jel.id) as line_count,
                    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
                    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
                FROM journal_entries je
                LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
                WHERE je.business_id = $1
                GROUP BY je.id, je.description, je.journal_date, je.reference_type
                ORDER BY je.journal_date
            `, [BUSINESS_ID]);
            
            journalEntries.rows.forEach(entry => {
                console.log(`  ${entry.journal_date} - ${entry.description || 'No description'}:`);
                console.log(`    Type: ${entry.reference_type || 'Manual'}`);
                console.log(`    Lines: ${entry.line_count}`);
                console.log(`    Debits: ${business.currency_symbol}${parseFloat(entry.total_debits || 0).toFixed(2)}`);
                console.log(`    Credits: ${business.currency_symbol}${parseFloat(entry.total_credits || 0).toFixed(2)}`);
                
                const diff = Math.abs(parseFloat(entry.total_debits || 0) - parseFloat(entry.total_credits || 0));
                if (diff > 0.01) {
                    console.log(`    ⚠️  Unbalanced by: ${business.currency_symbol}${diff.toFixed(2)}`);
                } else {
                    console.log(`    ✅ Balanced`);
                }
                console.log('');
            });
            
            // Check overall accounting equation
            const equationCheck = await safeQuery(client, `
                SELECT 
                    CASE 
                        WHEN ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
                               SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)) < 0.01 
                        THEN '✅ Accounting Equation Balanced' 
                        ELSE '❌ Accounting Equation UNBALANCED' 
                    END as status,
                    ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
                        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)) as difference
                FROM journal_entry_lines jel
                JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = $1
            `, [BUSINESS_ID]);
            
            if (equationCheck.rows[0]) {
                console.log(equationCheck.rows[0].status);
                if (parseFloat(equationCheck.rows[0].difference) > 0.01) {
                    console.log(`Difference: ${business.currency_symbol}${parseFloat(equationCheck.rows[0].difference).toFixed(2)}`);
                }
            }
            console.log('');
        } else {
            console.log('No journal entries found in accounting system\n');
        }
        
        // 7. CHART OF ACCOUNTS ANALYSIS
        console.log('7. CHART OF ACCOUNTS ANALYSIS');
        console.log('=============================\n');
        
        if (results['chart_of_accounts'].count > 0) {
            const coaDetails = await safeQuery(client, `
                SELECT 
                    account_type,
                    COUNT(*) as account_count,
                    SUM(current_balance) as total_balance
                FROM chart_of_accounts 
                WHERE business_id = $1
                GROUP BY account_type
                ORDER BY account_type
            `, [BUSINESS_ID]);
            
            console.log('Chart of Accounts Summary:');
            coaDetails.rows.forEach(row => {
                console.log(`  ${row.account_type}: ${row.account_count} accounts, Balance: ${business.currency_symbol}${parseFloat(row.total_balance || 0).toFixed(2)}`);
            });
            console.log('');
            
            // Show sample accounts
            const sampleAccounts = await safeQuery(client, `
                SELECT account_code, account_name, account_type, current_balance
                FROM chart_of_accounts 
                WHERE business_id = $1
                ORDER BY account_code
                LIMIT 15
            `, [BUSINESS_ID]);
            
            console.log('Sample Accounts:');
            sampleAccounts.rows.forEach(account => {
                console.log(`  ${account.account_code} - ${account.account_name} (${account.account_type}): ${business.currency_symbol}${parseFloat(account.current_balance || 0).toFixed(2)}`);
            });
            console.log('');
        }
        
        // 8. GAP ANALYSIS
        console.log('8. GAP ANALYSIS: LEGACY VS ACCOUNTING');
        console.log('=====================================\n');
        
        // Calculate gaps
        const legacyCash = parseFloat(results.money_wallets.total || 0);
        const legacyRevenue = parseFloat(results.pos_transactions.total || 0);
        const legacyExpenses = parseFloat(results.expenses.total || 0);
        
        console.log('LEGACY DATA TOTALS:');
        console.log(`  Cash (Wallets): ${business.currency_symbol}${legacyCash.toFixed(2)}`);
        console.log(`  Revenue (POS): ${business.currency_symbol}${legacyRevenue.toFixed(2)}`);
        console.log(`  Expenses: ${business.currency_symbol}${legacyExpenses.toFixed(2)}`);
        console.log(`  Total Legacy Value: ${business.currency_symbol}${(legacyCash + legacyRevenue + legacyExpenses).toFixed(2)}\n`);
        
        // Try to get accounting totals
        let accountingCash = 0;
        let accountingRevenue = 0;
        let accountingExpenses = 0;
        
        if (results['chart_of_accounts'].count > 0) {
            // Try to find cash accounts
            const cashAccounts = await safeQuery(client, `
                SELECT id, account_name, current_balance
                FROM chart_of_accounts 
                WHERE business_id = $1
                AND (account_name ILIKE '%cash%' OR account_name ILIKE '%bank%' OR account_type = 'Asset')
                AND account_name NOT ILIKE '%petty%'
            `, [BUSINESS_ID]);
            
            cashAccounts.rows.forEach(account => {
                accountingCash += parseFloat(account.current_balance || 0);
            });
            
            // Try to find revenue accounts
            const revenueAccounts = await safeQuery(client, `
                SELECT id, account_name, current_balance
                FROM chart_of_accounts 
                WHERE business_id = $1
                AND (account_name ILIKE '%sale%' OR account_name ILIKE '%revenue%' OR account_name ILIKE '%income%' OR account_type = 'Revenue')
            `, [BUSINESS_ID]);
            
            revenueAccounts.rows.forEach(account => {
                accountingRevenue += parseFloat(account.current_balance || 0);
            });
            
            // Try to find expense accounts
            const expenseAccounts = await safeQuery(client, `
                SELECT id, account_name, current_balance
                FROM chart_of_accounts 
                WHERE business_id = $1
                AND (account_name ILIKE '%expense%' OR account_type = 'Expense')
            `, [BUSINESS_ID]);
            
            expenseAccounts.rows.forEach(account => {
                accountingExpenses += parseFloat(account.current_balance || 0);
            });
        }
        
        console.log('ACCOUNTING SYSTEM TOTALS:');
        console.log(`  Cash Accounts: ${business.currency_symbol}${accountingCash.toFixed(2)}`);
        console.log(`  Revenue Accounts: ${business.currency_symbol}${accountingRevenue.toFixed(2)}`);
        console.log(`  Expense Accounts: ${business.currency_symbol}${accountingExpenses.toFixed(2)}`);
        console.log(`  Total Accounting Value: ${business.currency_symbol}${(accountingCash + accountingRevenue + accountingExpenses).toFixed(2)}\n`);
        
        console.log('GAPS TO MIGRATE:');
        console.log(`  Cash Gap: ${business.currency_symbol}${(legacyCash - accountingCash).toFixed(2)}`);
        console.log(`  Revenue Gap: ${business.currency_symbol}${(legacyRevenue - accountingRevenue).toFixed(2)}`);
        console.log(`  Expense Gap: ${business.currency_symbol}${(legacyExpenses - accountingExpenses).toFixed(2)}`);
        console.log(`  Total Gap: ${business.currency_symbol}${(legacyCash + legacyRevenue + legacyExpenses - accountingCash - accountingRevenue - accountingExpenses).toFixed(2)}\n`);
        
        // 9. SAVE REPORT
        console.log('9. SAVING ANALYSIS REPORT');
        console.log('=========================\n');
        
        const report = {
            business: {
                name: business.business_name,
                currency: business.currency,
                currency_symbol: business.currency_symbol,
                id: BUSINESS_ID
            },
            analysis_date: new Date().toISOString(),
            data_counts: {
                money_wallets: results.money_wallets.count,
                wallet_transactions: results.wallet_transactions.count,
                pos_transactions: results.pos_transactions.count,
                expenses: results.expenses.count,
                invoices: results.invoices.count,
                inventory_items: results.inventory_items.count,
                journal_entries: results.journal_entries.count,
                journal_entry_lines: results.journal_entry_lines.count,
                chart_of_accounts: results['chart_of_accounts'].count
            },
            legacy_totals: {
                cash: legacyCash,
                revenue: legacyRevenue,
                expenses: legacyExpenses,
                total: legacyCash + legacyRevenue + legacyExpenses
            },
            accounting_totals: {
                cash: accountingCash,
                revenue: accountingRevenue,
                expenses: accountingExpenses,
                total: accountingCash + accountingRevenue + accountingExpenses
            },
            gaps: {
                cash: legacyCash - accountingCash,
                revenue: legacyRevenue - accountingRevenue,
                expenses: legacyExpenses - accountingExpenses,
                total: (legacyCash + legacyRevenue + legacyExpenses) - (accountingCash + accountingRevenue + accountingExpenses)
            },
            migration_needed: (legacyCash + legacyRevenue + legacyExpenses) > (accountingCash + accountingRevenue + accountingExpenses)
        };
        
        fs.writeFileSync(
            path.join(__dirname, 'actual_data_audit_report.json'),
            JSON.stringify(report, null, 2)
        );
        
        console.log(`✅ Report saved to: ${path.join(__dirname, 'actual_data_audit_report.json')}`);
        console.log('\n📋 SUMMARY:');
        console.log('===========');
        console.log(`Business has ${results.pos_transactions.count} POS transactions worth ${business.currency_symbol}${legacyRevenue.toFixed(2)}`);
        console.log(`Business has ${results.expenses.count} expenses worth ${business.currency_symbol}${legacyExpenses.toFixed(2)}`);
        console.log(`Business has ${results.money_wallets.count} wallets with ${business.currency_symbol}${legacyCash.toFixed(2)} cash`);
        console.log(`Accounting system has ${results.journal_entries.count} journal entries`);
        console.log(`Total gap to migrate: ${business.currency_symbol}${report.gaps.total.toFixed(2)}`);
        
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
    console.log('\n✅ Analysis complete.');
    process.exit(0);
}).catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
});
