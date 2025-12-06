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

async function analyzeData() {
    console.log('🔍 COMPREHENSIVE DATA AUDIT ANALYSIS');
    console.log('=====================================\n');
    
    const client = await pool.connect();
    
    try {
        // 1. BUSINESS OVERVIEW
        console.log('1. BUSINESS OVERVIEW');
        console.log('===================');
        const businessInfo = await client.query(`
            SELECT 
                id, 
                name as business_name,
                currency,
                currency_symbol,
                timezone,
                created_at,
                (SELECT COUNT(*) FROM pos_transactions WHERE business_id = businesses.id) as pos_transaction_count,
                (SELECT COUNT(*) FROM expenses WHERE business_id = businesses.id) as expense_count,
                (SELECT COUNT(*) FROM invoices WHERE business_id = businesses.id) as invoice_count,
                (SELECT COUNT(*) FROM inventory_items WHERE business_id = businesses.id) as inventory_count,
                (SELECT COUNT(*) FROM wallet_transactions WHERE business_id = businesses.id) as wallet_transaction_count,
                (SELECT COUNT(*) FROM purchase_orders WHERE business_id = businesses.id) as po_count,
                (SELECT COUNT(*) FROM assets WHERE business_id = businesses.id) as asset_count
            FROM businesses 
            WHERE id = $1
        `, [BUSINESS_ID]);
        
        const business = businessInfo.rows[0];
        console.log(`Business: ${business.business_name}`);
        console.log(`Currency: ${business.currency} (${business.currency_symbol})`);
        console.log(`Created: ${business.created_at}`);
        console.log(`\nData Counts:`);
        console.log(`- POS Transactions: ${business.pos_transaction_count}`);
        console.log(`- Expenses: ${business.expense_count}`);
        console.log(`- Invoices: ${business.invoice_count}`);
        console.log(`- Inventory Items: ${business.inventory_count}`);
        console.log(`- Wallet Transactions: ${business.wallet_transaction_count}`);
        console.log(`- Purchase Orders: ${business.po_count}`);
        console.log(`- Assets: ${business.asset_count}\n`);

        // 2. CASH ANALYSIS (Wallets)
        console.log('2. CASH & WALLET ANALYSIS');
        console.log('=========================');
        
        const cashAnalysis = await client.query(`
            -- Total wallet balance
            SELECT 
                'Total Wallet Balance' as description,
                COALESCE(SUM(current_balance), 0) as amount,
                0 as count
            FROM money_wallets 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Wallet details
            SELECT 
                CONCAT('Wallet: ', name) as description,
                current_balance as amount,
                1 as count
            FROM money_wallets 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Total wallet transactions
            SELECT 
                'Total Wallet Transactions' as description,
                COALESCE(COUNT(*), 0) as amount,
                0 as count
            FROM wallet_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Total wallet transaction value
            SELECT 
                'Total Wallet Transaction Value' as description,
                COALESCE(SUM(amount), 0) as amount,
                0 as count
            FROM wallet_transactions 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        cashAnalysis.rows.forEach(row => {
            if (row.description.startsWith('Wallet:')) {
                console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)}`);
            } else if (row.description.includes('Transactions')) {
                console.log(`${row.description}: ${parseInt(row.amount)}`);
            } else {
                console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)}`);
            }
        });
        
        // 3. REVENUE ANALYSIS (POS Sales)
        console.log('\n3. REVENUE ANALYSIS (POS Sales)');
        console.log('==============================');
        const revenueAnalysis = await client.query(`
            -- Total POS revenue
            SELECT 
                'Total POS Revenue' as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as transaction_count
            FROM pos_transactions 
            WHERE business_id = $1
            AND status = 'completed'
            
            UNION ALL
            
            -- Revenue by payment method
            SELECT 
                CONCAT('POS Revenue (', COALESCE(payment_method, 'Unknown'), ')') as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as transaction_count
            FROM pos_transactions 
            WHERE business_id = $1
            AND status = 'completed'
            GROUP BY payment_method
        `, [BUSINESS_ID]);
        
        revenueAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)} (${row.transaction_count} transactions)`);
        });

        // 4. EXPENSE ANALYSIS
        console.log('\n4. EXPENSE ANALYSIS');
        console.log('==================');
        
        const expenseAnalysis = await client.query(`
            -- Total all expenses
            SELECT 
                'Total ALL Expenses (all statuses)' as description,
                COALESCE(SUM(amount), 0) as amount,
                COUNT(*) as expense_count
            FROM expenses 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Expenses by status
            SELECT 
                CONCAT('Expenses (status: ', COALESCE(status, 'NULL'), ')') as description,
                COALESCE(SUM(amount), 0) as amount,
                COUNT(*) as expense_count
            FROM expenses 
            WHERE business_id = $1
            GROUP BY status
            ORDER BY status
            
            UNION ALL
            
            -- Expenses by category
            SELECT 
                CONCAT('Expenses (category: ', COALESCE(category, 'Uncategorized'), ')') as description,
                COALESCE(SUM(amount), 0) as amount,
                COUNT(*) as expense_count
            FROM expenses 
            WHERE business_id = $1
            GROUP BY category
            ORDER BY SUM(amount) DESC
        `, [BUSINESS_ID]);
        
        expenseAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)} (${row.expense_count} expenses)`);
        });

        // 5. INVENTORY ANALYSIS
        console.log('\n5. INVENTORY ANALYSIS');
        console.log('====================');
        const inventoryAnalysis = await client.query(`
            -- Total inventory value
            SELECT 
                'Total Inventory Value' as description,
                COALESCE(SUM(current_stock * unit_cost), 0) as amount,
                COUNT(*) as item_count
            FROM inventory_items 
            WHERE business_id = $1
            AND current_stock > 0
            
            UNION ALL
            
            -- Zero stock items
            SELECT 
                'Inventory Items (zero stock)' as description,
                COALESCE(SUM(current_stock * unit_cost), 0) as amount,
                COUNT(*) as item_count
            FROM inventory_items 
            WHERE business_id = $1
            AND current_stock = 0
            
            UNION ALL
            
            -- Inventory categories
            SELECT 
                CONCAT('Inventory (', COALESCE(category, 'Uncategorized'), ')') as description,
                COALESCE(SUM(current_stock * unit_cost), 0) as amount,
                COUNT(*) as item_count
            FROM inventory_items 
            WHERE business_id = $1
            AND current_stock > 0
            GROUP BY category
            ORDER BY SUM(current_stock * unit_cost) DESC
        `, [BUSINESS_ID]);
        
        inventoryAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)} (${row.item_count} items)`);
        });

        // 6. ACCOUNTS RECEIVABLE (Invoices)
        console.log('\n6. ACCOUNTS RECEIVABLE ANALYSIS');
        console.log('==============================');
        const arAnalysis = await client.query(`
            -- Total invoices
            SELECT 
                'Total Invoices Amount' as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as invoice_count
            FROM invoices 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Paid vs unpaid
            SELECT 
                CONCAT('Invoices (status: ', COALESCE(status, 'NULL'), ')') as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as invoice_count
            FROM invoices 
            WHERE business_id = $1
            GROUP BY status
            ORDER BY status
        `, [BUSINESS_ID]);
        
        arAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)} (${row.invoice_count} invoices)`);
        });

        // 7. FIXED ASSETS
        console.log('\n7. FIXED ASSETS ANALYSIS');
        console.log('========================');
        const assetsAnalysis = await client.query(`
            SELECT 
                'Total Fixed Assets' as description,
                COALESCE(SUM(purchase_value), 0) as amount,
                COUNT(*) as asset_count
            FROM assets 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Assets by category
            SELECT 
                CONCAT('Assets (category: ', COALESCE(category, 'Uncategorized'), ')') as description,
                COALESCE(SUM(purchase_value), 0) as amount,
                COUNT(*) as asset_count
            FROM assets 
            WHERE business_id = $1
            GROUP BY category
            ORDER BY SUM(purchase_value) DESC
        `, [BUSINESS_ID]);
        
        if (assetsAnalysis.rows.length > 0) {
            assetsAnalysis.rows.forEach(row => {
                console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)} (${row.asset_count} assets)`);
            });
        } else {
            console.log('No fixed assets found');
        }

        // 8. ACCOUNTING SYSTEM CURRENT STATE
        console.log('\n8. ACCOUNTING SYSTEM CURRENT STATE');
        console.log('===================================');
        
        const accountingAnalysis = await client.query(`
            -- Total journal entries
            SELECT 
                'Total Journal Entries' as description,
                COUNT(*) as count,
                0 as amount
            FROM journal_entries 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Total journal entry lines
            SELECT 
                'Total Journal Entry Lines' as description,
                COUNT(*) as count,
                0 as amount
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
            
            UNION ALL
            
            -- Total debits
            SELECT 
                'Total Debits' as description,
                0 as count,
                COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0) as amount
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
            
            UNION ALL
            
            -- Total credits
            SELECT 
                'Total Credits' as description,
                0 as count,
                COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0) as amount
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
        `, [BUSINESS_ID]);
        
        accountingAnalysis.rows.forEach(row => {
            if (row.description.includes('Journal Entries') || row.description.includes('Journal Entry Lines')) {
                console.log(`${row.description}: ${row.count}`);
            } else {
                console.log(`${row.description}: ${business.currency_symbol}${parseFloat(row.amount).toFixed(2)}`);
            }
        });

        // Accounting equation check
        const equationCheck = await client.query(`
            SELECT 
                CASE 
                    WHEN ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
                           SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)) < 0.01 
                    THEN 'Accounting Equation Balanced ✓' 
                    ELSE 'Accounting Equation UNBALANCED ✗' 
                END as status,
                ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
                    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)) as difference
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
        `, [BUSINESS_ID]);
        
        console.log(`\n${equationCheck.rows[0].status}`);
        if (parseFloat(equationCheck.rows[0].difference) > 0.01) {
            console.log(`Difference: ${business.currency_symbol}${parseFloat(equationCheck.rows[0].difference).toFixed(2)}`);
        }

        // 9. CHECK CHART OF ACCOUNTS
        console.log('\n9. CHART OF ACCOUNTS');
        console.log('====================');
        
        const chartOfAccounts = await client.query(`
            SELECT 
                COUNT(*) as account_count,
                COUNT(DISTINCT account_type) as category_count
            FROM chart_of_accounts 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        console.log(`Accounts: ${chartOfAccounts.rows[0].account_count} accounts in ${chartOfAccounts.rows[0].category_count} categories`);

        // Show account categories
        const accountCategories = await client.query(`
            SELECT 
                account_type as category,
                COUNT(*) as account_count
            FROM chart_of_accounts 
            WHERE business_id = $1
            GROUP BY account_type
            ORDER BY account_type
        `, [BUSINESS_ID]);
        
        accountCategories.rows.forEach(row => {
            console.log(`  - ${row.category}: ${row.account_count} accounts`);
        });

        // Show some sample accounts
        const sampleAccounts = await client.query(`
            SELECT account_code, account_name, account_type as category
            FROM chart_of_accounts 
            WHERE business_id = $1
            ORDER BY account_code
            LIMIT 10
        `, [BUSINESS_ID]);
        
        console.log('\nSample Accounts:');
        sampleAccounts.rows.forEach(row => {
            console.log(`  - ${row.account_code} - ${row.account_name} (${row.category})`);
        });

        // 10. DETAILED JOURNAL ENTRY ANALYSIS
        console.log('\n10. DETAILED JOURNAL ENTRY ANALYSIS');
        console.log('===================================');
        
        const journalDetails = await client.query(`
            SELECT 
                je.id,
                je.description,
                je.journal_date as entry_date,
                COUNT(jel.id) as line_count,
                SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
                SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
            FROM journal_entries je
            LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
            WHERE je.business_id = $1
            GROUP BY je.id, je.description, je.journal_date
            ORDER BY je.journal_date
        `, [BUSINESS_ID]);
        
        console.log('Current Journal Entries:');
        if (journalDetails.rows.length > 0) {
            journalDetails.rows.forEach(row => {
                console.log(`  - ${row.description} (${row.entry_date}):`);
                console.log(`      Lines: ${row.line_count}, Debits: ${business.currency_symbol}${parseFloat(row.total_debits).toFixed(2)}, Credits: ${business.currency_symbol}${parseFloat(row.total_credits).toFixed(2)}`);
            });
        } else {
            console.log('  No journal entries found');
        }

        // 11. GAP ANALYSIS: LEGACY CASH VS ACCOUNTING CASH
        console.log('\n11. GAP ANALYSIS: LEGACY VS ACCOUNTING');
        console.log('=======================================');
        
        // Legacy cash
        const legacyCash = await client.query(`
            SELECT COALESCE(SUM(current_balance), 0) as total_cash
            FROM money_wallets 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        // Try to find Cash account in chart of accounts
        const cashAccount = await client.query(`
            SELECT id, account_code, account_name 
            FROM chart_of_accounts 
            WHERE business_id = $1
            AND (account_name ILIKE '%cash%' OR account_name ILIKE '%bank%' OR account_name ILIKE '%wallet%')
            LIMIT 1
        `, [BUSINESS_ID]);
        
        let accountingCash = 0;
        if (cashAccount.rows.length > 0) {
            const cashAccountId = cashAccount.rows[0].id;
            const cashBalance = await client.query(`
                SELECT 
                    COALESCE(SUM(
                        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                    ), 0) as balance
                FROM journal_entry_lines jel
                JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = $1
                AND jel.account_id = $2
            `, [BUSINESS_ID, cashAccountId]);
            
            accountingCash = cashBalance.rows[0].balance;
        }
        
        console.log(`Cash:`);
        console.log(`  Legacy Cash (wallets): ${business.currency_symbol}${parseFloat(legacyCash.rows[0].total_cash).toFixed(2)}`);
        console.log(`  Accounting Cash: ${business.currency_symbol}${parseFloat(accountingCash).toFixed(2)}`);
        console.log(`  Cash Gap: ${business.currency_symbol}${(parseFloat(legacyCash.rows[0].total_cash) - parseFloat(accountingCash)).toFixed(2)}`);
        
        // Revenue gap
        const legacyRevenue = await client.query(`
            SELECT COALESCE(SUM(total_amount), 0) as total_revenue
            FROM pos_transactions 
            WHERE business_id = $1
            AND status = 'completed'
        `, [BUSINESS_ID]);
        
        // Try to find Revenue account
        const revenueAccount = await client.query(`
            SELECT id, account_code, account_name 
            FROM chart_of_accounts 
            WHERE business_id = $1
            AND (account_name ILIKE '%sale%' OR account_name ILIKE '%revenue%' OR account_name ILIKE '%income%')
            LIMIT 1
        `, [BUSINESS_ID]);
        
        let accountingRevenue = 0;
        if (revenueAccount.rows.length > 0) {
            const revenueAccountId = revenueAccount.rows[0].id;
            const revenueBalance = await client.query(`
                SELECT 
                    COALESCE(SUM(
                        CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END
                    ), 0) as balance
                FROM journal_entry_lines jel
                JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = $1
                AND jel.account_id = $2
            `, [BUSINESS_ID, revenueAccountId]);
            
            accountingRevenue = revenueBalance.rows[0].balance;
        }
        
        console.log(`\nRevenue:`);
        console.log(`  Legacy Revenue (POS): ${business.currency_symbol}${parseFloat(legacyRevenue.rows[0].total_revenue).toFixed(2)}`);
        console.log(`  Accounting Revenue: ${business.currency_symbol}${parseFloat(accountingRevenue).toFixed(2)}`);
        console.log(`  Revenue Gap: ${business.currency_symbol}${(parseFloat(legacyRevenue.rows[0].total_revenue) - parseFloat(accountingRevenue)).toFixed(2)}`);
        
        // Expense gap
        const legacyExpenses = await client.query(`
            SELECT COALESCE(SUM(amount), 0) as total_expenses
            FROM expenses 
            WHERE business_id = $1
            AND status = 'paid'  -- Only count paid expenses as they affect cash
        `, [BUSINESS_ID]);
        
        // Try to find Expense account
        const expenseAccount = await client.query(`
            SELECT id, account_code, account_name 
            FROM chart_of_accounts 
            WHERE business_id = $1
            AND (account_name ILIKE '%expense%' OR account_type = 'Expense')
            LIMIT 1
        `, [BUSINESS_ID]);
        
        let accountingExpenses = 0;
        if (expenseAccount.rows.length > 0) {
            const expenseAccountId = expenseAccount.rows[0].id;
            const expenseBalance = await client.query(`
                SELECT 
                    COALESCE(SUM(
                        CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END
                    ), 0) as balance
                FROM journal_entry_lines jel
                JOIN journal_entries je ON jel.journal_entry_id = je.id
                WHERE je.business_id = $1
                AND jel.account_id = $2
            `, [BUSINESS_ID, expenseAccountId]);
            
            accountingExpenses = expenseBalance.rows[0].balance;
        }
        
        console.log(`\nExpenses:`);
        console.log(`  Legacy Expenses (paid): ${business.currency_symbol}${parseFloat(legacyExpenses.rows[0].total_expenses).toFixed(2)}`);
        console.log(`  Accounting Expenses: ${business.currency_symbol}${parseFloat(accountingExpenses).toFixed(2)}`);
        console.log(`  Expense Gap: ${business.currency_symbol}${(parseFloat(legacyExpenses.rows[0].total_expenses) - parseFloat(accountingExpenses)).toFixed(2)}`);

        // 12. DATE RANGE ANALYSIS
        console.log('\n12. DATE RANGE ANALYSIS');
        console.log('======================');
        const dateAnalysis = await client.query(`
            SELECT 
                'Earliest POS Transaction' as description,
                TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS') as date
            FROM pos_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest POS Transaction' as description,
                TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as date
            FROM pos_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Earliest Expense' as description,
                TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS') as date
            FROM expenses 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest Expense' as description,
                TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as date
            FROM expenses 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Earliest Journal Entry' as description,
                TO_CHAR(MIN(journal_date), 'YYYY-MM-DD') as date
            FROM journal_entries 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest Journal Entry' as description,
                TO_CHAR(MAX(journal_date), 'YYYY-MM-DD') as date
            FROM journal_entries 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Earliest Invoice' as description,
                TO_CHAR(MIN(created_at), 'YYYY-MM-DD HH24:MI:SS') as date
            FROM invoices 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest Invoice' as description,
                TO_CHAR(MAX(created_at), 'YYYY-MM-DD HH24:MI:SS') as date
            FROM invoices 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        dateAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${row.date}`);
        });

        // 13. GENERATE SUMMARY REPORT
        console.log('\n13. SUMMARY REPORT');
        console.log('=================');
        console.log(`Business: ${business.business_name}`);
        console.log(`Analysis Date: ${new Date().toISOString()}`);
        console.log(`\nKEY FINDINGS:`);
        console.log(`1. POS Sales: ${business.pos_transaction_count} transactions worth ${business.currency_symbol}${parseFloat(legacyRevenue.rows[0].total_revenue).toFixed(2)}`);
        console.log(`2. Expenses: ${business.expense_count} expenses worth ${business.currency_symbol}${parseFloat(legacyExpenses.rows[0].total_expenses).toFixed(2)} (paid)`);
        console.log(`3. Invoices: ${business.invoice_count} invoices`);
        console.log(`4. Journal Entries: ${accountingAnalysis.rows[0].count} entries`);
        console.log(`5. Accounting Status: ${equationCheck.rows[0].status}`);
        console.log(`\nCRITICAL GAPS:`);
        console.log(`1. Cash Gap: ${business.currency_symbol}${(parseFloat(legacyCash.rows[0].total_cash) - parseFloat(accountingCash)).toFixed(2)}`);
        console.log(`2. Revenue Gap: ${business.currency_symbol}${(parseFloat(legacyRevenue.rows[0].total_revenue) - parseFloat(accountingRevenue)).toFixed(2)}`);
        console.log(`3. Expense Gap: ${business.currency_symbol}${(parseFloat(legacyExpenses.rows[0].total_expenses) - parseFloat(accountingExpenses)).toFixed(2)}`);
        console.log(`\nTOTAL LEGACY DATA VALUE: ${business.currency_symbol}${(parseFloat(legacyCash.rows[0].total_cash) + parseFloat(legacyRevenue.rows[0].total_revenue) + parseFloat(legacyExpenses.rows[0].total_expenses)).toFixed(2)}`);
        console.log(`\nNEXT STEPS:`);
        console.log(`1. Map all legacy data to appropriate chart of accounts`);
        console.log(`2. Create opening balance journal entries`);
        console.log(`3. Verify accounting equation remains balanced`);
        console.log(`4. Build reconciliation reports`);

        // Save report to file
        const report = {
            business: business.business_name,
            currency: business.currency,
            currency_symbol: business.currency_symbol,
            analysis_date: new Date().toISOString(),
            data_counts: {
                pos_transactions: business.pos_transaction_count,
                expenses: business.expense_count,
                invoices: business.invoice_count,
                inventory_items: business.inventory_count,
                wallet_transactions: business.wallet_transaction_count,
                purchase_orders: business.po_count,
                assets: business.asset_count,
                journal_entries: accountingAnalysis.rows[0].count,
                journal_entry_lines: accountingAnalysis.rows[1].count
            },
            cash: {
                legacy_cash: parseFloat(legacyCash.rows[0].total_cash),
                accounting_cash: parseFloat(accountingCash),
                gap: parseFloat(legacyCash.rows[0].total_cash) - parseFloat(accountingCash)
            },
            revenue: {
                legacy_revenue: parseFloat(legacyRevenue.rows[0].total_revenue),
                accounting_revenue: parseFloat(accountingRevenue),
                gap: parseFloat(legacyRevenue.rows[0].total_revenue) - parseFloat(accountingRevenue)
            },
            expenses: {
                legacy_expenses: parseFloat(legacyExpenses.rows[0].total_expenses),
                accounting_expenses: parseFloat(accountingExpenses),
                gap: parseFloat(legacyExpenses.rows[0].total_expenses) - parseFloat(accountingExpenses)
            },
            accounting_status: equationCheck.rows[0].status,
            total_legacy_value: parseFloat(legacyCash.rows[0].total_cash) + 
                               parseFloat(legacyRevenue.rows[0].total_revenue) + 
                               parseFloat(legacyExpenses.rows[0].total_expenses)
        };

        fs.writeFileSync(
            path.join(__dirname, 'data_audit_report.json'),
            JSON.stringify(report, null, 2)
        );
        
        console.log(`\n✅ Report saved to: ${path.join(__dirname, 'data_audit_report.json')}`);

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
