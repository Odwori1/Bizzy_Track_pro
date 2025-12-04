#!/bin/bash

echo "=== COMPREHENSIVE SYSTEM DIAGNOSTICS ==="

# 1. Check all accounting-related tables
echo -e "\n1. ACCOUNTING TABLES IN DATABASE:"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND (
    table_name LIKE '%journal%' 
    OR table_name LIKE '%account%' 
    OR table_name LIKE '%ledger%'
    OR table_name LIKE '%inventory%'
)
ORDER BY table_name;"

# 2. Check journal_entries table sample data
echo -e "\n2. SAMPLE JOURNAL ENTRIES:"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT 
    id,
    reference_number,
    description,
    journal_date,
    reference_type,
    total_amount,
    status,
    created_at
FROM journal_entries 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY created_at DESC
LIMIT 3;"

# 3. Check chart_of_accounts
echo -e "\n3. CHART OF ACCOUNTS:"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT 
    account_code,
    account_name,
    account_type,
    is_active
FROM chart_of_accounts 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY account_code;"

# 4. Check authentication middleware
echo -e "\n4. AUTHENTICATION MIDDLEWARE STRUCTURE:"
if [ -f "backend/app/middleware/auth.js" ]; then
    echo "=== auth.js exists ==="
    grep -n "req.user" backend/app/middleware/auth.js | head -10
    echo "..."
else
    echo "auth.js not found. Looking for authentication..."
    find backend/ -name "*auth*" -type f | head -10
fi

# 5. Check validation middleware
echo -e "\n5. VALIDATION MIDDLEWARE:"
if [ -f "backend/app/middleware/validation.js" ]; then
    echo "=== validation.js ==="
    head -50 backend/app/middleware/validation.js
else
    echo "validation.js not found"
fi

# 6. Check service method signatures
echo -e "\n6. SERVICE METHOD SIGNATURES:"
echo "=== accountingService.js ==="
grep -n "static async" backend/app/services/accountingService.js

echo -e "\n=== inventoryAccountingService.js ==="
grep -n "static async" backend/app/services/inventoryAccountingService.js

# 7. Check route registrations
echo -e "\n7. ROUTE REGISTRATIONS IN MAIN APP:"
if [ -f "backend/app.js" ] || [ -f "backend/server.js" ] || [ -f "backend/index.js" ]; then
    MAIN_FILE=$(find backend/ -name "app.js" -o -name "server.js" -o -name "index.js" | head -1)
    echo "Main file: $MAIN_FILE"
    grep -n "accounting" "$MAIN_FILE" | head -5
fi
