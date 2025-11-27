#!/bin/bash

echo "🔍 PROPER FINANCIAL DATA TRACE"
echo "=============================="

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo -e "\n1. 📊 INCOME TRANSACTIONS (Revenue Source)"
echo "============================================"
curl -s -X GET "http://localhost:8002/api/wallets/transactions?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.data[] | select(.transaction_type == "income")' | jq -s '
    map({description, amount, wallet_name, created_at}) | 
    {total_income: (map(.amount | tonumber) | add), transactions: .}'

echo -e "\n2. 💸 EXPENSE BREAKDOWN"
echo "========================"
curl -s -X GET "http://localhost:8002/api/expenses" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'

echo -e "\n3. 📦 INVENTORY ITEMS"
echo "======================"
curl -s -X GET "http://localhost:8002/api/inventory" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'

echo -e "\n4. 🔍 RAW FINANCIAL REPORTS"
echo "============================"
echo "Profit & Loss:"
curl -s -X GET "http://localhost:8002/api/financial-reports/profit-loss?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'

echo -e "\nBalance Sheet:"
curl -s -X GET "http://localhost:8002/api/financial-reports/balance-sheet?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'

echo -e "\nCash Flow:"
curl -s -X GET "http://localhost:8002/api/financial-reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'
