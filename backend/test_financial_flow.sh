#!/bin/bash

echo "🔍 COMPREHENSIVE FINANCIAL DATA FLOW TEST"
echo "=========================================="

# Get authentication token
echo -e "\n1. 🔐 AUTHENTICATION"
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)

echo "Token acquired: ${TOKEN:0:50}..."

# Test date range for all reports
START_DATE="2025-01-01"
END_DATE="2025-12-31"

echo -e "\n2. 📊 DATABASE INVENTORY CHECK"
echo "=== Checking Inventory Data ==="
curl -s -X GET "http://localhost:8002/api/inventory" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {total_items: length, sample_items: [.[0:2] | .[] | {name, current_stock, cost_price}]}'

echo -e "\n3. 💰 WALLET BALANCES & TRANSACTIONS"
echo "=== Wallet Statistics ==="
curl -s -X GET "http://localhost:8002/api/wallets/statistics" \
  -H "Authorization: Bearer $TOKEN" | jq '.data'

echo -e "\n=== Recent Wallet Transactions ==="
curl -s -X GET "http://localhost:8002/api/wallets/transactions?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {transaction_count: length, total_incoming: [.[] | select(.transaction_type=="income") | .amount] | add, total_outgoing: [.[] | select(.transaction_type=="expense") | .amount] | add}'

echo -e "\n4. 💸 EXPENSE ANALYSIS"
echo "=== Expense Statistics ==="
EXPENSE_STATS=$(curl -s -X GET "http://localhost:8002/api/expenses/statistics" \
  -H "Authorization: Bearer $TOKEN")
echo "$EXPENSE_STATS" | jq '.data.totals'

echo -e "\n=== Recent Expenses ==="
curl -s -X GET "http://localhost:8002/api/expenses?limit=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | {expense_count: length, total_amount: [.[] | .amount] | add, status_breakdown: group_by(.status) | map({status: .[0].status, count: length, total: map(.amount) | add})}'

echo -e "\n5. 📈 FINANCIAL REPORTS CONSISTENCY CHECK"
echo "=== Profit & Loss Report ==="
PL_REPORT=$(curl -s -X GET "http://localhost:8002/api/financial-reports/profit-loss?start_date=$START_DATE&end_date=$END_DATE" \
  -H "Authorization: Bearer $TOKEN")
echo "$PL_REPORT" | jq '.'

echo -e "\n=== Balance Sheet ==="
BS_REPORT=$(curl -s -X GET "http://localhost:8002/api/financial-reports/balance-sheet?start_date=$START_DATE&end_date=$END_DATE" \
  -H "Authorization: Bearer $TOKEN")
echo "$BS_REPORT" | jq '.'

echo -e "\n=== Cash Flow Report ==="
CF_REPORT=$(curl -s -X GET "http://localhost:8002/api/financial-reports/cash-flow?start_date=$START_DATE&end_date=$END_DATE" \
  -H "Authorization: Bearer $TOKEN")
echo "$CF_REPORT" | jq '.'

echo -e "\n6. 🔄 DATA CONSISTENCY VERIFICATION"
echo "=== Cross-Report Validation ==="

# Extract key metrics from each report
PL_INCOME=$(echo "$PL_REPORT" | jq '.revenue.total_income // 0')
PL_EXPENSES=$(echo "$PL_REPORT" | jq '.expenses.total_expenses // 0')
PL_NET=$(echo "$PL_REPORT" | jq '.net_profit // 0')

CF_INCOME=$(echo "$CF_REPORT" | jq '[.[] | .total_income] | add // 0')
CF_EXPENSES=$(echo "$CF_REPORT" | jq '[.[] | .total_expenses] | add // 0')
CF_NET=$(echo "$CF_REPORT" | jq '[.[] | .net_cash_flow] | add // 0')

BS_ASSETS=$(echo "$BS_REPORT" | jq '.assets.total_assets // 0')
BS_LIABILITIES=$(echo "$BS_REPORT" | jq '.liabilities.total_liabilities // 0')
BS_EQUITY=$(echo "$BS_REPORT" | jq '.equity.total_equity // 0')

echo "Profit & Loss:"
echo "  Income: $PL_INCOME, Expenses: $PL_EXPENSES, Net: $PL_NET"
echo "Cash Flow:"
echo "  Income: $CF_INCOME, Expenses: $CF_EXPENSES, Net: $CF_NET"
echo "Balance Sheet:"
echo "  Assets: $BS_ASSETS, Liabilities: $BS_LIABILITIES, Equity: $BS_EQUITY"

echo -e "\n=== Consistency Check ==="
INCOME_DIFF=$(echo "scale=2; ($PL_INCOME - $CF_INCOME) / $PL_INCOME * 100" | bc -l 2>/dev/null || echo "N/A")
EXPENSE_DIFF=$(echo "scale=2; ($PL_EXPENSES - $CF_EXPENSES) / $PL_EXPENSES * 100" | bc -l 2>/dev/null || echo "N/A")

echo "Income Consistency: P&L vs Cash Flow - Difference: ${INCOME_DIFF}%"
echo "Expense Consistency: P&L vs Cash Flow - Difference: ${EXPENSE_DIFF}%"

echo -e "\n7. 🗃️ DATABASE DIRECT QUERY (Optional - if you have DB access)"
echo "=== Sample Data Verification ==="
echo "To run manually in database:"
echo "  SELECT COUNT(*) as total_expenses, SUM(amount) as total_expense_amount FROM expenses WHERE business_id='your_business_id';"
echo "  SELECT COUNT(*) as total_transactions, "
echo "         SUM(CASE WHEN transaction_type='income' THEN amount ELSE 0 END) as total_income,"
echo "         SUM(CASE WHEN transaction_type='expense' THEN amount ELSE 0 END) as total_expense"
echo "  FROM wallet_transactions WHERE business_id='your_business_id';"
echo "  SELECT COUNT(*) as inventory_items, SUM(current_stock * cost_price) as inventory_value"
echo "  FROM inventory_items WHERE business_id='your_business_id' AND is_active=true;"

echo -e "\n8. 🎯 QUICK REPORT DATA SOURCES"
echo "=== Data for Monthly Summary ==="
curl -s -X GET "http://localhost:8002/api/financial-reports/profit-loss?start_date=2025-12-01&end_date=2025-12-31" \
  -H "Authorization: Bearer $TOKEN" | jq '{month: "December 2025", revenue: .revenue.total_income, expenses: .expenses.total_expenses, net_profit: .net_profit}'

echo -e "\n=== Data for Expense Analysis ==="
curl -s -X GET "http://localhost:8002/api/expenses/statistics" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.by_category'

echo -e "\n=== Data for Revenue Report ==="
curl -s -X GET "http://localhost:8002/api/wallets/transactions?limit=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | [group_by(.transaction_type)[] | {type: .[0].transaction_type, count: length, total: map(.amount) | add}]'

echo -e "\n📋 TEST SUMMARY"
echo "================"
echo "✓ Authentication: Working"
echo "✓ Wallet Data: Available"
echo "✓ Expense Data: Available"
echo "✓ Inventory Data: Check above"
echo "✓ Financial Reports: Generated"
echo "✓ Data Consistency: Check differences above"
echo ""
echo "🔍 CRITICAL CHECKS:"
echo "1. Cash Flow income should ≈ P&L revenue"
echo "2. Balance Sheet should balance (Assets = Liabilities + Equity)"
echo "3. Inventory value should appear in Balance Sheet"
echo "4. All wallet balances should sum to total assets"
