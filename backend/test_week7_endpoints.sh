#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Testing Week 7 Backend Endpoints..."
echo "======================================"

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

# Test endpoints
endpoints=(
  "GET /api/inventory"
  "GET /api/inventory/items" 
  "GET /api/inventory/categories"
  "GET /api/inventory/statistics"
  "GET /api/inventory/low-stock-alerts"
  "GET /api/wallets"
  "GET /api/wallets/statistics"
  "GET /api/wallets/transactions"
  "GET /api/expenses/categories"
  "GET /api/expenses"
  "GET /api/expenses/statistics"
  "GET /api/financial-reports/financial-report"
  "GET /api/financial-reports/profit-loss?start_date=2025-01-01&end_date=2025-11-25"
  "GET /api/financial-reports/cash-flow?start_date=2025-01-01&end_date=2025-11-25"
  "GET /api/financial-reports/balance-sheet?start_date=2025-01-01&end_date=2025-11-25"
  "GET /api/financial-reports/tithe-calculation"
)

for endpoint in "${endpoints[@]}"; do
  method=$(echo $endpoint | cut -d' ' -f1)
  path=$(echo $endpoint | cut -d' ' -f2)
  
  if [[ $path == *"?"* ]]; then
    url="http://localhost:8002$path"
  else
    url="http://localhost:8002$path"
  fi
  
  echo -n "Testing $method $path... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$url")
  else
    response=$(curl -s -o /dev/null -w "%{http_code}" -X $method -H "Authorization: Bearer $TOKEN" "$url")
  fi
  
  if [ "$response" = "200" ] || [ "$response" = "201" ]; then
    echo -e "${GREEN}✅ $response${NC}"
  elif [ "$response" = "500" ]; then
    echo -e "${RED}❌ $response (SERVER ERROR)${NC}"
  else
    echo -e "${YELLOW}⚠️  $response${NC}"
  fi
done

echo "======================================"
echo "Test completed"
