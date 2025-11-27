#!/bin/bash

echo "🔍 COMPREHENSIVE WALLET DATA AUDIT"
echo "=================================="

# Get authentication token
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token acquired"

echo -e "\n1. 📋 BACKEND WALLETS LIST (RAW DATA)"
echo "========================================"
curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data | 
    ["ID", "Name", "Type", "Balance", "Status", "Description"] as $headers |
    $headers,
    (.[] | [.id, .name, .wallet_type, (.current_balance | tostring), .status, .description]) |
    @tsv' | column -t

echo -e "\n2. 💰 WALLET BALANCE BREAKDOWN"
echo "=============================="
curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    reduce .[] as $wallet (
      {total: 0, by_type: {}, active_count: 0, inactive_count: 0};
      .total += ($wallet.current_balance | tonumber) |
      .by_type[$wallet.wallet_type] = ((.by_type[$wallet.wallet_type] // 0) + ($wallet.current_balance | tonumber)) |
      if $wallet.status == "active" then .active_count += 1 else .inactive_count += 1 end
    )'

echo -e "\n3. 🔄 COMPARE WITH FRONTEND DISPLAY"
echo "===================================="
echo "Frontend shows:"
echo "- MTN Mobile Money: $300,000.00"
echo "- Main Cash Wallet: $650,000.00" 
echo "- Piggy bank: $1,000.00"
echo "- Test Wallet: $1,000.00"
echo "- Test Wallet 400 Fix: $1,000.00"
echo "- Updated Business Bank Account: $2,100,000.00"
echo "- Week 7 Test Wallet: $2,500.00"
echo "TOTAL: $3,055,500.00"

echo -e "\n4. 🗃️ DATABASE DIRECT COUNT (if accessible)"
echo "============================================="
echo "Run these SQL queries in your database:"
echo "SELECT COUNT(*) as total_wallets, SUM(current_balance) as total_balance FROM money_wallets WHERE business_id='your_business_id';"
echo "SELECT wallet_type, COUNT(*) as count, SUM(current_balance) as total FROM money_wallets WHERE business_id='your_business_id' GROUP BY wallet_type;"

echo -e "\n5. 📊 WALLET TRANSACTIONS AUDIT"
echo "================================"
curl -s -X GET "http://localhost:8002/api/wallets/transactions?limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    group_by(.wallet_id) |
    map({
      wallet_id: .[0].wallet_id,
      wallet_name: .[0].wallet_name,
      transaction_count: length,
      total_incoming: [.[] | select(.transaction_type=="income") | .amount | tonumber] | add,
      total_outgoing: [.[] | select(.transaction_type=="expense") | .amount | tonumber] | add,
      net_flow: ([.[] | select(.transaction_type=="income") | .amount | tonumber] | add) - ([.[] | select(.transaction_type=="expense") | .amount | tonumber] | add)
    })'

echo -e "\n6. 🏦 FINANCIAL REPORT WALLET DATA"
echo "==================================="
curl -s -X GET "http://localhost:8002/api/financial-reports/balance-sheet?start_date=2025-01-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.assets.current_assets.cash_and_equivalents'
