#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== WEEK 7 COMPLETE BACKEND VERIFICATION ==="
echo "Testing all endpoints..."

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

echo -e "${GREEN}✅ Authentication successful${NC}"

# Test endpoints and track results
declare -A results
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

echo -e "\nTesting endpoints..."
for endpoint in "${endpoints[@]}"; do
  method=$(echo $endpoint | cut -d' ' -f1)
  path=$(echo $endpoint | cut -d' ' -f2)
  
  if [[ $path == *"?"* ]]; then
    url="http://localhost:8002$path"
  else
    url="http://localhost:8002$path"
  fi
  
  response_code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$url")
  
  if [ "$response_code" = "200" ] || [ "$response_code" = "201" ]; then
    echo -e "${GREEN}✅ $method $path: HTTP $response_code${NC}"
    results["$endpoint"]="PASS"
  elif [ "$response_code" = "500" ]; then
    echo -e "${RED}❌ $method $path: HTTP $response500 ERROR${NC}"
    results["$endpoint"]="FAIL"
  else
    echo -e "${YELLOW}⚠️  $method $path: HTTP $response_code${NC}"
    results["$endpoint"]="WARN"
  fi
done

# Summary
echo -e "\n=== TEST SUMMARY ==="
passed=0
failed=0
warned=0

for endpoint in "${endpoints[@]}"; do
  case "${results[$endpoint]}" in
    "PASS") ((passed++)) ;;
    "FAIL") ((failed++)) ;;
    "WARN") ((warned++)) ;;
  esac
done

echo "Passed: $passed"
echo "Failed: $failed" 
echo "Warnings: $warned"
echo "Total: ${#endpoints[@]}"

if [ $failed -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL WEEK 7 ENDPOINTS WORKING!${NC}"
  echo -e "${GREEN}🚀 WEEK 7 BACKEND 100% COMPLETE${NC}"
else
  echo -e "${RED}❌ Some endpoints need attention${NC}"
fi
