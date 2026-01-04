#!/bin/bash
# CREATE NEW BUSINESS WITH ACCOUNTING SYSTEM TEST

echo "=== CREATE NEW BUSINESS TEST SCRIPT ==="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ------------------------------------------------------------
# 1. CREATE NEW BUSINESS VIA API
# ------------------------------------------------------------
echo -e "\n${YELLOW}1. Creating new business via API...${NC}"

TEST_EMAIL="accountingtest_$(date +%s)@example.com"
TEST_PASSWORD="Test123!"

REGISTER_RESPONSE=$(curl -s -X POST http://localhost:8002/api/businesses/register \
  -H "Content-Type: application/json" \
  -d "{
    \"businessName\": \"Accounting System Test Ltd\",
    \"ownerName\": \"Accounting Test Owner\",
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\",
    \"currency\": \"UGX\",
    \"timezone\": \"Africa/Nairobi\"
  }")

echo "API Response: $REGISTER_RESPONSE"

BUSINESS_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.business.id')
USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id')
ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.accessToken')

if [[ -z "$BUSINESS_ID" || "$BUSINESS_ID" == "null" ]]; then
  echo -e "${RED}❌ Business registration failed${NC}"
  echo "$REGISTER_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}✅ Business created with ID: $BUSINESS_ID${NC}"
echo -e "${GREEN}✅ User created with ID: $USER_ID${NC}"
echo -e "${GREEN}✅ Access token generated${NC}"

# ------------------------------------------------------------
# 2. VERIFY BUSINESS CREATION
# ------------------------------------------------------------
echo -e "\n${YELLOW}2. Verifying business creation...${NC}"

# Test authentication with new credentials
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

LOGIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.token')

if [[ -n "$LOGIN_TOKEN" && "$LOGIN_TOKEN" != "null" ]]; then
  echo -e "${GREEN}✅ Authentication successful with new credentials${NC}"
else
  echo -e "${RED}❌ Authentication failed${NC}"
  echo "$LOGIN_RESPONSE" | jq .
fi

# Use the access token for subsequent calls
TOKEN="$ACCESS_TOKEN"

# ------------------------------------------------------------
# 3. VERIFY CHART OF ACCOUNTS CREATED
# ------------------------------------------------------------
echo -e "\n${YELLOW}3. Verifying chart of accounts...${NC}"

sleep 2  # Wait for async processes

# Check accounts via database
ACCOUNT_COUNT=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t \
  -c "SELECT COUNT(*) FROM chart_of_accounts WHERE business_id = '$BUSINESS_ID';" | tr -d '[:space:]')

echo -e "${GREEN}✅ Chart of accounts created: $ACCOUNT_COUNT accounts${NC}"

# Display account categories
echo -e "\n${YELLOW}4. Account categories created:${NC}"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro \
  -c "SELECT 
        account_type,
        COUNT(*) as count,
        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active
      FROM chart_of_accounts 
      WHERE business_id = '$BUSINESS_ID'
      GROUP BY account_type
      ORDER BY 
        CASE account_type 
          WHEN 'asset' THEN 1
          WHEN 'liability' THEN 2
          WHEN 'equity' THEN 3
          WHEN 'revenue' THEN 4
          WHEN 'expense' THEN 5
          ELSE 6
        END;"

# ------------------------------------------------------------
# 5. CREATE TEST INVENTORY CATEGORY
# ------------------------------------------------------------
echo -e "\n${YELLOW}5. Creating test inventory category...${NC}"

CATEGORY_RESPONSE=$(curl -s -X POST http://localhost:8002/api/inventory/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Electronics",
    "description": "Electronics for testing",
    "is_active": true
  }')

CATEGORY_ID=$(echo "$CATEGORY_RESPONSE" | jq -r '.data.id')

if [[ -n "$CATEGORY_ID" && "$CATEGORY_ID" != "null" ]]; then
  echo -e "${GREEN}✅ Category created: $CATEGORY_ID${NC}"
