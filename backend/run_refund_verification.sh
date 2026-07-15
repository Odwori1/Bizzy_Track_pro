#!/usr/bin/env bash
# ============================================================================
# Phase 20 refund pre-flight verification — full end-to-end run
# Business: Cutover Test Biz (b32bddb0-72ce-4efc-9830-f54eeb81ee9c)
# Transaction: B32BDDB0-000013 (fe3cc218-3f03-48fd-85eb-dd4e809885cb)
#   Wireless Mouse, qty 3, subtotal 150000, discount 22500, tax 22950,
#   final_amount 150450, payment_method CASH, zero prior refunds.
#
# Requires: curl, jq (falls back to raw output with a warning if jq missing)
# Run from anywhere; only needs network access to localhost:8002
# ============================================================================

set -uo pipefail

BASE="http://localhost:8002/api/refunds"
MANAGER_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmNmIzNzIxOC0yZTg2LTRkY2MtOTk5NS0wYWI1NTkxNWNmNjciLCJidXNpbmVzc0lkIjoiYjMyYmRkYjAtNzJjZS00ZWZjLTk4MzAtZjU0ZWViODFlZTljIiwiZW1haWwiOiJyZWZ1bmQtdGVzdC1tYW5hZ2VyQGV4YW1wbGUuY29tIiwicm9sZSI6Im1hbmFnZXIiLCJ0aW1lem9uZSI6IkFmcmljYS9OYWlyb2JpIiwiaWF0IjoxNzgzOTIyNjkzLCJleHAiOjE3ODQ1Mjc0OTN9.uHKd6wwPL0HMcGh2PjrpYwqzZcb-w-N37ikZ5LcMsWc"
STAFF_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNmMyZWM1Yy02YzdiLTQwODUtOTgwNC0wNzk5NGVjNWU2MDIiLCJidXNpbmVzc0lkIjoiYjMyYmRkYjAtNzJjZS00ZWZjLTk4MzAtZjU0ZWViODFlZTljIiwiZW1haWwiOiJyZWZ1bmQtdGVzdC1zdGFmZkBleGFtcGxlLmNvbSIsInJvbGUiOiJzdGFmZiIsInRpbWV6b25lIjoiQWZyaWNhL05haXJvYmkiLCJpYXQiOjE3ODM5MjI3MTAsImV4cCI6MTc4NDUyNzUxMH0.1rWWPbJciqecqBQ2KVnDC1_CNlFyclxzX8eNy6HdzFo"

TXN_ID="fe3cc218-3f03-48fd-85eb-dd4e809885cb"
LINE_ITEM_ID="bd49f556-163a-48d7-b4a4-5bb9e87cfb45"
PRODUCT_ID="db12b6b1-71b6-4f6c-989d-b651a5626317"

HAS_JQ=1
command -v jq >/dev/null 2>&1 || HAS_JQ=0
pretty() { if [ "$HAS_JQ" = "1" ]; then jq .; else cat; fi }
extract_id() { if [ "$HAS_JQ" = "1" ]; then jq -r '.data.id // .data.refund.id // empty'; else grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4; fi }

sep() { echo; echo "======================================================================"; echo "$1"; echo "======================================================================"; }

# ----------------------------------------------------------------------------
sep "STEP 1: Create Refund #1 (qty 1 of 3) — expect 202, requires_approval=true, PENDING"
# ----------------------------------------------------------------------------
REFUND_1_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -d '{
    "original_transaction_id": "'"$TXN_ID"'",
    "original_transaction_type": "POS",
    "refund_type": "PARTIAL",
    "refund_method": "CASH",
    "subtotal_refunded": 50000,
    "discount_refunded": 7500,
    "tax_refunded": 7650,
    "total_refunded": 50150,
    "refund_reason": "Phase 20 verification - partial 1 of 3",
    "items": [{
      "original_line_item_id": "'"$LINE_ITEM_ID"'",
      "original_line_type": "POS_ITEM",
      "product_id": "'"$PRODUCT_ID"'",
      "item_name": "Wireless Mouse",
      "quantity_refunded": 1,
      "unit_price": 50000,
      "subtotal_refunded": 50000,
      "discount_refunded": 7500,
      "tax_refunded": 7650,
      "total_refunded": 50150
    }]
  }')

echo "$REFUND_1_RESPONSE" | grep -v HTTP_STATUS | pretty
echo "$REFUND_1_RESPONSE" | grep HTTP_STATUS
REFUND_1_ID=$(echo "$REFUND_1_RESPONSE" | grep -v HTTP_STATUS | extract_id)
echo ">>> REFUND_1_ID = $REFUND_1_ID"
echo ">>> EXPECT: HTTP 202, requires_approval:true, status:PENDING"

if [ -z "$REFUND_1_ID" ]; then
  echo "!!! Could not extract refund ID — stopping. Check the response above for errors."
  exit 1
fi

# ----------------------------------------------------------------------------
sep "STEP 2 (V6): Attempt direct /process on Refund #1 — expect 403"
# ----------------------------------------------------------------------------
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE/$REFUND_1_ID/process" \
  -H "Authorization: Bearer $MANAGER_TOKEN" | pretty
echo ">>> EXPECT: HTTP 403, message mentioning 'requires approval'"

# ----------------------------------------------------------------------------
sep "STEP 3 (V7): Attempt /approve as STAFF (unauthorized) — expect 403"
# ----------------------------------------------------------------------------
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE/$REFUND_1_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -d '{"notes": "should be rejected"}' | pretty
echo ">>> EXPECT: HTTP 403, 'not authorized to approve refunds'"

