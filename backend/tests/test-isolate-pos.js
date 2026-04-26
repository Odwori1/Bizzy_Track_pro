// File: backend/tests/test-isolate-pos.js
// PURPOSE: Isolate and time each component of the POS transaction
// Run: node tests/test-isolate-pos.js

import { getClient } from '../app/utils/database.js';
import { AccountingService } from '../app/services/accountingService.js';
import { TaxService } from '../app/services/taxService.js';
import { DiscountRuleEngine } from '../app/services/discountRuleEngine.js';

// Test configuration
const BUSINESS_ID = '61f96fcb-2636-4ad7-a6c0-edb5049b26e5';
const USER_ID = 'd1f07aa8-aa27-46a8-8d8d-4beef9872239';
const PRODUCT_ID = '8d4cc147-0906-4122-ab4d-b4efa9a1e94a';

async function timeOperation(name, fn) {
    console.log(`\n⏱️  Testing: ${name}`);
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        const status = duration > 1000 ? '⚠️ SLOW' : '✅';
        console.log(`   ${status} Completed in: ${duration}ms`);
        return { duration, result, success: true, name };
    } catch (error) {
        const duration = Date.now() - start;
        console.log(`   ❌ Failed after: ${duration}ms - ${error.message}`);
        return { duration, error: error.message, success: false, name };
    }
}

async function test1_ConnectionAndSimpleQuery() {
    return timeOperation('Database connection + simple query', async () => {
        const client = await getClient();
        try {
            const result = await client.query('SELECT 1 as test');
            return { connected: true, result: result.rows[0] };
        } finally {
            client.release();
        }
    });
}

async function test2_TaxServiceCalculation() {
    return timeOperation('TaxService.calculateItemTax (standard goods, 100k)', async () => {
        return await TaxService.calculateItemTax({
            businessId: BUSINESS_ID,
            productCategory: 'STANDARD_GOODS',
            amount: 100000,
            transactionType: 'sale',
            customerType: 'individual',
            isExempt: false
        });
    });
}

async function test3_TaxServiceWithBusinessLookup() {
    return timeOperation('TaxService.calculateItemTax (business lookup only)', async () => {
        // Test without providing countryCode - forces business lookup
        return await TaxService.calculateItemTax({
            businessId: BUSINESS_ID,
            // No countryCode provided - will query business table
            productCategory: 'STANDARD_GOODS',
            amount: 100000,
            transactionType: 'sale',
            customerType: 'individual'
        });
    });
}

async function test4_DiscountRuleEngineQuick() {
    return timeOperation('DiscountRuleEngine.quickCalculate', async () => {
        return await DiscountRuleEngine.quickCalculate({
            businessId: BUSINESS_ID,
            amount: 100000,
            customerId: null,
            items: [{ id: PRODUCT_ID, type: 'product', amount: 100000, quantity: 1 }]
        });
    });
}

async function test5_AccountingServiceExisting() {
    // Use an existing transaction that already has accounting (will be fast)
    return timeOperation('AccountingService.processPosAccounting (existing transaction)', async () => {
        return await AccountingService.processPosAccounting(
            'b4f773e7-3358-4fb6-9783-674d75b08d6a',  // Has accounting already
            USER_ID
        );
    });
}

