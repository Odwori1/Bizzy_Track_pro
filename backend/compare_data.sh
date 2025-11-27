#!/bin/bash

echo "🔄 FRONTEND-BACKEND DATA COMPARISON"
echo "==================================="

TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo -e "\n1. WALLET COUNT COMPARISON"
BACKEND_COUNT=$(curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length')
echo "Backend wallet count: $BACKEND_COUNT"
echo "Frontend wallet count: 7 (from your display)"

echo -e "\n2. TOTAL BALANCE COMPARISON"
BACKEND_TOTAL=$(curl -s -X GET "http://localhost:8002/api/wallets/statistics" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.total_balance')
echo "Backend total balance: $BACKEND_TOTAL"
echo "Frontend total balance: 3055500"

echo -e "\n3. INDIVIDUAL WALLET VERIFICATION"
echo "Creating verification table..."
curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    ["Frontend Name", "Backend Name", "Backend Balance", "Matches"] as $headers |
    $headers,
    (
      [
        ["MTN Mobile Money", "MTN Mobile Money", 300000, false],
        ["Main Cash Wallet", "Main Cash Wallet", 650000, false], 
        ["Piggy bank", "Piggy bank", 1000, false],
        ["Test Wallet", "Test Wallet", 1000, false],
        ["Test Wallet 400 Fix", "Test Wallet 400 Fix", 1000, false],
        ["Updated Business Bank Account", "Updated Business Bank Account", 2100000, false],
        ["Week 7 Test Wallet", "Week 7 Test Wallet", 2500, false]
      ] as $frontend |
      .[] as $backend |
      $frontend[] as $front |
      if $front[0] == $backend.name then
        [$front[0], $backend.name, $backend.current_balance, ($front[2] == $backend.current_balance)]
      else
        empty
      end
    ) |
    @tsv' | column -t

echo -e "\n4. IDENTIFY DATA DISCREPANCIES"
echo "==============================="
curl -s -X GET "http://localhost:8002/api/wallets" \
  -H "Authorization: Bearer $TOKEN" | jq -r '
    .data |
    ["Discrepancy Check", "Details"] as $headers |
    $headers,
    (
      [
        ["Missing from Backend", "Wallets in frontend but not in backend"],
        ["Missing from Frontend", "Wallets in backend but not in frontend"], 
        ["Balance Mismatch", "Same wallet, different balances"]
      ]
    ) |
    @tsv' | column -t