else
  echo -e "${YELLOW}⚠️ Using existing category or manual creation${NC}"
  # Try to get an existing category
  CATEGORY_ID=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t \
    -c "SELECT id FROM inventory_categories WHERE business_id = '$BUSINESS_ID' LIMIT 1;" | tr -d '[:space:]')
fi

# ------------------------------------------------------------
# 6. CREATE TEST PRODUCTS WITH INVENTORY
# ------------------------------------------------------------
echo -e "\n${YELLOW}6. Creating test products...${NC}"

# Product 1: Test Laptop
PRODUCT1_RESPONSE=$(curl -s -X POST http://localhost:8002/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Laptop\",
    \"description\": \"High-end laptop for testing\",
    \"category_id\": \"$CATEGORY_ID\",
    \"cost_price\": 1500000.00,
    \"selling_price\": 2000000.00,
    \"current_stock\": 10,
    \"min_stock_level\": 2,
    \"unit_of_measure\": \"units\",
    \"is_active\": true,
    \"auto_create_inventory\": true
  }")

PRODUCT1_ID=$(echo "$PRODUCT1_RESPONSE" | jq -r '.data.id')
PRODUCT1_INVENTORY_ID=$(echo "$PRODUCT1_RESPONSE" | jq -r '.data.inventory_item_id')

if [[ -n "$PRODUCT1_ID" && "$PRODUCT1_ID" != "null" ]]; then
  echo -e "${GREEN}✅ Product 1 created: Test Laptop ($PRODUCT1_ID)${NC}"
  if [[ -n "$PRODUCT1_INVENTORY_ID" && "$PRODUCT1_INVENTORY_ID" != "null" ]]; then
    echo -e "${GREEN}   Inventory linked: $PRODUCT1_INVENTORY_ID${NC}"
  fi
else
  echo -e "${RED}❌ Product 1 creation failed${NC}"
  echo "$PRODUCT1_RESPONSE" | jq .
fi

# Product 2: Test Mouse
PRODUCT2_RESPONSE=$(curl -s -X POST http://localhost:8002/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Test Mouse\",
    \"description\": \"Wireless mouse for testing\",
    \"category_id\": \"$CATEGORY_ID\",
    \"cost_price\": 50000.00,
    \"selling_price\": 75000.00,
    \"current_stock\": 50,
    \"min_stock_level\": 10,
    \"unit_of_measure\": \"units\",
    \"is_active\": true,
    \"auto_create_inventory\": true
  }")

PRODUCT2_ID=$(echo "$PRODUCT2_RESPONSE" | jq -r '.data.id')
PRODUCT2_INVENTORY_ID=$(echo "$PRODUCT2_RESPONSE" | jq -r '.data.inventory_item_id')

if [[ -n "$PRODUCT2_ID" && "$PRODUCT2_ID" != "null" ]]; then
  echo -e "${GREEN}✅ Product 2 created: Test Mouse ($PRODUCT2_ID)${NC}"
  if [[ -n "$PRODUCT2_INVENTORY_ID" && "$PRODUCT2_INVENTORY_ID" != "null" ]]; then
    echo -e "${GREEN}   Inventory linked: $PRODUCT2_INVENTORY_ID${NC}"
  fi
else
  echo -e "${RED}❌ Product 2 creation failed${NC}"
  echo "$PRODUCT2_RESPONSE" | jq .
fi

sleep 2  # Wait for inventory sync

# ------------------------------------------------------------
# 7. VERIFY INITIAL STATE VIA DATABASE
# ------------------------------------------------------------
echo -e "\n${YELLOW}7. Verifying initial database state...${NC}"

echo -e "${YELLOW}Inventory status:${NC}"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro \
  -c "SELECT 
        name,
        current_stock,
        cost_price,
        selling_price,
        (current_stock * cost_price) as inventory_value
      FROM inventory_items 
      WHERE business_id = '$BUSINESS_ID';"