async function test6_DirectDatabaseInsertOnly() {
    return timeOperation('DIRECT DB: Insert POS transaction (no services)', async () => {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            
            const transResult = await client.query(`
                INSERT INTO pos_transactions (
                    id, business_id, transaction_number, transaction_date,
                    total_amount, tax_amount, discount_amount, final_amount,
                    payment_method, payment_status, status, created_by,
                    tax_rate, accounting_processed
                ) VALUES (
                    gen_random_uuid(), $1, 'DBONLY-' || to_char(NOW(), 'YYYYMMDDHH24MISS'), NOW(),
                    100000, 20000, 0, 120000,
                    'cash', 'completed', 'completed', $2,
                    20, false
                ) RETURNING id
            `, [BUSINESS_ID, USER_ID]);
            
            const transId = transResult.rows[0].id;
            
            await client.query(`
                INSERT INTO pos_transaction_items (
                    id, business_id, pos_transaction_id, product_id,
                    item_type, item_name, quantity, unit_price, total_price,
                    tax_rate, tax_category_code
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3,
                    'product', 'DB Only Test', 1, 100000, 100000,
                    20, 'STANDARD_GOODS'
                )
            `, [BUSINESS_ID, transId, PRODUCT_ID]);
            
            await client.query('COMMIT');
            
            return { transaction_id: transId, method: 'direct_db_insert' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function test7_DirectAccountingFunctionCall(transId) {
    return timeOperation('DIRECT DB: process_pos_accounting_safe call', async () => {
        const client = await getClient();
        try {
            const result = await client.query(
                `SELECT * FROM process_pos_accounting_safe($1, $2)`,
                [transId, USER_ID]
            );
            return { 
                success: result.rows[0].success,
                message: result.rows[0].message,
                lines_created: result.rows[0].lines_created
            };
        } finally {
            client.release();
        }
    });
}

async function test8_FullFlowWithDirectDB() {
    return timeOperation('FULL FLOW: Insert + Accounting (all DB, no services)', async () => {
        const client = await getClient();
        let transId;
        
        try {
            await client.query('BEGIN');
            
            // Insert transaction
            const transResult = await client.query(`
                INSERT INTO pos_transactions (
                    id, business_id, transaction_number, transaction_date,
                    total_amount, tax_amount, discount_amount, final_amount,
                    payment_method, payment_status, status, created_by,
                    tax_rate, accounting_processed
                ) VALUES (
                    gen_random_uuid(), $1, 'FULLDB-' || to_char(NOW(), 'YYYYMMDDHH24MISS'), NOW(),
                    100000, 20000, 0, 120000,
                    'cash', 'completed', 'completed', $2,
                    20, false
                ) RETURNING id
            `, [BUSINESS_ID, USER_ID]);
            
            transId = transResult.rows[0].id;
            
            await client.query(`
                INSERT INTO pos_transaction_items (
                    id, business_id, pos_transaction_id, product_id,
                    item_type, item_name, quantity, unit_price, total_price,
                    tax_rate, tax_category_code
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3,
                    'product', 'Full DB Test', 1, 100000, 100000,
                    20, 'STANDARD_GOODS'
                )
            `, [BUSINESS_ID, transId, PRODUCT_ID]);
            
            await client.query('COMMIT');
            
            // Now call accounting function directly
            const accountingResult = await client.query(
                `SELECT * FROM process_pos_accounting_safe($1, $2)`,
                [transId, USER_ID]
            );
            
            return { 
                transaction_id: transId,
                accounting_success: accountingResult.rows[0].success,
                lines_created: accountingResult.rows[0].lines_created
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function runIsolationTests() {
    console.log('='.repeat(70));
    console.log('🔍 POS TRANSACTION ISOLATION TESTS');
    console.log('='.repeat(70));
    console.log(`\nConfiguration:`);
    console.log(`  Business ID: ${BUSINESS_ID}`);
    console.log(`  User ID: ${USER_ID}`);
    console.log(`  Product ID: ${PRODUCT_ID}`);
    console.log(`\n🚀 Starting tests at ${new Date().toISOString()}`);
    
    const results = [];
    
    // Test 1: Database connection baseline
    results.push(await test1_ConnectionAndSimpleQuery());
    
    // Test 2: Tax service (might be slow if external API or complex queries)
    results.push(await test2_TaxServiceCalculation());
    
    // Test 3: Tax service with business lookup (additional query)
    results.push(await test3_TaxServiceWithBusinessLookup());
    
    // Test 4: Discount rule engine
    results.push(await test4_DiscountRuleEngineQuick());
    
    // Test 5: Accounting on existing transaction (should be very fast)
    results.push(await test5_AccountingServiceExisting());
    
    // Test 6: Direct database insert only (no accounting)
    const insertResult = await test6_DirectDatabaseInsertOnly();
    results.push(insertResult);
    
    // Test 7: If we have a transaction ID, test accounting function directly
    if (insertResult.success && insertResult.result?.transaction_id) {
        const transId = insertResult.result.transaction_id;
        results.push(await test7_DirectAccountingFunctionCall(transId));
    }
    
    // Test 8: Full flow (insert + accounting) all in database
    results.push(await test8_FullFlowWithDirectDB());
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(70));
    
    const slowOps = results.filter(r => r.duration > 1000);
    const fastOps = results.filter(r => r.duration <= 1000);
    
    console.log(`\n✅ Fast operations (<1s): ${fastOps.length}`);
    fastOps.forEach(r => {
        console.log(`   - ${r.name}: ${r.duration}ms`);
    });
    
    if (slowOps.length > 0) {
        console.log(`\n⚠️  SLOW operations (>1s): ${slowOps.length}`);
        slowOps.forEach(r => {
            const status = r.success ? '⚠️' : '❌';
            console.log(`   ${status} ${r.name}: ${r.duration}ms`);
        });
    }
    
    // Identify the culprit
    const slowest = results.reduce((max, r) => r.duration > max.duration ? r : max, { duration: 0 });
    if (slowest.duration > 5000) {
        console.log(`\n🎯 PRIMARY SUSPECT: ${slowest.name}`);
        console.log(`   Duration: ${slowest.duration}ms`);
        console.log(`   This is likely where the 60-second delay is coming from!`);
    } else if (slowOps.length === 0) {
        console.log(`\n✅ All database operations are fast (<1s)!`);
        console.log(`\n🎯 CONCLUSION: The 60-second delay is NOT in the database layer.`);
        console.log(`   The problem must be in one of these areas:`);
        console.log(`   1. HTTP middleware (authentication, RLS context setting)`);
        console.log(`   2. Audit logging (disk I/O or slow storage)`);
        console.log(`   3. External API calls (exchange rates, tax validation, etc.)`);
        console.log(`   4. Promise resolution or event loop blocking in Node.js`);
        console.log(`   5. A hidden setTimeout or sleep in the service layer`);
    }
    
    console.log(`\n🏁 Tests completed at ${new Date().toISOString()}`);
}

// Run with timeout protection
const TEST_TIMEOUT = 120000; // 120 seconds

const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Test suite timed out after 120s')), TEST_TIMEOUT);
});

Promise.race([runIsolationTests(), timeoutPromise])
    .then(() => {
        process.exit(0);
    })
    .catch(error => {
        console.error(`\n❌ Test failed: ${error.message}`);
        process.exit(1);
    });
