// File: backend/tests/test-http-direct.js
// Run: node tests/test-http-direct.js

import http from 'http';

const BASE_URL = 'http://localhost:8002';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMWYwN2FhOC1hYTI3LTQ2YTgtOGQ4ZC00YmVlZjk4NzIyMzkiLCJidXNpbmVzc0lkIjoiNjFmOTZmY2ItMjYzNi00YWQ3LWE2YzAtZWRiNTA0OWIyNmU1IiwiZW1haWwiOiJwaGFzZTEyQHRlc3QuY29tIiwicm9sZSI6Im93bmVyIiwidGltZXpvbmUiOiJBZnJpY2EvTmFpcm9iaSIsImlhdCI6MTc3NjQwMTE3NywiZXhwIjoxNzc3MDA1OTc3fQ.3s-G9feBEUgTJPiT4JzY3GxL1gd38OKRUHcJytFx4hA';
const PRODUCT_ID = '8d4cc147-0906-4122-ab4d-b4efa9a1e94a';

function timeRequest(name, makeRequest) {
    return new Promise((resolve) => {
        console.log(`\n⏱️  Testing: ${name}`);
        const start = Date.now();
        
        makeRequest((response) => {
            const duration = Date.now() - start;
            console.log(`   ✅ Completed in: ${duration}ms`);
            resolve({ name, duration });
        });
    });
}

// Test 1: Simple health check (no auth)
async function test1_HealthCheck() {
    return timeRequest('Health check (no auth)', (callback) => {
        http.get(`${BASE_URL}/api/health`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => callback(res));
        });
    });
}

// Test 2: GET request with auth (products list)
async function test2_GetProducts() {
    return timeRequest('GET /api/products (with auth)', (callback) => {
        const options = {
            hostname: 'localhost',
            port: 8002,
            path: '/api/products?limit=1',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => callback(res));
        });
        req.end();
    });
}

// Test 3: POST request with minimal body (our slow endpoint)
async function test3_PostPOSMinimal() {
    return timeRequest('POST /api/pos/transactions-with-discount (full flow)', (callback) => {
        const postData = JSON.stringify({
            customer_id: null,
            payment_method: 'cash',
            apply_discounts: false,
            items: [{
                item_type: 'product',
                product_id: PRODUCT_ID,
                item_name: 'HTTP Test',
                quantity: 1,
                unit_price: 100000
            }]
        });
        
        const options = {
            hostname: 'localhost',
            port: 8002,
            path: '/api/pos/transactions-with-discount',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const startTime = Date.now();
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                callback(res);
            });
        });
        
        req.on('error', (err) => {
            console.log(`   Error: ${err.message}`);
            callback(null);
        });
        
        req.write(postData);
        req.end();
    });
}

// Test 4: Check if there's a middleware that's slowing things
async function test4_CheckMiddleware() {
    // This would require creating a test endpoint that bypasses middleware
    console.log('\n📝 To test middleware, we can check what middleware is registered');
    console.log('   Look for: authentication, RLS context, logging, rate limiting');
    
    return { name: 'Middleware analysis', duration: 0 };
}

async function runHttpTests() {
    console.log('='.repeat(70));
    console.log('🔍 HTTP LAYER TIMING TESTS');
    console.log('='.repeat(70));
    
    const results = [];
    
    results.push(await test1_HealthCheck());
    results.push(await test2_GetProducts());
    results.push(await test3_PostPOSMinimal());
    
    console.log('\n' + '='.repeat(70));
    console.log('📊 HTTP TIMING RESULTS');
    console.log('='.repeat(70));
    
    results.forEach(r => {
        if (r.duration > 1000) {
            console.log(`⚠️  ${r.name}: ${r.duration}ms - SLOW!`);
        } else {
            console.log(`✅ ${r.name}: ${r.duration}ms`);
        }
    });
    
    const slowRequest = results.find(r => r.duration > 50000);
    if (slowRequest) {
        console.log(`\n🎯 The 60-second delay is in: ${slowRequest.name}`);
        console.log(`\n🔍 Next steps: Add timing logs to the Express middleware chain`);
    }
}

runHttpTests();
