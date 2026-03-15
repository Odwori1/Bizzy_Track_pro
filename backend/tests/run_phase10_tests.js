#!/usr/bin/env node
// File: ~/Bizzy_Track_pro/backend/tests/run_phase10_tests.js
// FIXED VERSION - Correct test parsing and timeout handling

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TEST_FILES = [
    // Core services first - these create base data
    { name: 'Discount Core', file: 'test_discount_core.js', order: 1 },
    { name: 'Discount Rules', file: 'test_discount_rules.js', order: 2 },
    
    // Discount type tests - these create test data others might use
    { name: 'Promotional Discounts', file: 'test_promotional_discounts.js', order: 3 },
    { name: 'Early Payment', file: 'test_early_payment.js', order: 4 },
    { name: 'Volume Discounts', file: 'test_volume_discounts.js', order: 5 },
    
    // Allocation and accounting - depend on above data
    { name: 'Discount Allocation', file: 'test_discount_allocation.js', order: 6 },
    { name: 'Discount Accounting', file: 'test_discount_accounting.js', order: 7 },
    { name: 'Discount Analytics', file: 'test_discount_analytics.js', order: 8 },
    
    // Engine - orchestrator
    { name: 'Discount Rule Engine', file: 'test_discount_engine.js', order: 9 },
    
    // Integration tests - these use real data
    { name: 'Approval Flow', file: 'test_approval_flow.js', order: 10 },
    { name: 'POS Integration', file: 'test_pos_integration.js', order: 11 },
    { name: 'Invoice Integration', file: 'test_invoice_integration.js', order: 12 }
].sort((a, b) => a.order - b.order);

const REPORT_FILE = path.join(__dirname, 'phase10_test_report.html');
const LOG_FILE = path.join(__dirname, 'test_run.log');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

// Add timeout for each test (5 minutes max per test file)
const TEST_TIMEOUT = 300000; // 5 minutes in milliseconds

