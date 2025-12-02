#!/bin/bash

echo "🧪 Testing Asset Code Generation Fix"
echo "===================================="

# Get auth token
echo "1. Getting authentication token..."
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to get token"
  exit 1
fi
echo "✅ Token: ${TOKEN:0:20}..."

# Test creating multiple assets
echo -e "\n2. Testing asset creation..."
for i in {1..3}; do
  echo "   Creating asset $i..."
  RESPONSE=$(curl -s -X POST "http://localhost:8002/api/assets" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"asset_name\": \"Test Equipment $i\",
      \"category\": \"equipment\",
      \"description\": \"Test equipment for duplicate testing\",
      \"purchase_date\": \"2024-01-15\",
      \"purchase_price\": 1000,
      \"current_value\": 900,
      \"location\": \"Test Location\",
      \"condition_status\": \"good\"
    }")
  
  SUCCESS=$(echo $RESPONSE | jq -r '.success')
  ASSET_CODE=$(echo $RESPONSE | jq -r '.data.asset_code')
  
  if [ "$SUCCESS" = "true" ]; then
    echo "   ✅ Created: $ASSET_CODE"
  else
    ERROR=$(echo $RESPONSE | jq -r '.error')
    echo "   ❌ Failed: $ERROR"
  fi
done

# List all assets to check codes
echo -e "\n3. Listing all assets..."
curl -s -X GET "http://localhost:8002/api/assets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq -r '.data[] | "   \(.asset_code): \(.asset_name)"'

# Test database function directly
echo -e "\n4. Testing database function..."
# Get business ID first
BUSINESS_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/businesses/config" \
  -H "Authorization: Bearer $TOKEN")
BUSINESS_ID=$(echo $BUSINESS_RESPONSE | jq -r '.data.id')

if [ -n "$BUSINESS_ID" ] && [ "$BUSINESS_ID" != "null" ]; then
  echo "   Business ID: $BUSINESS_ID"
  docker-compose exec db psql -U bizzy_track_user -d bizzy_track -c "
  SELECT generate_next_asset_code('$BUSINESS_ID') as next_available_code;"
fi

echo -e "\n✅ Test complete!"