# ----------------------------------------------------------------------------
sep "STEP 4 (V8): Attempt /approve as MANAGER (authorized) — expect 200, COMPLETED"
# ----------------------------------------------------------------------------
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE/$REFUND_1_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -d '{"notes": "approved for verification test"}' | pretty
echo ">>> EXPECT: HTTP 200, status:COMPLETED, journal_entry_id populated"

# ----------------------------------------------------------------------------
sep "STEP 5: Fetch Refund #1 full detail (for manual cross-check)"
# ----------------------------------------------------------------------------
curl -s "$BASE/$REFUND_1_ID" -H "Authorization: Bearer $MANAGER_TOKEN" | pretty

sep "Now run the SQL block below for V3/V4/V5 (first half), then continue to Refund #2"
cat <<SQL

-- V3/V4: journal entry lines for Refund #1 — expect 5100 credit + 1300 debit
-- present, and debits == credits.
SELECT jel.line_type, coa.account_code, coa.account_name, jel.amount
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.reference_type = 'REFUND' AND je.reference_id = '$REFUND_1_ID'
ORDER BY CASE jel.line_type WHEN 'debit' THEN 0 ELSE 1 END, coa.account_code;

-- V5 (first half): expect reversed_discount_amount = 7500.00, status = 'APPLIED'
SELECT id, total_discount_amount, reversed_discount_amount, status
FROM discount_allocations
WHERE pos_transaction_id = '$TXN_ID';

-- Confirm inventory actually moved: expect a 'refund' row, quantity=1
SELECT transaction_type, quantity, unit_cost, total_cost, reference_type, reference_id
FROM inventory_transactions
WHERE reference_type = 'refund' AND reference_id = '$REFUND_1_ID';

-- Confirm the original transaction updated correctly: expect refund_status='PARTIAL'
SELECT refund_status, refunded_amount FROM pos_transactions WHERE id = '$TXN_ID';

SQL

echo
echo "Paste the four SQL results back, then press Enter to continue to Refund #2..."
read -r _

# ----------------------------------------------------------------------------
sep "STEP 6: Create Refund #2 (remaining qty 2 of 3)"
# ----------------------------------------------------------------------------
REFUND_2_RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -d '{
    "original_transaction_id": "'"$TXN_ID"'",
    "original_transaction_type": "POS",
    "refund_type": "PARTIAL",
    "refund_method": "CASH",
    "subtotal_refunded": 100000,
    "discount_refunded": 15000,
    "tax_refunded": 15300,
    "total_refunded": 100300,
    "refund_reason": "Phase 20 verification - partial 2 of 3 (remaining)",
    "items": [{
      "original_line_item_id": "'"$LINE_ITEM_ID"'",
      "original_line_type": "POS_ITEM",
      "product_id": "'"$PRODUCT_ID"'",
      "item_name": "Wireless Mouse",
      "quantity_refunded": 2,
      "unit_price": 50000,
      "subtotal_refunded": 100000,
      "discount_refunded": 15000,
      "tax_refunded": 15300,
      "total_refunded": 100300
    }]
  }')

echo "$REFUND_2_RESPONSE" | grep -v HTTP_STATUS | pretty
echo "$REFUND_2_RESPONSE" | grep HTTP_STATUS
REFUND_2_ID=$(echo "$REFUND_2_RESPONSE" | grep -v HTTP_STATUS | extract_id)
echo ">>> REFUND_2_ID = $REFUND_2_ID"
echo ">>> EXPECT: HTTP 202, requires_approval:true, status:PENDING (100300 still > threshold)"

if [ -z "$REFUND_2_ID" ]; then
  echo "!!! Could not extract refund ID — stopping."
  exit 1
fi

# ----------------------------------------------------------------------------
sep "STEP 7: Approve Refund #2 as MANAGER — expect 200, COMPLETED"
# ----------------------------------------------------------------------------
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST "$BASE/$REFUND_2_ID/approve" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MANAGER_TOKEN" \
  -d '{"notes": "approved for verification test - final partial"}' | pretty

sep "All API calls complete. Run the final SQL block below."
cat <<SQL

-- V3/V4 for Refund #2
SELECT jel.line_type, coa.account_code, coa.account_name, jel.amount
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON jel.account_id = coa.id
WHERE je.reference_type = 'REFUND' AND je.reference_id = '$REFUND_2_ID'
ORDER BY CASE jel.line_type WHEN 'debit' THEN 0 ELSE 1 END, coa.account_code;

-- V5 (final): expect reversed_discount_amount = 22500.00 (full), status = 'VOID'
SELECT id, total_discount_amount, reversed_discount_amount, status, voided_at
FROM discount_allocations
WHERE pos_transaction_id = '$TXN_ID';

-- Expect refund_status = 'FULL', refunded_amount = 150450.00
SELECT refund_status, refunded_amount, total_amount, final_amount
FROM pos_transactions WHERE id = '$TXN_ID';

-- Both inventory reversal rows together: expect quantity 1 and 2, total_cost matching cost_price*qty
SELECT transaction_type, quantity, unit_cost, total_cost, reference_id
FROM inventory_transactions
WHERE reference_type = 'refund' AND reference_id IN ('$REFUND_1_ID', '$REFUND_2_ID')
ORDER BY created_at;

-- Line-item level already_refunded tracking: expect already_refunded_qty = 3, already_refunded_amount = 150450.00
SELECT already_refunded_qty, already_refunded_amount
FROM pos_transaction_items WHERE id = '$LINE_ITEM_ID';

SQL