echo -e "\n${YELLOW}Product status:${NC}"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro \
  -c "SELECT 
        name,
        current_stock,
        selling_price,
        (current_stock * selling_price) as potential_revenue
      FROM products 
      WHERE business_id = '$BUSINESS_ID';"

echo -e "\n${YELLOW}Accounting summary:${NC}"
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro \
  -c "SELECT 
        account_type,
        COUNT(*) as accounts,
        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active
      FROM chart_of_accounts 
      WHERE business_id = '$BUSINESS_ID'
      GROUP BY account_type;"

# ------------------------------------------------------------
# 8. CREATE OPENING BALANCE JOURNAL ENTRY (Manual for test)
# ------------------------------------------------------------
echo -e "\n${YELLOW}8. Creating opening balance journal entry...${NC}"

OPENING_ENTRY=$(curl -s -X POST http://localhost:8002/api/accounting/journal-entries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"description\": \"Opening balances - Initial business investment\",
    \"journal_date\": \"$(date -d '-7 days' +%Y-%m-%d)\",
    \"reference_type\": \"opening_balance\",
    \"lines\": [
      {
        \"account_code\": \"1110\",
        \"amount\": 5000000.00,
        \"line_type\": \"debit\",
        \"description\": \"Initial cash investment\"
      },
      {
        \"account_code\": \"3100\",
        \"amount\": 5000000.00,
        \"line_type\": \"credit\",
        \"description\": \"Owner capital contribution\"
      }
    ]
  }")

JOURNAL_ENTRY_ID=$(echo "$OPENING_ENTRY" | jq -r '.data.journal_entry.id')

if [[ -n "$JOURNAL_ENTRY_ID" && "$JOURNAL_ENTRY_ID" != "null" ]]; then
  echo -e "${GREEN}✅ Opening balance journal entry created: $JOURNAL_ENTRY_ID${NC}"
else
  echo -e "${RED}❌ Opening balance creation failed${NC}"
  echo "$OPENING_ENTRY" | jq .
fi

# ------------------------------------------------------------
# 9. VERIFY ACCOUNTING EQUATION
# ------------------------------------------------------------
echo -e "\n${YELLOW}9. Verifying accounting equation...${NC}"

psql -h localhost -p 5434 -U postgres -d bizzytrack_pro <<SQL
DO \$\$
DECLARE
  v_total_debits NUMERIC;
  v_total_credits NUMERIC;
  v_difference NUMERIC;
BEGIN
  SELECT 
    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END),
    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END)
  INTO v_total_debits, v_total_credits
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.business_id = '$BUSINESS_ID';
  
  v_difference := ABS(COALESCE(v_total_debits, 0) - COALESCE(v_total_credits, 0));
  
  RAISE NOTICE 'Total Debits:  % UGX', COALESCE(v_total_debits, 0);
  RAISE NOTICE 'Total Credits: % UGX', COALESCE(v_total_credits, 0);
  
  IF v_difference < 0.01 THEN
    RAISE NOTICE '✅ ACCOUNTING EQUATION BALANCED!';
  ELSE
    RAISE NOTICE '❌ ACCOUNTING EQUATION IMBALANCED! Difference: % UGX', v_difference;
  END IF;
END
\$\$;
SQL

# ------------------------------------------------------------
# 10. OUTPUT TEST CREDENTIALS
# ------------------------------------------------------------
echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}TEST BUSINESS CREATED SUCCESSFULLY!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo -e "${YELLOW}Business Name:${NC} Accounting System Test Ltd"
echo -e "${YELLOW}Business ID:${NC}   $BUSINESS_ID"
echo -e "${YELLOW}Login Email:${NC}   $TEST_EMAIL"
echo -e "${YELLOW}Password:${NC}      $TEST_PASSWORD"
echo -e "${YELLOW}User ID:${NC}       $USER_ID"
echo -e "${YELLOW}Access Token:${NC}  $TOKEN"
echo -e "${GREEN}=========================================${NC}"
echo -e "${YELLOW}INITIAL STATE:${NC}"
echo -e "- Cash: 5,000,000 UGX (opening balance)"
echo -e "- Inventory: 2 products created"
echo -e "  • Test Laptop: 10 units @ 2,000,000 UGX"
echo -e "  • Test Mouse: 50 units @ 75,000 UGX"
echo -e "- Owner Capital: 5,000,000 UGX"
echo -e "${GREEN}=========================================${NC}"

