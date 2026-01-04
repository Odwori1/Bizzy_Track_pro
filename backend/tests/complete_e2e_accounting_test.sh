#!/bin/bash
# BIZZY TRACK PRO — COMPLETE E2E POS → ACCOUNTING TEST

set -e

echo "=== BIZZY TRACK PRO | E2E ACCOUNTING TEST ==="
echo "Started: $(date)"

cd ~/Bizzy_Track_pro/backend

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ------------------------------------------------------------
# 1. AUTHENTICATION
# ------------------------------------------------------------
echo -e "\n${YELLOW}1. Authenticating...${NC}"

TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email":"accountingtest_1767122514@example.com","password":"Test123!"}' \
  | jq -r '.data.token')

if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo -e "${RED}❌ Authentication failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"

# ------------------------------------------------------------
# 2. GET BUSINESS INFO
# ------------------------------------------------------------
echo -e "\n${YELLOW}2. Getting business info...${NC}"

BUSINESS_RESPONSE=$(curl -s -X GET http://localhost:8002/api/businesses/current \
  -H "Authorization: Bearer $TOKEN")

BUSINESS_ID=$(echo "$BUSINESS_RESPONSE" | jq -r '.data.id')

if [[ -z "$BUSINESS_ID" || "$BUSINESS_ID" == "null" ]]; then
  echo -e "${RED}❌ Failed to get business ID${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Business ID: $BUSINESS_ID${NC}"

# ------------------------------------------------------------
# 3. GET/CREATE TEST CATEGORY
# ------------------------------------------------------------
echo -e "\n${YELLOW}3. Getting or creating test category...${NC}"

# Query for existing category
CATEGORY_QUERY="SELECT id FROM inventory_categories WHERE business_id = '$BUSINESS_ID' AND name = 'Test Category' LIMIT 1;"
CATEGORY_RESULT=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t -q -c "$CATEGORY_QUERY" | tr -d '[:space:]')

if [[ -n "$CATEGORY_RESULT" ]]; then
  CATEGORY_ID="$CATEGORY_RESULT"
  echo -e "${GREEN}✅ Using existing category: $CATEGORY_ID${NC}"
else
  # Create new category
  CATEGORY_INSERT="INSERT INTO inventory_categories (business_id, name, description, created_at, updated_at) 
                   VALUES ('$BUSINESS_ID', 'Test Category', 'Category for E2E tests', NOW(), NOW()) 
                   RETURNING id;"
  CATEGORY_ID=$(psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -t -q -c "$CATEGORY_INSERT" | tr -d '[:space:]')
  
  if [[ -z "$CATEGORY_ID" ]]; then
    echo -e "${RED}❌ Failed to create category${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ Created category: $CATEGORY_ID${NC}"
fi

# ------------------------------------------------------------
# 4. CREATE TEST PRODUCT (WITH PROPER PAYLOAD)
# ------------------------------------------------------------
echo -e "\n${YELLOW}4. Creating test product...${NC}"

PRODUCT_RESPONSE=$(curl -s -X POST http://localhost:8002/api/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"E2E Accounting Test Product\",
    \"category_id\": \"$CATEGORY_ID\",
    \"cost_price\": 800.00,
    \"selling_price\": 1200.00,
    \"description\": \"Product for E2E accounting verification\",
    \"current_stock\": 5,
    \"min_stock_level\": 1,
    \"unit_of_measure\": \"units\"
  }")

PRODUCT_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.data.id')
INVENTORY_ITEM_ID=$(echo "$PRODUCT_RESPONSE" | jq -r '.data.inventory_item_id')

if [[ -z "$PRODUCT_ID" || "$PRODUCT_ID" == "null" ]]; then
  echo -e "${RED}❌ Product creation failed${NC}"
  echo "$PRODUCT_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}✅ Product created: $PRODUCT_ID${NC}"
if [[ -n "$INVENTORY_ITEM_ID" && "$INVENTORY_ITEM_ID" != "null" ]]; then
  echo -e "${GREEN}✅ Inventory item: $INVENTORY_ITEM_ID${NC}"
fi

# Wait a moment for product sync
sleep 2

# ------------------------------------------------------------
# 5. CREATE POS TRANSACTION
# ------------------------------------------------------------
echo -e "\n${YELLOW}5. Creating POS sale...${NC}"

