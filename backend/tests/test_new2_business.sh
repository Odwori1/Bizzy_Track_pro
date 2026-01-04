#!/bin/bash

echo "=== TEST: Create New Business with Complete Accounting Setup ==="

# Generate unique timestamp
TIMESTAMP=$(date +%s)
TEST_EMAIL="accounting_test_${TIMESTAMP}@example.com"

echo ""
echo "2. Creating new test business via API..."

# Step 2: Create new business
curl -X POST http://localhost:8002/api/businesses/register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Accounting Test Business",
    "ownerName": "Test Owner",
    "email": "'"${TEST_EMAIL}"'",
    "password": "Test123456",
    "currency": "UGX",
    "timezone": "Africa/Nairobi"
  }' | jq '.business, .user.id, .token'

echo ""
echo "3. Logging in..."

# Step 3: Login to get token
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"${TEST_EMAIL}"'",
    "password": "Test123456"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
BUSINESS_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.business.id')

echo "Token: $TOKEN"
echo "Business ID: $BUSINESS_ID"

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "ERROR: Failed to get authentication token"
  exit 1
fi

if [ -z "$BUSINESS_ID" ] || [ "$BUSINESS_ID" = "null" ]; then
  echo "ERROR: Failed to get business ID"
  exit 1
fi

echo ""
echo "4. Verifying accounting setup..."

# Step 4: Verify accounts were created - using psql with proper quoting
psql -U postgres -p 5434 -d bizzytrack_pro <<EOF
-- Check chart of accounts
SELECT
    'Chart of Accounts' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) >= 28 THEN '✅ COMPLETE' ELSE '❌ INCOMPLETE' END as status
FROM chart_of_accounts
WHERE business_id = '$BUSINESS_ID'

UNION ALL

-- Check wallets
SELECT
    'Wallets' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) >= 3 THEN '✅ COMPLETE' ELSE '❌ INCOMPLETE' END as status
FROM money_wallets
WHERE business_id = '$BUSINESS_ID'

UNION ALL

-- Check wallet mappings
SELECT
    'Wallet Mappings' as check_type,
    COUNT(*) as count,
    CASE WHEN COUNT(*) = 3 THEN '✅ COMPLETE' ELSE '❌ INCOMPLETE' END as status
FROM money_wallets
WHERE business_id = '$BUSINESS_ID' AND gl_account_id IS NOT NULL;

-- Show detailed account list
SELECT account_code, account_name, account_type, is_active 
FROM chart_of_accounts 
WHERE business_id = '$BUSINESS_ID' 
ORDER BY account_code;

-- Show wallets with mappings
SELECT w.name, w.wallet_type, w.current_balance, ca.account_code
FROM money_wallets w
LEFT JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
WHERE w.business_id = '$BUSINESS_ID';
EOF

echo ""
echo "5. Testing POS transactions..."

# Step 5: Create inventory item
echo "Creating test product..."
INVENTORY_RESPONSE=$(curl -s -X POST http://localhost:8002/api/inventory/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "sku": "TEST-001",
    "category_id": null,
    "cost_price": 50000,
    "selling_price": 75000,
    "current_stock": 10,
    "unit_of_measure": "pcs"
  }')

INVENTORY_ITEM_ID=$(echo "$INVENTORY_RESPONSE" | jq -r '.id')

if [ -z "$INVENTORY_ITEM_ID" ] || [ "$INVENTORY_ITEM_ID" = "null" ]; then
  echo "ERROR: Failed to create inventory item. Response:"
  echo "$INVENTORY_RESPONSE"
  exit 1
fi

echo "Inventory Item ID: $INVENTORY_ITEM_ID"

# Step 6: Test all payment methods
echo ""
echo "6. Testing all payment methods..."
for method in cash card mobile_money; do
  echo ""
  echo "=== Testing $method payment ==="
  
  RESPONSE=$(curl -s -X POST http://localhost:8002/api/pos/transactions \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "total_amount": 75000,
      "final_amount": 75000,
      "payment_method": "'$method'",
      "items": [
        {
          "inventory_item_id": "'$INVENTORY_ITEM_ID'",
          "item_type": "product",
          "item_name": "Test Product",
          "quantity": 1,
          "unit_price": 75000,
          "total_price": 75000
        }
      ]
    }')
  
  echo "Response:"
  echo "$RESPONSE" | jq '.'
  
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success')
  ACCOUNTING_PROCESSED=$(echo "$RESPONSE" | jq -r '.data.accounting_processed')
  
  if [ "$SUCCESS" = "true" ] && [ "$ACCOUNTING_PROCESSED" = "true" ]; then
    echo "✅ $method payment processed successfully with accounting entries"
  else
    echo "❌ $method payment failed or accounting not processed"
    echo "Error: $(echo "$RESPONSE" | jq -r '.data.accounting_error // "Unknown error"')"
  fi
  
  # Wait 1 second between transactions
  sleep 1
done

echo ""
echo "=== FINAL VERIFICATION ==="

# Final verification of GL entries
psql -U postgres -p 5434 -d bizzytrack_pro <<EOF
-- Check total GL entries created
SELECT 
    'GL Entries Created' as check_type,
    COUNT(*) as count
FROM general_ledger_entries 
WHERE business_id = '$BUSINESS_ID';

-- Check GL entries by transaction type
SELECT 
    transaction_type,
    COUNT(*) as entry_count,
    SUM(amount) as total_amount
FROM general_ledger_entries 
WHERE business_id = '$BUSINESS_ID'
GROUP BY transaction_type
ORDER BY transaction_type;

-- Check wallet balances
SELECT 
    w.name,
    w.wallet_type,
    w.current_balance,
    ca.account_code
FROM money_wallets w
LEFT JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
WHERE w.business_id = '$BUSINESS_ID'
ORDER BY w.wallet_type;
EOF

echo ""
echo "=== TEST COMPLETE ==="
