
#!/bin/bash
echo "=== Testing Accounting System Fix ==="

# 1. Get token
echo -e "\n1. Getting authentication token..."
TOKEN=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{"email": "foundationtest@example.com", "password": "Test123!"}' \
  | jq -r '.data.token')

echo "Token obtained: ${TOKEN:0:30}..."

# 2. Test POS transactions endpoint (the one that was failing)
echo -e "\n2. Testing POS transactions endpoint..."
curl -s -X GET "http://localhost:8002/api/pos/transactions?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data[0] | {id, transaction_number, final_amount, accounting_processed}'

# 3. Test manual accounting processing for the failed transaction
echo -e "\n3. Trying to process accounting for the failed transaction..."
curl -s -X POST http://localhost:8002/api/accounting/process-pos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": "4b32d429-a8cd-43a7-a77d-82dded9b25e4"}' \
  | jq .

# 4. Check accounting stats
echo -e "\n4. Checking accounting stats..."
curl -s -X GET http://localhost:8002/api/accounting/stats \
  -H "Authorization: Bearer $TOKEN" \
  | jq .

