#!/bin/bash

echo "=== TEST ACCOUNTING FIX ==="
echo

# 1. Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fixed@test.com",
    "password": "fixed123"
  }' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

echo "Token obtained"
echo

# 2. Create POS sale
echo "Creating POS sale..."
curl -X POST "http://localhost:8002/api/pos/transactions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": null,
    "items": [
      {
        "product_id": "69bbff25-fa33-440a-a87f-4bdbdecaa5e6",
        "quantity": 1,
        "unit_price": 100.00,
        "discount": 0,
        "tax": 0,
        "item_type": "product",
        "item_name": "Test Product",
        "total_price": 100.00
      }
    ],
    "payment_method": "cash",
    "wallet_id": "67872c75-d020-4d4c-9e9e-db5bfeab0241",
    "discount_amount": 0,
    "tax_amount": 0,
    "total_amount": 100.00,
    "final_amount": 100.00,
    "notes": "Test accounting automation fix"
  }'

echo
echo "Waiting for processing..."
sleep 2

# 3. Check results
echo "Checking database..."
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
-- Check POS transaction
SELECT '=== POS TRANSACTION ===' as info;
SELECT 
    id,
    transaction_number,
    final_amount,
    status,
    created_at
FROM pos_transactions 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY created_at DESC 
LIMIT 1;

-- Check journal entries
SELECT '=== JOURNAL ENTRIES ===' as info;
SELECT 
    reference_number,
    description,
    total_amount,
    created_at
FROM journal_entries 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
  AND reference_type = 'pos_transaction'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- Check audit logs
SELECT '=== AUDIT LOGS ===' as info;
SELECT 
    action,
    resource_type,
    new_values->>'amount' as amount,
    new_values->>'automated' as automated,
    new_values->>'error' as error,
    created_at
FROM audit_logs 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
  AND action LIKE '%accounting%'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- Check accounting equation
SELECT '=== ACCOUNTING CHECK ===' as info;
WITH totals AS (
    SELECT 
        SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
        SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.journal_entry_id = je.id
    WHERE je.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
)
SELECT 
    total_debits,
    total_credits,
    CASE 
        WHEN total_debits = total_credits THEN '✅ BALANCED'
        ELSE '❌ UNBALANCED'
    END as status
FROM totals;
"
