#!/bin/bash
# test_accounting_flow.sh

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== Testing Accounting Flow ==="

# 1. Login
echo -e "\n1. Logging in..."
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "foundationtest@example.com", "password": "Test123!"}' \
  | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo "Token: ${TOKEN:0:50}..."

# 2. Test accounting endpoints
echo -e "\n2. Testing accounting endpoints..."

# Check if accounting stats works
echo -e "\n   Testing GET /api/accounting/stats:"
STATS_RESPONSE=$(curl -s -X GET http://localhost:8002/api/accounting/stats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$STATS_RESPONSE" | jq .

# 3. Create a test transaction manually via SQL first
echo -e "\n3. Creating test transaction via SQL..."
cat > /tmp/create_test_transaction.sql << 'EOF'
DO $$
DECLARE
    v_business_id UUID := '20783240-3d55-4af1-a779-fe6044ee4963';
    v_user_id UUID := '122fa064-f702-4655-b1c9-cec9d8c839e0';
    v_product_id UUID;
    v_transaction_id UUID;
BEGIN
    RAISE NOTICE '=== Creating API test transaction ===';
    
    -- Get a product
    SELECT id INTO v_product_id
    FROM products 
    WHERE business_id = v_business_id 
      AND cost_price > 0
    LIMIT 1;
    
    -- Create transaction
    v_transaction_id := gen_random_uuid();
    
    INSERT INTO pos_transactions (
        id, business_id, transaction_number,
        total_amount, final_amount, payment_method,
        status, created_by, accounting_processed
    ) VALUES (
        v_transaction_id,
        v_business_id,
        'API-TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        150.00,
        150.00,
        'cash',
        'completed',
        v_user_id,
        FALSE
    );
    
    -- Add item
    INSERT INTO pos_transaction_items (
        id, business_id, pos_transaction_id,
        product_id, item_type, item_name,
        quantity, unit_price, total_price
    ) VALUES (
        gen_random_uuid(),
        v_business_id,
        v_transaction_id,
        v_product_id,
        'product',
        'API Test Product',
        1,
        150.00,
        150.00
    );
    
    RAISE NOTICE 'Transaction created: %', v_transaction_id;
    
    -- Store for API test
    PERFORM set_config('api_test.transaction_id', v_transaction_id::TEXT, FALSE);
END $$;
EOF

# Run the SQL
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -f /tmp/create_test_transaction.sql

# 4. Get the transaction ID
TRANSACTION_ID=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t -c "SELECT current_setting('api_test.transaction_id', true) LIMIT 1;" 2>/dev/null | tr -d '[:space:]')

if [ -z "$TRANSACTION_ID" ] || [ "$TRANSACTION_ID" = "null" ]; then
    # Try to get the last created transaction
    TRANSACTION_ID=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t -c "SELECT id FROM pos_transactions WHERE business_id = '20783240-3d55-4af1-a779-fe6044ee4963' AND transaction_number LIKE 'API-TEST-%' ORDER BY created_at DESC LIMIT 1;" 2>/dev/null | tr -d '[:space:]')
fi

echo -e "\nTest Transaction ID: $TRANSACTION_ID"

# 5. Test the process-pos endpoint
echo -e "\n4. Testing POST /api/accounting/process-pos:"
PROCESS_RESPONSE=$(curl -s -X POST http://localhost:8002/api/accounting/process-pos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"transactionId\": \"$TRANSACTION_ID\"}")

echo "$PROCESS_RESPONSE" | jq .

# 6. Check what was created
echo -e "\n5. Verifying journal entry created:"
cat > /tmp/check_journal_entry.sql << EOF
SELECT 
    'Journal Entry Created' as check,
    je.id as journal_entry_id,
    je.reference_number,
    je.description,
    COUNT(jel.id) as line_count,
    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.reference_type = 'pos_transaction'
  AND je.reference_id = '$TRANSACTION_ID'
GROUP BY je.id, je.reference_number, je.description;

-- Show the lines
SELECT 
    coa.account_code,
    coa.account_name,
    jel.line_type,
    jel.amount,
    CASE 
        WHEN coa.account_code = '1110' THEN '✅ Cash'
        WHEN coa.account_code = '4100' THEN '✅ Sales'
        WHEN coa.account_code = '5100' THEN '✅ COGS'
        WHEN coa.account_code = '1300' THEN '✅ Inventory'
        ELSE '❓ Other'
    END as verification
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE jel.journal_entry_id = (
    SELECT id FROM journal_entries 
    WHERE reference_type = 'pos_transaction'
      AND reference_id = '$TRANSACTION_ID'
    LIMIT 1
)
ORDER BY 
    CASE WHEN jel.line_type = 'debit' THEN 1 ELSE 2 END,
    coa.account_code;
EOF

psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -f /tmp/check_journal_entry.sql

echo -e "\n=== Test Complete ==="
