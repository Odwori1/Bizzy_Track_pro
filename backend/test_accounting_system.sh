#!/bin/bash

# Configuration
BASE_URL="http://localhost:8002"
TOKEN=""  # Will be set after login

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== ACCOUNTING SYSTEM COMPREHENSIVE TEST (UPDATED) ===${NC}\n"

# Function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    local expect_success=${5:-true}  # Default to expecting success

    echo -e "${YELLOW}Testing: ${description}${NC}"
    echo "Endpoint: $method $endpoint"

    if [ -n "$data" ]; then
        echo "Data: $data"
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "$data")
    else
        response=$(curl -s -X $method "$BASE_URL$endpoint" \
            -H "Authorization: Bearer $TOKEN")
    fi

    echo "Response: $response"

    # Check if success based on expectation
    if [ "$expect_success" = "true" ]; then
        if echo "$response" | grep -q '"success":true'; then
            echo -e "${GREEN}✓ PASS${NC}\n"
            return 0
        else
            echo -e "${RED}✗ FAIL${NC}\n"
            return 1
        fi
    else
        # Expecting failure - should NOT have success:true
        if echo "$response" | grep -q '"success":true'; then
            echo -e "${RED}✗ FAIL (Expected failure but got success)${NC}\n"
            return 1
        else
            echo -e "${GREEN}✓ PASS (Correctly failed as expected)${NC}\n"
            return 0
        fi
    fi
}

# Step 1: Login (use existing test business)
echo -e "${YELLOW}Step 1: Authentication${NC}"
login_response=$(curl -s -X POST "$BASE_URL/api/businesses/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "fixed@test.com", "password": "fixed123"}')

TOKEN=$(echo $login_response | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✓ Login successful. Token acquired.${NC}"
else
    echo -e "${RED}✗ Login failed${NC}"
    exit 1
fi

echo ""

# Step 2: Test accounting controller basic functionality
echo -e "${YELLOW}Step 2: Basic Controller Test${NC}"
api_call "GET" "/api/accounting/test" "" "Test endpoint"

# Step 3: Test journal entries listing
echo -e "${YELLOW}Step 3: Journal Entries Listing${NC}"
api_call "GET" "/api/accounting/journal-entries?page=1&limit=5" "" "List journal entries"

# Step 4: Create a test manual journal entry - FIXED: uses line_type
echo -e "${YELLOW}Step 4: Create Manual Journal Entry (FIXED)${NC}"
test_journal_entry='{
    "description": "Test manual journal entry - Cash sale",
    "journal_date": "'$(date +%Y-%m-%d)'",
    "reference_type": "manual_entry",
    "reference_id": null,
    "lines": [
        {
            "account_code": "1110",
            "description": "Cash received from test sale",
            "amount": 1000,
            "line_type": "debit"
        },
        {
            "account_code": "4100",
            "description": "Sales revenue from test",
            "amount": 1000,
            "line_type": "credit"
        }
    ]
}'

api_call "POST" "/api/accounting/journal-entries" "$test_journal_entry" "Create manual journal entry"

# Step 5: Test trial balance
echo -e "${YELLOW}Step 5: Trial Balance Report${NC}"
current_date=$(date +%Y-%m-%d)
api_call "GET" "/api/accounting/trial-balance?start_date=2025-01-01&end_date=$current_date" "" "Get trial balance"

# Step 6: Test general ledger for specific account - FIXED: use query params properly
echo -e "${YELLOW}Step 6: General Ledger Report (FIXED)${NC}"
api_call "GET" "/api/accounting/general-ledger/1110?start_date=2025-01-01&end_date=$current_date" "" "Get general ledger for Cash account (1110)"

# Step 7: Test inventory valuation - FIXED: simplified query
echo -e "${YELLOW}Step 7: Inventory Valuation (FIXED)${NC}"
api_call "GET" "/api/accounting/inventory-valuation" "" "Get inventory valuation (default parameters)"

# Step 8: Test COGS report - FIXED: proper date format
echo -e "${YELLOW}Step 8: COGS Report (FIXED)${NC}"
api_call "GET" "/api/accounting/cogs-report?start_date=2025-01-01&end_date=$current_date" "" "Get COGS report"

# Step 9: Test inventory sync status
echo -e "${YELLOW}Step 9: Inventory Sync Status${NC}"
api_call "GET" "/api/accounting/sync-status" "" "Get inventory sync status"

# Step 10: Test validation failures (negative tests)
echo -e "${YELLOW}Step 10: Validation Tests (Negative)${NC}"

# Test 10a: Debits not equal credits - FIXED: uses line_type
echo -e "${YELLOW}Test 10a: Debits ≠ Credits Validation${NC}"
invalid_entry='{
    "description": "Invalid entry - debits ≠ credits",
    "journal_date": "'$(date +%Y-%m-%d)'",
    "reference_type": "manual_entry",
    "lines": [
        {
            "account_code": "1110",
            "description": "Cash",
            "amount": 1000,
            "line_type": "debit"
        },
        {
            "account_code": "4100",
            "description": "Revenue",
            "amount": 900,  # Different amount!
            "line_type": "credit"
        }
    ]
}'

