#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 WEEK 7 BACKEND FEATURES TEST - CORRECTED PATHS"
echo "=================================================="

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

# Test Inventory Features with CORRECT paths
echo -e "\n${YELLOW}📦 INVENTORY FEATURES${NC}"
test_endpoint "Inventory Items List" "GET" "/api/inventory/items"
test_endpoint "Inventory Categories" "GET" "/api/inventory/categories"
test_endpoint "Inventory Statistics" "GET" "/api/inventory/statistics"
test_endpoint "Low Stock Alerts" "GET" "/api/inventory/low-stock-alerts"

# Test Financial Features with CORRECT paths
echo -e "\n${YELLOW}💰 FINANCIAL FEATURES${NC}"
test_endpoint "Wallet List" "GET" "/api/wallets"
test_endpoint "Wallet Statistics" "GET" "/api/wallets/statistics"

# Get a wallet ID first to test wallet-specific transactions
echo -e "\n${YELLOW}Getting wallet ID for transaction test...${NC}"
WALLET_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

WALLET_ID=$(echo "$WALLET_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
if [ -n "$WALLET_ID" ]; then
  echo "Using wallet ID: $WALLET_ID"
  test_endpoint "Wallet Transactions" "GET" "/api/wallets/$WALLET_ID/transactions"
else
  echo -e "${RED}❌ No wallet found for transaction test${NC}"
fi

# Test Expense Features with CORRECT paths
echo -e "\n${YELLOW}💸 EXPENSE FEATURES${NC}"
test_endpoint "Expense Categories" "GET" "/api/expenses/categories"
test_endpoint "Expense List" "GET" "/api/expenses"
test_endpoint "Expense Statistics" "GET" "/api/expenses/statistics"

# Test Financial Reports with CORRECT paths
echo -e "\n${YELLOW}📊 FINANCIAL REPORTS${NC}"
test_endpoint "Financial Report" "GET" "/api/financial-reports/financial-report"
test_endpoint "Profit & Loss Report" "GET" "/api/financial-reports/profit-loss"
test_endpoint "Cash Flow Report" "GET" "/api/financial-reports/cash-flow"
test_endpoint "Tithe Calculation" "GET" "/api/financial-reports/tithe-calculation"

# Test missing endpoints that should exist based on blueprint
echo -e "\n${YELLOW}🔍 TESTING POTENTIALLY MISSING ENDPOINTS${NC}"
test_endpoint "Inventory Overview (potentially missing)" "GET" "/api/inventory"
test_endpoint "All Wallet Transactions (potentially missing)" "GET" "/api/wallets/transactions"
test_endpoint "Balance Sheet (potentially missing)" "GET" "/api/financial-reports/balance-sheet"

echo -e "\n${YELLOW}=================================${NC}"
echo -e "${YELLOW}TESTING COMPLETE${NC}"
echo -e "${YELLOW}=================================${NC}"
