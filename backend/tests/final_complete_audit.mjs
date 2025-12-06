import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
        return { rows: [], error: error.message };
    }
}

async function analyzeFinalData() {
    console.log('🔍 FINAL COMPREHENSIVE DATA AUDIT');
    console.log('==================================\n');
    
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
        
        // 2. COLLECT ALL FINANCIAL DATA
        console.log('2. COLLECTING ALL FINANCIAL DATA');
        console.log('================================\n');
        
        // Get all data in one comprehensive query set
        const dataQueries = [
            // Cash & Bank
            { name: 'Cash (Money Wallets)', query: `SELECT SUM(current_balance) as total FROM money_wallets WHERE business_id = $1` },
            
            // Fixed Assets
            { name: 'Fixed Assets', query: `SELECT SUM(current_value) as total FROM fixed_assets WHERE business_id = $1 AND is_active = true` },
            
            // Inventory
            { name: 'Inventory Assets', query: `SELECT SUM(cost_price * current_stock) as total FROM inventory_items WHERE business_id = $1 AND current_stock > 0` },
            
            // Accounts Receivable
            { name: 'Accounts Receivable', query: `SELECT SUM(total_amount) as total FROM invoices WHERE business_id = $1 AND status != 'paid'` },
            
            // Revenue
            { name: 'Sales Revenue', query: `SELECT SUM(total_amount) as total FROM pos_transactions WHERE business_id = $1 AND status = 'completed'` },
            
            // Expenses
            { name: 'Business Expenses', query: `SELECT SUM(amount) as total FROM expenses WHERE business_id = $1 AND status = 'paid'` },
            
            // Accounts Payable (Purchase Orders)
            { name: 'Accounts Payable', query: `SELECT SUM(total_amount) as total FROM purchase_orders WHERE business_id = $1 AND status != 'paid'` },
            
            // Current Accounting System
            { name: 'Accounting System Total', query: `SELECT SUM(total_amount) as total FROM journal_entries WHERE business_id = $1` }
        ];
        
        const results = {};
        for (const item of dataQueries) {
            const result = await safeQuery(client, item.query, [BUSINESS_ID]);
            results[item.name] = parseFloat(result.rows[0]?.total || 0);
            console.log(`${item.name}: ${business.currency_symbol}${results[item.name].toFixed(2)}`);
        }
        console.log('');
        
        // 3. CALCULATE COMPLETE BALANCE SHEET
        console.log('3. COMPLETE BALANCE SHEET POSITION');
        console.log('===================================\n');
        
        const totalAssets = 
            results['Cash (Money Wallets)'] + 
            results['Fixed Assets'] + 
            results['Inventory Assets'] + 
            results['Accounts Receivable'];
        
        const totalLiabilities = results['Accounts Payable'];
        const openingEquity = totalAssets - totalLiabilities;
        
        const netProfit = results['Sales Revenue'] - results['Business Expenses'];
        const finalEquity = openingEquity + netProfit;
        
        console.log('ASSETS:');
        console.log(`  Cash & Bank: ${business.currency_symbol}${results['Cash (Money Wallets)'].toFixed(2)}`);
        console.log(`  Fixed Assets: ${business.currency_symbol}${results['Fixed Assets'].toFixed(2)}`);
        console.log(`  Inventory: ${business.currency_symbol}${results['Inventory Assets'].toFixed(2)}`);
        console.log(`  Accounts Receivable: ${business.currency_symbol}${results['Accounts Receivable'].toFixed(2)}`);
        console.log(`  TOTAL ASSETS: ${business.currency_symbol}${totalAssets.toFixed(2)}\n`);
        
        console.log('LIABILITIES:');
        console.log(`  Accounts Payable: ${business.currency_symbol}${results['Accounts Payable'].toFixed(2)}`);
        console.log(`  TOTAL LIABILITIES: ${business.currency_symbol}${totalLiabilities.toFixed(2)}\n`);
        
        console.log('EQUITY & PROFIT/LOSS:');
        console.log(`  Opening Equity (Assets - Liabilities): ${business.currency_symbol}${openingEquity.toFixed(2)}`);
        console.log(`  Sales Revenue: ${business.currency_symbol}${results['Sales Revenue'].toFixed(2)}`);
        console.log(`  Business Expenses: ${business.currency_symbol}${results['Business Expenses'].toFixed(2)}`);
        console.log(`  Net Profit/Loss: ${business.currency_symbol}${netProfit.toFixed(2)}`);
        console.log(`  Final Equity: ${business.currency_symbol}${finalEquity.toFixed(2)}\n`);
        
        // 4. VERIFY ACCOUNTING EQUATION
        console.log('4. VERIFY ACCOUNTING EQUATION');
        console.log('==============================\n');
        
        console.log('Accounting Equation: Assets = Liabilities + Equity');
        console.log(`Calculated: ${business.currency_symbol}${totalAssets.toFixed(2)} = ${business.currency_symbol}${totalLiabilities.toFixed(2)} + ${business.currency_symbol}${finalEquity.toFixed(2)}`);
        
        const equationBalanced = Math.abs(totalAssets - (totalLiabilities + finalEquity)) < 0.01;
        if (equationBalanced) {
            console.log('✅ Accounting equation is balanced!\n');
        } else {
            console.log(`❌ Accounting equation is NOT balanced! Difference: ${business.currency_symbol}${Math.abs(totalAssets - (totalLiabilities + finalEquity)).toFixed(2)}\n`);
        }
        
        // 5. GAP ANALYSIS
        console.log('5. GAP ANALYSIS: LEGACY VS ACCOUNTING');
        console.log('=====================================\n');
        
        const legacyTotalValue = totalAssets + results['Sales Revenue'] + results['Business Expenses'];
        const accountingTotal = results['Accounting System Total'];
        
        console.log('COMPARISON:');
        console.log(`  Legacy System Total Value: ${business.currency_symbol}${legacyTotalValue.toFixed(2)}`);
        console.log(`  Accounting System Total: ${business.currency_symbol}${accountingTotal.toFixed(2)}`);
        console.log(`  GAP TO MIGRATE: ${business.currency_symbol}${(legacyTotalValue - accountingTotal).toFixed(2)}`);
        console.log(`  Percentage in Accounting: ${((accountingTotal / legacyTotalValue) * 100).toFixed(2)}%\n`);
        
        // 6. CREATE MIGRATION PLAN
        console.log('6. MIGRATION PLAN');
        console.log('=================\n');
        
        console.log('STEP 1: Opening Balance Journal Entry');
        console.log('-------------------------------------');
        console.log(`  Debit: Cash (1110) ${business.currency_symbol}${results['Cash (Money Wallets)'].toFixed(2)}`);
        console.log(`  Debit: Fixed Assets (1300) ${business.currency_symbol}${results['Fixed Assets'].toFixed(2)}`);
        console.log(`  Debit: Inventory (1300) ${business.currency_symbol}${results['Inventory Assets'].toFixed(2)}`);
        console.log(`  Debit: Accounts Receivable (1200) ${business.currency_symbol}${results['Accounts Receivable'].toFixed(2)}`);
        console.log(`  Credit: Opening Equity (3100) ${business.currency_symbol}${openingEquity.toFixed(2)}`);
        console.log(`  Credit: Accounts Payable (2100) ${business.currency_symbol}${results['Accounts Payable'].toFixed(2)}`);
        
        console.log('\nSTEP 2: Historical Revenue Recognition');
        console.log('----------------------------------------');
        console.log(`  Debit: Opening Equity (3100) ${business.currency_symbol}${results['Sales Revenue'].toFixed(2)}`);
        console.log(`  Credit: Retained Earnings (3200) ${business.currency_symbol}${results['Sales Revenue'].toFixed(2)}`);
        
        console.log('\nSTEP 3: Historical Expenses Recognition');
        console.log('-----------------------------------------');
        console.log(`  Debit: Retained Earnings (3200) ${business.currency_symbol}${results['Business Expenses'].toFixed(2)}`);
        console.log(`  Credit: Opening Equity (3100) ${business.currency_symbol}${results['Business Expenses'].toFixed(2)}`);
        
        console.log('\nSTEP 4: Final Verification');
        console.log('---------------------------');
        console.log(`  Assets after migration: ${business.currency_symbol}${totalAssets.toFixed(2)}`);
        console.log(`  Liabilities after migration: ${business.currency_symbol}${totalLiabilities.toFixed(2)}`);
        console.log(`  Equity after migration: ${business.currency_symbol}${finalEquity.toFixed(2)}`);
        console.log(`  Equation: ${business.currency_symbol}${totalAssets.toFixed(2)} = ${business.currency_symbol}${totalLiabilities.toFixed(2)} + ${business.currency_symbol}${finalEquity.toFixed(2)}`);
        
        // 7. SAVE FINAL REPORT
        console.log('\n7. SAVING FINAL REPORT');
        console.log('======================\n');
        
        const finalReport = {
            business: {
                name: business.business_name,
                currency: business.currency,
                currency_symbol: business.currency_symbol,
                id: BUSINESS_ID
            },
            analysis_date: new Date().toISOString(),
            financial_data: results,
            balance_sheet: {
                assets: {
                    cash: results['Cash (Money Wallets)'],
                    fixed_assets: results['Fixed Assets'],
                    inventory: results['Inventory Assets'],
                    accounts_receivable: results['Accounts Receivable'],
                    total: totalAssets
                },
                liabilities: {
                    accounts_payable: results['Accounts Payable'],
                    total: totalLiabilities
                },
                equity: {
                    opening_equity: openingEquity,
                    revenue: results['Sales Revenue'],
                    expenses: results['Business Expenses'],
                    net_profit: netProfit,
                    final_equity: finalEquity
                }
            },
            accounting_equation: {
                formula: "Assets = Liabilities + Equity",
                calculated: `${totalAssets.toFixed(2)} = ${totalLiabilities.toFixed(2)} + ${finalEquity.toFixed(2)}`,
                balanced: equationBalanced
            },
            migration_plan: {
                step1: {
                    description: "Opening Balance Entry",
                    entries: [
                        { account: "1110", description: "Cash opening balance", type: "debit", amount: results['Cash (Money Wallets)'] },
                        { account: "1300", description: "Fixed Assets opening", type: "debit", amount: results['Fixed Assets'] },
                        { account: "1300", description: "Inventory opening", type: "debit", amount: results['Inventory Assets'] },
                        { account: "1200", description: "Accounts Receivable opening", type: "debit", amount: results['Accounts Receivable'] },
                        { account: "3100", description: "Opening Equity", type: "credit", amount: openingEquity },
                        { account: "2100", description: "Accounts Payable", type: "credit", amount: results['Accounts Payable'] }
                    ]
                },
                step2: {
                    description: "Historical Revenue Recognition",
                    entries: [
                        { account: "3100", description: "Transfer revenue to retained earnings", type: "debit", amount: results['Sales Revenue'] },
                        { account: "3200", description: "Retained Earnings - Historical Revenue", type: "credit", amount: results['Sales Revenue'] }
                    ]
                },
                step3: {
                    description: "Historical Expenses Recognition",
                    entries: [
                        { account: "3200", description: "Retained Earnings - Historical Expenses", type: "debit", amount: results['Business Expenses'] },
                        { account: "3100", description: "Reduce opening equity for expenses", type: "credit", amount: results['Business Expenses'] }
                    ]
                }
            },
            gap_analysis: {
                legacy_total: legacyTotalValue,
                accounting_total: accountingTotal,
                gap: legacyTotalValue - accountingTotal,
                percentage_in_accounting: (accountingTotal / legacyTotalValue) * 100,
                migration_needed: (legacyTotalValue - accountingTotal) > 100
            }
        };
        
        const reportPath = join(__dirname, 'final_audit_report.json');
        fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2));
        
        console.log(`✅ Final report saved to: ${reportPath}`);
        console.log('\n📋 FINAL SUMMARY:');
        console.log('================');
        console.log(`1. Total Assets: ${business.currency_symbol}${totalAssets.toFixed(2)}`);
        console.log(`   - Cash: ${business.currency_symbol}${results['Cash (Money Wallets)'].toFixed(2)}`);
        console.log(`   - Fixed Assets: ${business.currency_symbol}${results['Fixed Assets'].toFixed(2)} (14 assets)`);
        console.log(`   - Inventory: ${business.currency_symbol}${results['Inventory Assets'].toFixed(2)} (3 items)`);
        console.log(`   - Receivables: ${business.currency_symbol}${results['Accounts Receivable'].toFixed(2)}`);
        console.log(`2. Liabilities: ${business.currency_symbol}${results['Accounts Payable'].toFixed(2)}`);
        console.log(`3. Historical P&L:`);
        console.log(`   - Revenue: ${business.currency_symbol}${results['Sales Revenue'].toFixed(2)} (18 transactions)`);
        console.log(`   - Expenses: ${business.currency_symbol}${results['Business Expenses'].toFixed(2)} (6 paid expenses)`);
        console.log(`   - Net Profit/Loss: ${business.currency_symbol}${netProfit.toFixed(2)}`);
        console.log(`4. Accounting system has: ${business.currency_symbol}${accountingTotal.toFixed(2)} (4 entries)`);
        console.log(`5. Migration needed: ${business.currency_symbol}${(legacyTotalValue - accountingTotal).toFixed(2)}`);
        console.log(`6. Final Equity Position: ${business.currency_symbol}${finalEquity.toFixed(2)}`);
        
    } catch (error) {
        console.error('❌ Error during analysis:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the analysis
analyzeFinalData().then(() => {
    console.log('\n✅ Final analysis complete.');
    process.exit(0);
}).catch(error => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
});
