const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const pool = new Pool({
    host: 'localhost',
    port: 5434,
    database: 'bizzytrack_pro',
    user: 'postgres',
    password: '', // Add password if needed
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
                business_name,
                email,
                created_at,
                (SELECT COUNT(*) FROM pos_transactions WHERE business_id = businesses.id) as pos_transaction_count,
                (SELECT COUNT(*) FROM expenses WHERE business_id = businesses.id) as expense_count,
                (SELECT COUNT(*) FROM invoices WHERE business_id = businesses.id) as invoice_count,
                (SELECT COUNT(*) FROM inventory_items WHERE business_id = businesses.id) as inventory_count,
                (SELECT COUNT(*) FROM wallet_transactions WHERE business_id = businesses.id) as wallet_transaction_count,
                (SELECT COUNT(*) FROM equipment_hire WHERE business_id = businesses.id) as equipment_hire_count,
                (SELECT COUNT(*) FROM purchase_orders WHERE business_id = businesses.id) as po_count,
                (SELECT COUNT(*) FROM assets WHERE business_id = businesses.id) as asset_count
            FROM businesses 
            WHERE id = $1
        `, [BUSINESS_ID]);
        
        console.log(`Business: ${businessInfo.rows[0].business_name}`);
        console.log(`Email: ${businessInfo.rows[0].email}`);
        console.log(`Created: ${businessInfo.rows[0].created_at}`);
        console.log(`\nData Counts:`);
        console.log(`- POS Transactions: ${businessInfo.rows[0].pos_transaction_count}`);
        console.log(`- Expenses: ${businessInfo.rows[0].expense_count}`);
        console.log(`- Invoices: ${businessInfo.rows[0].invoice_count}`);
        console.log(`- Inventory Items: ${businessInfo.rows[0].inventory_count}`);
        console.log(`- Wallet Transactions: ${businessInfo.rows[0].wallet_transaction_count}`);
        console.log(`- Equipment Hire: ${businessInfo.rows[0].equipment_hire_count}`);
        console.log(`- Purchase Orders: ${businessInfo.rows[0].po_count}`);
        console.log(`- Assets: ${businessInfo.rows[0].asset_count}\n`);

        // 2. CASH ANALYSIS (Wallets)
        console.log('2. CASH & WALLET ANALYSIS');
        console.log('=========================');
        const cashAnalysis = await client.query(`
            -- Total wallet balance
            SELECT 
                'Total Wallet Balance' as description,
                COALESCE(SUM(balance), 0) as amount
            FROM wallets 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Total wallet transactions
            SELECT 
                'Total Wallet Transactions' as description,
                COALESCE(COUNT(*), 0) as amount
            FROM wallet_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Total wallet transaction value
            SELECT 
                'Total Wallet Transaction Value' as description,
                COALESCE(SUM(amount), 0) as amount
            FROM wallet_transactions 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        cashAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${parseFloat(row.amount).toFixed(2)}`);
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
                CONCAT('POS Revenue (', payment_method, ')') as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as transaction_count
            FROM pos_transactions 
            WHERE business_id = $1
            AND status = 'completed'
            GROUP BY payment_method
        `, [BUSINESS_ID]);
        
        revenueAnalysis.rows.forEach(row => {
            console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)} (${row.transaction_count} transactions)`);
        });

        // 4. EXPENSE ANALYSIS
        console.log('\n4. EXPENSE ANALYSIS');
        console.log('==================');
        const expenseAnalysis = await client.query(`
            -- Total expenses
            SELECT 
                'Total Expenses' as description,
                COALESCE(SUM(amount), 0) as amount,
                COUNT(*) as expense_count
            FROM expenses 
            WHERE business_id = $1
            AND status = 'approved'
            
            UNION ALL
            
            -- Expenses by category
            SELECT 
                CONCAT('Expenses (', category, ')') as description,
                COALESCE(SUM(amount), 0) as amount,
                COUNT(*) as expense_count
            FROM expenses 
            WHERE business_id = $1
            AND status = 'approved'
            GROUP BY category
            ORDER BY SUM(amount) DESC
        `, [BUSINESS_ID]);
        
        expenseAnalysis.rows.forEach(row => {
            console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)} (${row.expense_count} expenses)`);
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
            
            -- Inventory categories
            SELECT 
                CONCAT('Inventory (', category, ')') as description,
                COALESCE(SUM(current_stock * unit_cost), 0) as amount,
                COUNT(*) as item_count
            FROM inventory_items 
            WHERE business_id = $1
            AND current_stock > 0
            GROUP BY category
            ORDER BY SUM(current_stock * unit_cost) DESC
        `, [BUSINESS_ID]);
        
        inventoryAnalysis.rows.forEach(row => {
            console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)} (${row.item_count} items)`);
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
                CONCAT('Invoices (', status, ')') as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as invoice_count
            FROM invoices 
            WHERE business_id = $1
            GROUP BY status
            ORDER BY status
        `, [BUSINESS_ID]);
        
        arAnalysis.rows.forEach(row => {
            console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)} (${row.invoice_count} invoices)`);
        });

        // 7. ACCOUNTS PAYABLE (Purchase Orders)
        console.log('\n7. ACCOUNTS PAYABLE ANALYSIS');
        console.log('============================');
        const apAnalysis = await client.query(`
            SELECT 
                'Total Purchase Orders' as description,
                COALESCE(SUM(total_amount), 0) as amount,
                COUNT(*) as po_count
            FROM purchase_orders 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        apAnalysis.rows.forEach(row => {
            console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)} (${row.po_count} POs)`);
        });

        // 8. FIXED ASSETS
        console.log('\n8. FIXED ASSETS ANALYSIS');
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
                CONCAT('Assets (', category, ')') as description,
                COALESCE(SUM(purchase_value), 0) as amount,
                COUNT(*) as asset_count
            FROM assets 
            WHERE business_id = $1
            GROUP BY category
            ORDER BY SUM(purchase_value) DESC
        `, [BUSINESS_ID]);
        
        assetsAnalysis.rows.forEach(row => {
            console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)} (${row.asset_count} assets)`);
        });

        // 9. ACCOUNTING SYSTEM CURRENT STATE
        console.log('\n9. ACCOUNTING SYSTEM CURRENT STATE');
        console.log('===================================');
        const accountingAnalysis = await client.query(`
            -- Total journal entries
            SELECT 
                'Total Journal Entries' as description,
                COUNT(*) as count
            FROM journal_entries 
            WHERE business_id = $1
            
            UNION ALL
            
            -- Total journal entry lines
            SELECT 
                'Total Journal Entry Lines' as description,
                COUNT(*) as count
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
            
            UNION ALL
            
            -- Total debits vs credits
            SELECT 
                'Total Debits' as description,
                COALESCE(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END), 0) as amount
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
            
            UNION ALL
            
            SELECT 
                'Total Credits' as description,
                COALESCE(SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END), 0) as amount
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
            
            UNION ALL
            
            -- Accounting equation check
            SELECT 
                CASE 
                    WHEN ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
                           SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)) < 0.01 
                    THEN 'Accounting Equation Balanced ✓' 
                    ELSE 'Accounting Equation UNBALANCED ✗' 
                END as description,
                ABS(SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) - 
                    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)) as amount
            FROM journal_entry_lines jel
            JOIN journal_entries je ON jel.journal_entry_id = je.id
            WHERE je.business_id = $1
        `, [BUSINESS_ID]);
        
        accountingAnalysis.rows.forEach(row => {
            if (row.description.includes('Amount')) {
                console.log(`${row.description}: $${parseFloat(row.amount).toFixed(2)}`);
            } else if (row.description.includes('Count')) {
                console.log(`${row.description}: ${row.count}`);
            } else {
                console.log(`${row.description}: ${parseFloat(row.amount).toFixed(2)}`);
            }
        });

        // 10. SUMMARY: LEGACY DATA VS ACCOUNTING DATA
        console.log('\n10. SUMMARY: LEGACY DATA VS ACCOUNTING DATA');
        console.log('===========================================');
        
        // Get legacy totals
        const legacySummary = await client.query(`
            -- Legacy cash (wallet balance)
            SELECT 'Cash (Wallet Balance)' as category, COALESCE(SUM(balance), 0) as legacy_amount, 0 as accounting_amount
            FROM wallets WHERE business_id = $1
            
            UNION ALL
            
            -- Legacy revenue (POS)
            SELECT 'Revenue (POS Sales)', COALESCE(SUM(total_amount), 0), 0
            FROM pos_transactions WHERE business_id = $1 AND status = 'completed'
            
            UNION ALL
            
            -- Legacy expenses
            SELECT 'Expenses', COALESCE(SUM(amount), 0), 0
            FROM expenses WHERE business_id = $1 AND status = 'approved'
            
            UNION ALL
            
            -- Legacy inventory
            SELECT 'Inventory', COALESCE(SUM(current_stock * unit_cost), 0), 0
            FROM inventory_items WHERE business_id = $1 AND current_stock > 0
            
            UNION ALL
            
            -- Legacy accounts receivable
            SELECT 'Accounts Receivable', COALESCE(SUM(total_amount), 0), 0
            FROM invoices WHERE business_id = $1 AND status != 'paid'
            
            UNION ALL
            
            -- Legacy accounts payable
            SELECT 'Accounts Payable', COALESCE(SUM(total_amount), 0), 0
            FROM purchase_orders WHERE business_id = $1 AND status != 'paid'
            
            UNION ALL
            
            -- Legacy fixed assets
            SELECT 'Fixed Assets', COALESCE(SUM(purchase_value), 0), 0
            FROM assets WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        // Get accounting totals (we'll need to map account codes)
        // This is simplified - in reality we'd need to check chart_of_accounts
        const accountingSummary = await client.query(`
            -- We'll get this in the next step after understanding account mappings
            SELECT 'Accounting data will be analyzed next' as note
        `, [BUSINESS_ID]);
        
        console.log('\nLEGACY DATA TOTALS:');
        console.log('------------------');
        legacySummary.rows.forEach(row => {
            console.log(`${row.category}: $${parseFloat(row.legacy_amount).toFixed(2)}`);
        });

        // 11. DATE RANGE ANALYSIS
        console.log('\n11. DATE RANGE ANALYSIS');
        console.log('======================');
        const dateAnalysis = await client.query(`
            -- First and last transaction dates
            SELECT 
                'Earliest POS Transaction' as description,
                MIN(created_at) as date
            FROM pos_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest POS Transaction' as description,
                MAX(created_at) as date
            FROM pos_transactions 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Earliest Expense' as description,
                MIN(created_at) as date
            FROM expenses 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest Expense' as description,
                MAX(created_at) as date
            FROM expenses 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Earliest Journal Entry' as description,
                MIN(created_at) as date
            FROM journal_entries 
            WHERE business_id = $1
            
            UNION ALL
            
            SELECT 
                'Latest Journal Entry' as description,
                MAX(created_at) as date
            FROM journal_entries 
            WHERE business_id = $1
        `, [BUSINESS_ID]);
        
        dateAnalysis.rows.forEach(row => {
            console.log(`${row.description}: ${row.date}`);
        });

    } catch (error) {
        console.error('Error during analysis:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the analysis
analyzeData().then(() => {
    console.log('\n✅ Analysis complete. Check the output above.');
    process.exit(0);
}).catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
});