# Save credentials to file for easy reference
cat > ~/Bizzy_Track_pro/test_business_credentials.txt <<EOF
=== TEST BUSINESS CREDENTIALS ===
Created: $(date)
Business Name: Accounting System Test Ltd
Business ID: $BUSINESS_ID
Login Email: $TEST_EMAIL
Password: $TEST_PASSWORD
User ID: $USER_ID
Access Token: $TOKEN
Category ID: $CATEGORY_ID
Product 1 (Laptop): $PRODUCT1_ID
Product 2 (Mouse): $PRODUCT2_ID
=================================
EOF

echo -e "${GREEN}✅ Credentials saved to: ~/Bizzy_Track_pro/test_business_credentials.txt${NC}"

# ------------------------------------------------------------
# 11. CREATE POS TRANSACTION TEST
# ------------------------------------------------------------
echo -e "\n${YELLOW}11. Testing POS transaction with accounting...${NC}"

if [[ -n "$PRODUCT1_ID" && "$PRODUCT1_ID" != "null" ]]; then
  POS_TEST_RESPONSE=$(curl -s -X POST http://localhost:8002/api/pos/transactions \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"total_amount\": 2000000,
      \"final_amount\": 2000000,
      \"payment_method\": \"cash\",
      \"payment_status\": \"completed\",
      \"status\": \"completed\",
      \"notes\": \"Test sale to verify accounting\",
      \"items\": [
        {
          \"product_id\": \"$PRODUCT1_ID\",
          \"item_type\": \"product\",
          \"item_name\": \"Test Laptop\",
          \"quantity\": 1,
          \"unit_price\": 2000000,
          \"total_price\": 2000000
        }
      ]
    }")

  POS_TRANSACTION_ID=$(echo "$POS_TEST_RESPONSE" | jq -r '.data.id')
  ACCOUNTING_PROCESSED=$(echo "$POS_TEST_RESPONSE" | jq -r '.data.accounting_processed')

  if [[ -n "$POS_TRANSACTION_ID" && "$POS_TRANSACTION_ID" != "null" ]]; then
    echo -e "${GREEN}✅ POS transaction created: $POS_TRANSACTION_ID${NC}"
    echo -e "${GREEN}✅ Accounting processed: $ACCOUNTING_PROCESSED${NC}"
    
    # Quick verification
    echo -e "\n${YELLOW}Accounting verification:${NC}"
    psql -h localhost -p 5434 -U postgres -d bizzytrack_pro \
      -c "SELECT 
            ca.account_code,
            ca.account_name,
            jel.line_type,
            jel.amount
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          JOIN chart_of_accounts ca ON jel.account_id = ca.id
          WHERE je.reference_id = '$POS_TRANSACTION_ID'::TEXT
          ORDER BY 
            CASE WHEN jel.line_type = 'debit' THEN 0 ELSE 1 END,
            ca.account_code;"
  else
    echo -e "${RED}❌ POS transaction test failed${NC}"
    echo "$POS_TEST_RESPONSE" | jq .
  fi
else
  echo -e "${YELLOW}⚠️ Skipping POS test (product not created)${NC}"
fi

echo -e "\n${GREEN}=== TEST COMPLETE ===${NC}"
echo "Use these credentials to run your E2E accounting test:"
echo "Email: $TEST_EMAIL"
echo "Password: $TEST_PASSWORD"