async function runTests() {
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}   PHASE 10 DISCOUNT SYSTEM TEST RUNNER   ${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}\n`);
    
    console.log(`${colors.yellow}Running ${TEST_FILES.length} test files in optimized order...${colors.reset}`);
    console.log(`${colors.blue}Order: ${TEST_FILES.map(f => f.file.replace('test_', '').replace('.js', '')).join(' → ')}${colors.reset}\n`);
    
    const results = [];
    let totalTests = 0;
    let totalPassed = 0;
    let startTime = Date.now();
    
    // Create log stream
    let logStream = await fs.open(LOG_FILE, 'w');
    await logStream.write(`Test Run Started: ${new Date().toISOString()}\n`);
    await logStream.write(`========================================\n\n`);
    
    for (const testFile of TEST_FILES) {
        console.log(`\n${colors.bright}${colors.blue}▶ Running: ${testFile.file}${colors.reset}`);
        console.log(`${colors.cyan}  ${testFile.name}${colors.reset}`);
        
        const filePath = path.join(__dirname, testFile.file);
        const testStart = Date.now();
        
        try {
            // Run the test file with timeout
            const { stdout, stderr } = await execAsync(`node ${filePath}`, { timeout: TEST_TIMEOUT });
            
            // Parse results from stdout - FIXED PARSING
            const result = parseTestResults(stdout, stderr, testFile);
            result.duration = Date.now() - testStart;
            
            // Update totals
            totalTests += result.totalTests || 0;
            totalPassed += result.passedTests || 0;
            
            // Log to file
            await logStream.write(`\n=== ${testFile.file} ===\n`);
            await logStream.write(`Duration: ${result.duration}ms\n`);
            await logStream.write(`Tests: ${result.passedTests}/${result.totalTests} passed\n`);
            await logStream.write(`\nSTDOUT:\n${stdout}\n`);
            if (stderr) {
                await logStream.write(`\nSTDERR:\n${stderr}\n`);
            }
            await logStream.write(`\n${'-'.repeat(50)}\n`);
            
            // Display result
            if (result.passedTests === result.totalTests) {
                console.log(`  ${colors.green}✅ PASSED: ${result.passedTests}/${result.totalTests} tests (${result.duration}ms)${colors.reset}`);
            } else {
                console.log(`  ${colors.red}❌ FAILED: ${result.passedTests}/${result.totalTests} tests (${result.duration}ms)${colors.reset}`);
                if (result.failures.length > 0) {
                    console.log(`  ${colors.red}   Failures:${colors.reset}`);
                    result.failures.slice(0, 3).forEach(f => {
                        console.log(`  ${colors.red}   - ${f}${colors.reset}`);
                    });
                    if (result.failures.length > 3) {
                        console.log(`  ${colors.red}   ... and ${result.failures.length - 3} more${colors.reset}`);
                    }
                }
            }
            
            results.push(result);
            
        } catch (error) {
            // Handle test execution failure or timeout
            let errorMessage = error.message;
            let isTimeout = error.killed || error.signal === 'SIGTERM';
            
            if (isTimeout) {
                errorMessage = `Test timed out after ${TEST_TIMEOUT/1000} seconds`;
                console.log(`  ${colors.red}❌ TIMEOUT: ${testFile.file} exceeded time limit${colors.reset}`);
            } else {
                console.log(`  ${colors.red}❌ EXECUTION FAILED: ${error.message}${colors.reset}`);
            }
            
            const result = {
                ...testFile,
                passed: false,
                totalTests: 0,
                passedTests: 0,
                failures: [errorMessage],
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                duration: Date.now() - testStart
            };
            
            await logStream.write(`\n=== ${testFile.file} ===\n`);
            await logStream.write(`ERROR: ${errorMessage}\n`);
            if (error.stdout) await logStream.write(`\nSTDOUT:\n${error.stdout}\n`);
            if (error.stderr) await logStream.write(`\nSTDERR:\n${error.stderr}\n`);
            
            results.push(result);
        }
    }
    
    const totalDuration = Date.now() - startTime;
    
    await logStream.write(`\n========================================\n`);
    await logStream.write(`Test Run Completed: ${new Date().toISOString()}\n`);
    await logStream.write(`Total Duration: ${totalDuration}ms\n`);
    await logStream.write(`Overall: ${totalPassed}/${totalTests} tests passed\n`);
    await logStream.close();
    
    // Generate HTML report
    await generateHTMLReport(results, totalTests, totalPassed, totalDuration);
    
    // Display summary
    console.log(`\n${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}            TEST SUMMARY                ${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}========================================${colors.reset}`);
    console.log(`${colors.bright}Total Tests: ${totalTests}${colors.reset}`);
    console.log(`${colors.bright}Passed: ${colors.green}${totalPassed}${colors.reset}`);
    console.log(`${colors.bright}Failed: ${colors.red}${totalTests - totalPassed}${colors.reset}`);
    console.log(`${colors.bright}Duration: ${(totalDuration / 1000).toFixed(2)}s${colors.reset}`);
    console.log(`${colors.bright}Success Rate: ${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%${colors.reset}`);
    console.log(`\n${colors.green}📊 HTML Report generated: ${REPORT_FILE}${colors.reset}`);
    console.log(`${colors.yellow}📝 Detailed log: ${LOG_FILE}${colors.reset}`);
}

function parseTestResults(stdout, stderr, testFile) {
    const lines = stdout.split('\n');
    const failures = [];
    
    // Find the summary line: "📈 SUMMARY: X/Y tests passed"
    const summaryLine = lines.find(l => l.includes('📈 SUMMARY:') && l.includes('/') && l.includes('tests passed'));
    
    let passedTests = 0;
    let totalTests = 0;
    
    if (summaryLine) {
        // Extract numbers from summary line
        const match = summaryLine.match(/SUMMARY:\s*(\d+)\/(\d+)/);
        if (match) {
            passedTests = parseInt(match[1]);
            totalTests = parseInt(match[2]);
        }
    } else {
        // Fallback: Count test blocks by looking for numbered tests
        // Each test starts with a number followed by dot: "1. Test name"
        const testNumbers = lines.filter(l => l.match(/^\d+\./)).length;
        
        // Count ✅ and ❌ indicators
        const passed = lines.filter(l => l.includes('✅')).length;
        const failed = lines.filter(l => l.includes('❌')).length;
        
        totalTests = testNumbers || (passed + failed);
        passedTests = passed;
    }
    
    // Find failures - look for ❌ FAIL lines and get the test name
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('❌ FAIL')) {
            // Look backwards for the test number line
            for (let j = i - 3; j < i; j++) {
                if (lines[j] && lines[j].match(/^\d+\./)) {
                    failures.push(lines[j].trim());
                    break;
                }
            }
        }
    }
    
    return {
        ...testFile,
        passed: passedTests === totalTests,
        totalTests,
        passedTests,
        failures,
        stdout,
        stderr
    };
}

async function generateHTMLReport(results, totalTests, totalPassed, totalDuration) {
    const date = new Date().toLocaleString();
    const passRate = totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0;
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Phase 10 Discount System Test Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }
        body {
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .date {
            opacity: 0.9;
            font-size: 14px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            text-align: center;
        }
        .stat-card .label {
            color: #6c757d;
            font-size: 14px;
            margin-bottom: 8px;
        }
        .stat-card .value {
            font-size: 32px;
            font-weight: bold;
            color: #2d3748;
        }
        .stat-card .value.pass { color: #48bb78; }
        .stat-card .value.fail { color: #f56565; }
        .summary {
            padding: 30px;
            border-bottom: 1px solid #e9ecef;
        }
        .progress-bar {
            height: 20px;
            background: #edf2f7;
            border-radius: 10px;
            overflow: hidden;
            margin: 15px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #48bb78 0%, #38a169 100%);
            width: ${passRate}%;
            transition: width 0.3s ease;
        }
        .results {
            padding: 30px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            text-align: left;
            padding: 12px;
            background: #f8f9fa;
            color: #495057;
            font-weight: 600;
            font-size: 14px;
            border-bottom: 2px solid #dee2e6;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
            color: #2d3748;
        }
        tr:hover {
            background: #f8f9fa;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-pass {
            background: #c6f6d5;
            color: #22543d;
        }
        .status-fail {
            background: #fed7d7;
            color: #742a2a;
        }
        .status-timeout {
            background: #fff3cd;
            color: #856404;
        }
        .failures {
            margin-top: 5px;
            font-size: 12px;
            color: #f56565;
            list-style: none;
        }
        .duration {
            color: #718096;
            font-size: 12px;
        }
        .footer {
            padding: 20px 30px;
            background: #f8f9fa;
            border-top: 1px solid #e9ecef;
            color: #718096;
            font-size: 12px;
            text-align: center;
        }
        .warning {
            background: #fff3cd;
            color: #856404;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            font-size: 13px;
        }
        .note {
            background: #e7f5ff;
            color: #1e4a6b;
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Phase 10 Discount System Test Report</h1>
            <div class="date">Generated: ${date}</div>
            <div class="date">Total Duration: ${(totalDuration / 1000).toFixed(2)} seconds</div>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="label">Total Tests</div>
                <div class="value">${totalTests}</div>
            </div>
            <div class="stat-card">
                <div class="label">Passed</div>
                <div class="value pass">${totalPassed}</div>
            </div>
            <div class="stat-card">
                <div class="label">Failed</div>
                <div class="value fail">${totalTests - totalPassed}</div>
            </div>
            <div class="stat-card">
                <div class="label">Pass Rate</div>
                <div class="value ${passRate >= 90 ? 'pass' : 'fail'}">${passRate}%</div>
            </div>
        </div>
        
        <div class="summary">
            <h2>Overall Progress</h2>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                <span>${totalPassed} tests passing</span>
                <span>${totalTests - totalPassed} tests failing</span>
            </div>
            
            <div class="note">
                ℹ️ <strong>Test Order:</strong> Tests were run in optimized order: Core → Types → Allocation → Integration
            </div>
            
            <div class="warning">
                ⚠️ <strong>Note on Failures:</strong> If you see failures, check:
                <ul style="margin-left: 20px; margin-top: 5px;">
                    <li>Database has test data (business ID: ac7de9dd-7cc8-41c9-94f7-611a4ade5256)</li>
                    <li>Users exist in the database</li>
                    <li>Promo code TEST16 is active (for POS/invoice tests)</li>
                    <li>Volume discount tiers exist in the database</li>
                </ul>
            </div>
        </div>
        
        <div class="results">
            <h2>Test Results by File</h2>
            <table>
                <thead>
                    <tr>
                        <th>Order</th>
                        <th>Test File</th>
                        <th>Component</th>
                        <th>Status</th>
                        <th>Tests</th>
                        <th>Duration</th>
                        <th>Failures</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(r => {
                        let statusClass = 'status-fail';
                        let statusText = '❌ FAIL';
                        
                        if (r.passed && r.totalTests > 0) {
                            statusClass = 'status-pass';
                            statusText = '✅ PASS';
                        } else if (r.failures.includes('timed out')) {
                            statusClass = 'status-timeout';
                            statusText = '⏱️ TIMEOUT';
                        }
                        
                        return `
                        <tr>
                            <td>#${r.order}</td>
                            <td><code>${r.file}</code></td>
                            <td>${r.name}</td>
                            <td>
                                <span class="status-badge ${statusClass}">
                                    ${statusText}
                                </span>
                            </td>
                            <td>${r.passedTests || 0}/${r.totalTests || 0}</td>
                            <td class="duration">${r.duration || 0}ms</td>
                            <td>
                                ${r.failures && r.failures.length > 0 ? `
                                    <ul class="failures">
                                        ${r.failures.map(f => `<li>${f}</li>`).join('')}
                                    </ul>
                                ` : '—'}
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="footer">
            <p>Test Runner completed at ${date}</p>
            <p>Detailed logs available in <code>test_run.log</code></p>
            <p style="margin-top: 10px;">📁 Bizzy Track Pro - Discount Accounting System | Phase 10 Complete</p>
        </div>
    </div>
</body>
</html>`;
    
    await fs.writeFile(REPORT_FILE, html);
}

// Run the tests
runTests().catch(console.error);
