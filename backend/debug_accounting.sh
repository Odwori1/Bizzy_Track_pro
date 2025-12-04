#!/bin/bash

# Debug Script for Accounting System Issues
BASE_URL="http://localhost:8002"
TOKEN=""

echo "=== DEBUGGING ACCOUNTING SYSTEM ==="

# 1. Login
echo -e "\n1. LOGIN"
login_response=$(curl -s -X POST "$BASE_URL/api/businesses/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "fixed@test.com", "password": "fixed123"}')
TOKEN=$(echo $login_response | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $TOKEN"
echo "Full response: $login_response"
echo "User info from login:"
echo "$login_response" | python3 -c "import json, sys; data=json.load(sys.stdin); print(json.dumps(data.get('user', {}), indent=2))"

# 2. Test Issue 1: business_id missing
echo -e "\n2. TEST ISSUE 1: business_id missing"
echo "Creating journal entry with EXPLICIT business_id..."
test_entry='{
    "business_id": "243a15b5-255a-4852-83bf-5cb46aa62b5e",
    "description": "Debug test - Cash sale",
    "journal_date": "2025-12-04",
    "reference_type": "manual_entry",
    "reference_id": null,
    "lines": [
        {
            "account_code": "1110",
            "description": "Cash received",
            "amount": 500,
            "line_type": "debit"
        },
        {
            "account_code": "4100",
            "description": "Sales revenue",
            "amount": 500,
            "line_type": "credit"
        }
    ]
}'

response=$(curl -s -X POST "$BASE_URL/api/accounting/journal-entries" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$test_entry")

echo "Response: $response"

# 3. Test Issue 2: General Ledger path parameter
echo -e "\n3. TEST ISSUE 2: General Ledger path parameter"
echo "Testing general ledger endpoint structure..."
echo "Endpoint: GET /api/accounting/general-ledger/1110"

response=$(curl -s -X GET "$BASE_URL/api/accounting/general-ledger/1110" \
    -H "Authorization: Bearer $TOKEN")
echo "Response: $response"

# Also test with query params
echo -e "\nTesting with query params only..."
response=$(curl -s -X GET "$BASE_URL/api/accounting/general-ledger?account_code=1110&start_date=2025-01-01&end_date=2025-12-04" \
    -H "Authorization: Bearer $TOKEN")
echo "Response: $response"

# 4. Test Issue 3: Inventory Valuation parameters
echo -e "\n4. TEST ISSUE 3: Inventory Valuation"
echo "Testing inventory valuation with different parameter combinations..."

# Test 1: No parameters
response=$(curl -s -X GET "$BASE_URL/api/accounting/inventory-valuation" \
    -H "Authorization: Bearer $TOKEN")
echo "No parameters: $response"

# Test 2: With business_id parameter
response=$(curl -s -X GET "$BASE_URL/api/accounting/inventory-valuation?business_id=243a15b5-255a-4852-83bf-5cb46aa62b5e" \
    -H "Authorization: Bearer $TOKEN")
echo "With business_id: $response"

# 5. Test Issue 4: COGS Report dates
echo -e "\n5. TEST ISSUE 4: COGS Report"
echo "Testing COGS report with different date formats..."

# Test 1: ISO format
response=$(curl -s -X GET "$BASE_URL/api/accounting/cogs-report?start_date=2025-01-01T00:00:00.000Z&end_date=2025-12-04T23:59:59.999Z" \
    -H "Authorization: Bearer $TOKEN")
echo "ISO format: $response"

# Test 2: Simple date format
response=$(curl -s -X GET "$BASE_URL/api/accounting/cogs-report?start_date=2025-01-01&end_date=2025-12-04" \
    -H "Authorization: Bearer $TOKEN")
echo "Simple format: $response"

# 6. Check controller logic
echo -e "\n6. CHECKING CONTROLLER LOGIC"
echo "Looking at what user info is available..."

# Make a test call to see user structure
response=$(curl -s -X GET "$BASE_URL/api/accounting/test" \
    -H "Authorization: Bearer $TOKEN")
echo "Test endpoint user info in response:"
echo "$response" | python3 -c "
import json, sys
data = json.load(sys.stdin)
if 'data' in data:
    print(json.dumps(data['data'], indent=2))
"

# 7. Check database schema
echo -e "\n7. DATABASE SCHEMA CHECK"
echo "Checking journal_entries table structure..."
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'journal_entries' 
ORDER BY ordinal_position;
"

echo -e "\nChecking chart_of_accounts for test business..."
psql -h localhost -p 5434 -U postgres -d bizzytrack_pro -c "
SELECT account_code, account_name, account_type 
FROM chart_of_accounts 
WHERE business_id = '243a15b5-255a-4852-83bf-5cb46aa62b5e'
ORDER BY account_code
LIMIT 10;
"