echo "Expected: Should fail validation (Debits ≠ Credits)"
api_call "POST" "/api/accounting/journal-entries" "$invalid_entry" "Test invalid journal entry" "false"

# Test 10b: Invalid account code - FIXED: uses line_type
echo -e "${YELLOW}Test 10b: Invalid Account Code${NC}"
invalid_account='{
    "description": "Invalid account code",
    "journal_date": "'$(date +%Y-%m-%d)'",
    "reference_type": "manual_entry",
    "lines": [
        {
            "account_code": "9999",  # Non-existent account
            "description": "Invalid account",
            "amount": 100,
            "line_type": "debit"
        },
        {
            "account_code": "4100",
            "description": "Revenue",
            "amount": 100,
            "line_type": "credit"
        }
    ]
}'

echo "Expected: Should fail (account not found)"
api_call "POST" "/api/accounting/journal-entries" "$invalid_account" "Test invalid account code" "false"

# Step 11: Check database integrity
echo -e "${YELLOW}Step 11: Database Integrity Check${NC}"
echo "Checking journal entries in database..."
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT 
    je.reference_number, 
    je.description, 
    je.total_amount,
    je.status,
    COUNT(jel.id) as line_count
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
GROUP BY je.id
ORDER BY je.created_at DESC
LIMIT 5;
"

echo ""
echo "Checking account balances (via journal_entry_lines join with chart_of_accounts)..."
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT 
    coa.account_code,
    coa.account_name,
    coa.account_type,
    SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE 0 END) as total_debits,
    SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE 0 END) as total_credits,
    CASE 
        WHEN coa.account_type IN ('asset', 'expense') THEN
            SUM(CASE WHEN jel.line_type = 'debit' THEN jel.amount ELSE -jel.amount END)
        ELSE
            SUM(CASE WHEN jel.line_type = 'credit' THEN jel.amount ELSE -jel.amount END)
    END as balance
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON coa.id = jel.account_id
LEFT JOIN journal_entries je ON jel.journal_entry_id = je.id
WHERE coa.business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
    AND (je.id IS NULL OR je.voided = false)
GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type
ORDER BY coa.account_code;
"

echo -e "${YELLOW}=== TESTING COMPLETE ===${NC}"

# Summary
echo ""
echo -e "${YELLOW}=== SUMMARY ===${NC}"
echo "1. Fixed test data to use 'line_type' instead of 'normal_balance'"
echo "2. Added proper negative test handling"
echo "3. Added database integrity checks"
echo ""
echo -e "${YELLOW}=== NEXT ACTIONS ===${NC}"
echo "If any tests fail, we need to:"
echo "1. Check the controller logic for parameter handling"
echo "2. Verify service methods accept correct parameters"
echo "3. Fix any database query issues"