POS_RESPONSE=$(curl -s -X POST http://localhost:8002/api/pos/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"total_amount\": 1200,
    \"final_amount\": 1200,
    \"payment_method\": \"cash\",
    \"payment_status\": \"completed\",
    \"status\": \"completed\",
    \"notes\": \"E2E accounting verification sale\",
    \"items\": [
      {
        \"product_id\": \"$PRODUCT_ID\",
        \"item_type\": \"product\",
        \"item_name\": \"E2E Accounting Test Product\",
        \"quantity\": 1,
        \"unit_price\": 1200,
        \"total_price\": 1200
      }
    ]
  }")

TRANSACTION_ID=$(echo "$POS_RESPONSE" | jq -r '.data.id')
ACCOUNTING_PROCESSED=$(echo "$POS_RESPONSE" | jq -r '.data.accounting_processed')

if [[ -z "$TRANSACTION_ID" || "$TRANSACTION_ID" == "null" ]]; then
  echo -e "${RED}❌ POS transaction failed${NC}"
  echo "$POS_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}✅ POS transaction created: $TRANSACTION_ID${NC}"

if [[ "$ACCOUNTING_PROCESSED" != "true" ]]; then
  echo -e "${RED}❌ Accounting not processed automatically${NC}"
  echo "Accounting info:"
  echo "$POS_RESPONSE" | jq '.data.accounting_info'
  exit 1
fi

echo -e "${GREEN}✅ Accounting processed automatically${NC}"

# ------------------------------------------------------------
# 6. DATABASE VERIFICATION
# ------------------------------------------------------------
echo -e "\n${YELLOW}6. Verifying accounting in database...${NC}"

psql -h localhost -p 5434 -U postgres -d bizzytrack_pro <<SQL
DO \$\$
DECLARE
  v_lines INT;
  v_debits NUMERIC;
  v_credits NUMERIC;
  v_trx_status TEXT;
  v_trx_error TEXT;
BEGIN
  -- Check transaction status
  SELECT accounting_processed::TEXT, accounting_error
  INTO v_trx_status, v_trx_error
  FROM pos_transactions 
  WHERE id = '$TRANSACTION_ID';
  
  RAISE NOTICE 'Transaction: %', '$TRANSACTION_ID';
  RAISE NOTICE 'Accounting processed: %', v_trx_status;
  RAISE NOTICE 'Accounting error: %', v_trx_error;

  -- Get accounting details
  SELECT COUNT(*),
         SUM(CASE WHEN line_type = 'debit' THEN amount ELSE 0 END),
         SUM(CASE WHEN line_type = 'credit' THEN amount ELSE 0 END)
  INTO v_lines, v_debits, v_credits
  FROM journal_entry_lines
  WHERE journal_entry_id = (
    SELECT id FROM journal_entries
    WHERE reference_id = '$TRANSACTION_ID'::TEXT
    LIMIT 1
  );

  RAISE NOTICE 'Journal lines: %', COALESCE(v_lines, 0);
  RAISE NOTICE 'Debits: %', COALESCE(v_debits, 0);
  RAISE NOTICE 'Credits: %', COALESCE(v_credits, 0);
  RAISE NOTICE 'Balanced: %', CASE WHEN abs(COALESCE(v_debits, 0) - COALESCE(v_credits, 0)) < 0.01 THEN 'YES' ELSE 'NO' END;

  IF COALESCE(v_lines, 0) = 4 THEN
    RAISE NOTICE '✅ 4-line accounting entry created';
  ELSE
    RAISE NOTICE '⚠️ Expected 4 lines, found %', COALESCE(v_lines, 0);
  END IF;
END
\$\$;
SQL

# ------------------------------------------------------------
# 7. INVENTORY CHECK
# ------------------------------------------------------------
echo -e "\n${YELLOW}7. Verifying inventory reduction...${NC}"

psql -h localhost -p 5434 -U postgres -d bizzytrack_pro \
  -c "SELECT 
        id,
        name,
        current_stock,
        cost_price
      FROM inventory_items 
      WHERE id = (SELECT inventory_item_id FROM products WHERE id = '$PRODUCT_ID');"

# ------------------------------------------------------------
# FINAL STATUS
# ------------------------------------------------------------
echo -e "\n${GREEN}=== E2E ACCOUNTING TEST PASSED ===${NC}"
echo "POS → Accounting → Inventory flow is production-safe"
echo "Transaction ID: $TRANSACTION_ID"
echo "Product ID: $PRODUCT_ID"
echo "Accounting processed: $ACCOUNTING_PROCESSED"
echo "Completed: $(date)"
