// test-isolate.js - Run with: node test-isolate.js
import { getClient } from './backend/app/utils/database.js';
import { AccountingService } from './backend/app/services/accountingService.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMWYwN2FhOC1hYTI3LTQ2YTgtOGQ4ZC00YmVlZjk4NzIyMzkiLCJidXNpbmVzc0lkIjoiNjFmOTZmY2ItMjYzNi00YWQ3LWE2YzAtZWRiNTA0OWIyNmU1IiwiZW1haWwiOiJwaGFzZTEyQHRlc3QuY29tIiwicm9sZSI6Im93bmVyIiwidGltZXpvbmUiOiJBZnJpY2EvTmFpcm9iaSIsImlhdCI6MTc3NjQwMTE3NywiZXhwIjoxNzc3MDA1OTc3fQ.3s-G9feBEUgTJPiT4JzY3GxL1gd38OKRUHcJytFx4hA';
const BUSINESS_ID = '61f96fcb-2636-4ad7-a6c0-edb5049b26e5';
const USER_ID = 'd1f07aa8-aa27-46a8-8d8d-4beef9872239';
const PRODUCT_ID = '8d4cc147-0906-4122-ab4d-b4efa9a1e94a';

async function testDirectConnection() {
    console.log('\n=== TEST 1: Direct getClient() ===');
    const start = Date.now();
    const client = await getClient();
    console.log(`getClient() took: ${Date.now() - start}ms`);
    client.release();
}

async function testDirectDatabaseCall() {
    console.log('\n=== TEST 2: Direct database query (no service) ===');
    const start = Date.now();
    const client = await getClient();
    try {
        const result = await client.query('SELECT 1 as test');
        console.log(`Query took: ${Date.now() - start}ms`);
    } finally {
        client.release();
    }
}

async function testDirectAccountingFunction() {
    console.log('\n=== TEST 3: Direct accounting function call ===');
    const start = Date.now();
    const client = await getClient();
    try {
        // Use a transaction that already has accounting (fast path)
        const result = await client.query(
            `SELECT * FROM process_pos_accounting_safe($1, $2)`,
            ['b4f773e7-3358-4fb6-9783-674d75b08d6a', USER_ID]
        );
        console.log(`process_pos_accounting_safe took: ${Date.now() - start}ms`);
        console.log(`Result: ${result.rows[0].success}`);
    } finally {
        client.release();
    }
}

async function testAccountingService() {
    console.log('\n=== TEST 4: AccountingService.processPosAccounting ===');
    const start = Date.now();
    const result = await AccountingService.processPosAccounting(
        'b4f773e7-3358-4fb6-9783-674d75b08d6a',
        USER_ID
    );
    console.log(`AccountingService.processPosAccounting took: ${Date.now() - start}ms`);
    console.log(`Result: ${result.success}`);
}

async function testFullPOSCreate() {
    console.log('\n=== TEST 5: Full POS creation (via direct function) ===');
    const start = Date.now();
    const client = await getClient();
    try {
        await client.query('BEGIN');
        
        // Insert transaction
        const transResult = await client.query(`
            INSERT INTO pos_transactions (
                id, business_id, transaction_number, transaction_date,
                total_amount, tax_amount, final_amount,
                payment_method, payment_status, status, created_by,
                tax_rate, accounting_processed
            ) VALUES (
                gen_random_uuid(), $1, 'ISOLATE-' || gen_random_uuid(), NOW(),
                100000, 20000, 120000,
                'cash', 'completed', 'completed', $2,
                20, false
            ) RETURNING id
        `, [BUSINESS_ID, USER_ID]);
        
        const transId = transResult.rows[0].id;
        
        // Insert item
        await client.query(`
            INSERT INTO pos_transaction_items (
                id, business_id, pos_transaction_id, product_id,
                item_type, item_name, quantity, unit_price, total_price,
                tax_rate, tax_category_code
            ) VALUES (
                gen_random_uuid(), $1, $2, $3,
                'product', 'Isolate Test', 1, 100000, 100000,
                20, 'STANDARD_GOODS'
            )
        `, [BUSINESS_ID, transId, PRODUCT_ID]);
        
        await client.query('COMMIT');
        
        console.log(`Insert took: ${Date.now() - start}ms`);
        
        // Now call accounting
        const accountingStart = Date.now();
        const accountingResult = await AccountingService.processPosAccounting(transId, USER_ID);
        console.log(`Accounting via service took: ${Date.now() - accountingStart}ms`);
        console.log(`Total: ${Date.now() - start}ms`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error:', error.message);
    } finally {
        client.release();
    }
}

async function runAllTests() {
    console.log('='.repeat(60));
    console.log('ISOLATING POS SERVICE DELAY');
    console.log('='.repeat(60));
    
    await testDirectConnection();
    await testDirectDatabaseCall();
    await testDirectAccountingFunction();
    await testAccountingService();
    await testFullPOSCreate();
    
    console.log('\n' + '='.repeat(60));
    console.log('TESTS COMPLETE');
    console.log('='.repeat(60));
}

runAllTests().catch(console.error);
