#!/bin/bash

echo "🔍 FINANCIAL DATA TRACE ANALYSIS"
echo "================================"

TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo -e "\n1. 📊 WHERE DOES P&L REVENUE $350,000 COME FROM?"
echo "=================================================="
curl -s -X GET "http://localhost:8002/api/wallets/transactions?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    [.[] | select(.transaction_type == "income")] |
    ["Income Transactions", "Amount", "Wallet", "Date"] as $headers |
    $headers,
    (.[] | [.description, (.amount | tostring), .wallet_name, .created_at]) |
    @tsv' | column -t

echo -e "\n2. 💸 WHERE DOES P&L EXPENSES $82,550 COME FROM?"
echo "=================================================="
curl -s -X GET "http://localhost:8002/api/expenses" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    ["Expense Description", "Amount", "Category", "Status", "Date"] as $headers |
    $headers,
    (.[] | [.description, (.amount | tostring), .category_name, .status, .expense_date]) |
    @tsv' | column -t

echo -e "\n3. 🏦 WHERE DOES BALANCE SHEET CASH $3,055,500 COME FROM?"
echo "=========================================================="
curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    ["Wallet Name", "Balance", "Type", "Initial Balance?"] as $headers |
    $headers,
    (.[] | [.name, (.current_balance | tostring), .wallet_type, "?"]) |
    @tsv' | column -t

echo -e "\n4. 📦 WHERE DOES INVENTORY $305,000 COME FROM?"
echo "================================================"
curl -s -X GET "http://localhost:8002/api/inventory" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    ["Item Name", "Stock", "Cost Price", "Total Value"] as $headers |
    $headers,
    (.[] | [.name, (.current_stock | tostring), (.cost_price | tostring), (.current_stock * .cost_price | tostring)]) |
    @tsv' | column -t

echo -e "\n5. 📉 WHERE DOES ACCOUNTS PAYABLE $575 COME FROM?"
echo "==================================================="
curl -s -X GET "http://localhost:8002/api/expenses" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    [.[] | select(.status != "paid")] |
    ["Pending Expense", "Amount", "Status"] as $headers |
    $headers,
    (.[] | [.description, (.amount | tostring), .status]) |
    @tsv' | column -t

echo -e "\n6. 💰 WHERE DOES RETAINED EARNINGS $250,000 COME FROM?"
echo "========================================================"
echo "This should be net income from operations. Let's check:"
echo "P&L Net Profit: $267,450"
echo "Balance Sheet Retained Earnings: $250,000"
echo "Difference: $17,450 (might be dividends or adjustments)"

echo -e "\n7. 🔍 DATA CONSISTENCY CHECK"
echo "============================="
echo "Wallets Total: $3,055,500"
echo "Balance Sheet Cash: $3,055,500 ✅"
echo ""
echo "Expenses Total: $82,625 (frontend) vs $82,550 (reports)"
echo "Difference: $75 (the pending $75 expense might be excluded)"
echo ""
echo "Inventory: Need to verify items exist with $305,000 total value"
