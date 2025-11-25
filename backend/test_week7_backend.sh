#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 WEEK 7 BACKEND FEATURES TEST"
echo "================================="

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fixed@test.com", 
    "password": "fixed123"
  }' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to get authentication token${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Token obtained successfully${NC}"

# Test function
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  
  echo -e "\n${YELLOW}Testing: $name${NC}"
  echo "Endpoint: $method $endpoint"
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X GET "http://localhost:8002$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST "http://localhost:8002$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    echo -e "${RED}❌ Unsupported method: $method${NC}"
    return 1
  fi
  
  http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
  body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
  
  if [ "$http_status" = "200" ] || [ "$http_status" = "201" ]; then
    echo -e "${GREEN}✅ SUCCESS (HTTP $http_status)${NC}"
    echo "Response: $body" | jq . 2>/dev/null || echo "Response: $body"
    return 0
  else
    echo -e "${RED}❌ FAILED (HTTP $http_status)${NC}"
    echo "Response: $body"
    return 1
  fi
}

# Test Inventory Features
echo -e "\n${YELLOW}📦 INVENTORY FEATURES${NC}"
test_endpoint "Inventory Overview" "GET" "/api/inventory"
test_endpoint "Inventory Items List" "GET" "/api/inventory/items"
test_endpoint "Inventory Categories" "GET" "/api/inventory/categories"

# Test creating a test inventory item
test_endpoint "Create Inventory Item" "POST" "/api/inventory/items" '{
  "item_name": "Test Product",
  "sku": "TEST-001",
  "category": "electronics",
  "current_stock": 100,
  "min_stock_level": 10,
  "cost_price": 50.00,
  "selling_price": 100.00
}'

# Test Financial Features
echo -e "\n${YELLOW}💰 FINANCIAL FEATURES${NC}"
test_endpoint "Wallet List" "GET" "/api/wallets"
test_endpoint "Wallet Transactions" "GET" "/api/wallets/transactions"

# Test creating a test wallet
test_endpoint "Create Wallet" "POST" "/api/wallets" '{
  "wallet_name": "Test Wallet",
  "currency": "UGX",
  "initial_balance": 1000.00
}'

# Test Expense Features
echo -e "\n${YELLOW}💸 EXPENSE FEATURES${NC}"
test_endpoint "Expense Categories" "GET" "/api/expenses/categories"
test_endpoint "Expense List" "GET" "/api/expenses"

# Test creating a test expense
test_endpoint "Create Expense" "POST" "/api/expenses" '{
  "amount": 150.00,
  "category": "office_supplies",
  "description": "Test office supplies purchase",
  "payment_method": "cash",
  "wallet_id": "1"
}'

# Test Financial Reports
echo -e "\n${YELLOW}📊 FINANCIAL REPORTS${NC}"
test_endpoint "Profit & Loss Report" "GET" "/api/reports/profit-loss"
test_endpoint "Balance Sheet" "GET" "/api/reports/balance-sheet"
test_endpoint "Cash Flow" "GET" "/api/reports/cash-flow"

# Test Tithe/Charity Features
echo -e "\n${YELLOW}🕌 TITHE/CHARITY FEATURES${NC}"
test_endpoint "Tithe Calculation" "GET" "/api/tithe/calculate"
test_endpoint "Tithe Settings" "GET" "/api/tithe/settings"

echo -e "\n${YELLOW}=================================${NC}"
echo -e "${YELLOW}TESTING COMPLETE${NC}"
echo -e "${YELLOW}=================================${NC}"
