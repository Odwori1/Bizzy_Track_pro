#!/bin/bash

echo "🏥 FINANCIAL DATA HEALTH CHECK"
echo "=============================="

# Get token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Critical checks
echo -e "\n🔍 CRITICAL CHECKS:"

# 1. Check if balance sheet balances
echo "1. Balance Sheet Balance Check:"
BS_DATA=$(curl -s -X GET "http://localhost:8002/api/financial-reports/balance-sheet?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN")
BALANCED=$(echo "$BS_DATA" | jq '.verification.balanced')
echo "   Balanced: $BALANCED"

# 2. Check cash flow vs P&L consistency
echo "2. Cash Flow vs P&L Consistency:"
PL_DATA=$(curl -s -X GET "http://localhost:8002/api/financial-reports/profit-loss?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN")
CF_DATA=$(curl -s -X GET "http://localhost:8002/api/financial-reports/cash-flow?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN")

PL_INCOME=$(echo "$PL_DATA" | jq '.revenue.total_income // 0')
CF_INCOME=$(echo "$CF_DATA" | jq '[.[] | .total_income] | add // 0')

INCOME_RATIO=$(echo "scale=2; $CF_INCOME / $PL_INCOME * 100" | bc -l 2>/dev/null || echo "N/A")
echo "   P&L Income: $PL_INCOME, Cash Flow Income: $CF_INCOME, Ratio: ${INCOME_RATIO}%"

# 3. Check inventory valuation
echo "3. Inventory Valuation:"
INV_VALUE=$(curl -s -X GET "http://localhost:8002/api/inventory" \
  -H "Authorization: Bearer $TOKEN" | jq '[.data[] | .current_stock * .cost_price] | add // 0')
echo "   Total Inventory Value: $INV_VALUE"

# 4. Check wallet total vs balance sheet
echo "4. Wallet Total vs Balance Sheet:"
WALLET_TOTAL=$(curl -s -X GET "http://localhost:8002/api/wallets/statistics" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.total_balance // 0')
BS_CASH=$(echo "$BS_DATA" | jq '.assets.current_assets.cash_and_equivalents // 0')
echo "   Wallet Total: $WALLET_TOTAL, Balance Sheet Cash: $BS_CASH"

echo -e "\n📊 HEALTH SCORE:"
if [ "$BALANCED" = "true" ] && [ $(echo "$INCOME_RATIO > 90" | bc -l 2>/dev/null) -eq 1 ]; then
    echo "✅ EXCELLENT - Financial data is consistent and accurate"
elif [ "$BALANCED" = "true" ]; then
    echo "⚠️  GOOD - Balance sheet balances, but check income consistency"
else
    echo "❌ CRITICAL - Balance sheet doesn't balance. Investigate immediately."
fi
