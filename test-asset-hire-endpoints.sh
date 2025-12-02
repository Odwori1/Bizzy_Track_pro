#!/bin/bash

echo "🧪 Testing Asset-Hire Backend Endpoints"
echo "========================================"

# Get auth token
echo "1. Getting authentication token..."
TOKEN=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "fixed@test.com", "password": "fixed123"}' | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to get token"
  exit 1
fi
echo "✅ Token obtained"

# Get an equipment asset ID
echo -e "\n2. Getting equipment asset..."
ASSETS_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/assets" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

# Find an equipment asset that's not already hireable
ASSET_ID=$(echo $ASSETS_RESPONSE | jq -r '.data[] | select(.category == "equipment") | .id' | head -1)
ASSET_NAME=$(echo $ASSETS_RESPONSE | jq -r '.data[] | select(.id == "'$ASSET_ID'") | .asset_name')
ASSET_CODE=$(echo $ASSETS_RESPONSE | jq -r '.data[] | select(.id == "'$ASSET_ID'") | .asset_code')

if [ -z "$ASSET_ID" ] || [ "$ASSET_ID" = "null" ]; then
  echo "❌ No equipment assets found. Creating one..."
  
  CREATE_RESPONSE=$(curl -s -X POST "http://localhost:8002/api/assets" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "asset_name": "Backhoe Loader for Hire Test",
      "category": "equipment",
      "description": "Heavy equipment for construction",
      "purchase_date": "2024-01-20",
      "purchase_price": 45000,
      "current_value": 43000,
      "location": "Construction Yard A",
      "condition_status": "excellent"
    }')
  
  ASSET_ID=$(echo $CREATE_RESPONSE | jq -r '.data.id')
  ASSET_NAME=$(echo $CREATE_RESPONSE | jq -r '.data.asset_name')
  ASSET_CODE=$(echo $CREATE_RESPONSE | jq -r '.data.asset_code')
  
  echo "✅ Created new equipment asset: $ASSET_NAME ($ASSET_CODE)"
else
  echo "✅ Using existing equipment asset: $ASSET_NAME ($ASSET_CODE)"
fi

# Test 1: Get assets that can be marked as hireable
echo -e "\n3. Testing GET /api/asset-hire/assets/hireable"
HIREABLE_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/asset-hire/assets/hireable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "Response:"
echo $HIREABLE_RESPONSE | jq '.'

# Test 2: Mark asset as hireable
echo -e "\n4. Testing POST /api/asset-hire/assets/\$ASSET_ID/mark-hireable"
MARK_RESPONSE=$(curl -s -X POST "http://localhost:8002/api/asset-hire/assets/$ASSET_ID/mark-hireable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hire_rate_per_day": 250,
    "deposit_amount": 500,
    "minimum_hire_period": 3,
    "current_location": "Main Construction Yard",
    "condition_notes": "Excellent condition, fully serviced"
  }')

echo "Response:"
echo $MARK_RESPONSE | jq '.'

SUCCESS=$(echo $MARK_RESPONSE | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  echo "✅ Successfully marked asset as hireable!"
  
  # Test 3: Get hireable assets with details
  echo -e "\n5. Testing GET /api/asset-hire/assets/hireable-with-details"
  DETAILS_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/asset-hire/assets/hireable-with-details" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json")
  
  echo "Response:"
  echo $DETAILS_RESPONSE | jq '.data[0] | {asset_name, asset_code, hire_rate_per_day, deposit_amount, is_hireable}'
  
  # Test 4: Get asset hire details
  echo -e "\n6. Testing GET /api/asset-hire/assets/\$ASSET_ID/hire-details"
  ASSET_DETAILS_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/asset-hire/assets/$ASSET_ID/hire-details" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json")
  
  echo "Response:"
  echo $ASSET_DETAILS_RESPONSE | jq '.data | {asset_name, asset_code, hire_rate_per_day, deposit_amount, is_available, is_hireable}'
  
else
  ERROR=$(echo $MARK_RESPONSE | jq -r '.error')
  echo "⚠️  Could not mark as hireable: $ERROR"
  echo "   (Asset might already be hireable)"
fi

# Test 5: Check equipment hire endpoints
echo -e "\n7. Testing equipment hire endpoints"
echo "   a) GET /api/equipment-hire/equipment"
EQUIPMENT_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/equipment-hire/equipment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

EQUIPMENT_COUNT=$(echo $EQUIPMENT_RESPONSE | jq '.data | length')
echo "   Found $EQUIPMENT_COUNT equipment items"

if [ "$EQUIPMENT_COUNT" -gt 0 ]; then
  echo "   First equipment item:"
  echo $EQUIPMENT_RESPONSE | jq '.data[0] | {asset_name, asset_code, hire_rate_per_day, is_available}'
fi

echo -e "\n   b) GET /api/equipment-hire/equipment/available"
AVAILABLE_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/equipment-hire/equipment/available" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

AVAILABLE_COUNT=$(echo $AVAILABLE_RESPONSE | jq '.data | length')
echo "   Found $AVAILABLE_COUNT available equipment items"

# Database verification
echo -e "\n8. Database verification"
# Get business ID
BUSINESS_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/businesses/config" \
  -H "Authorization: Bearer $TOKEN")
BUSINESS_ID=$(echo $BUSINESS_RESPONSE | jq -r '.data.id')

if [ -n "$BUSINESS_ID" ] && [ "$BUSINESS_ID" != "null" ]; then
  echo "   Business ID: $BUSINESS_ID"
  
  echo -e "\n   Checking database linkage:"
  docker-compose exec db psql -U bizzy_track_user -d bizzy_track -c "
  SELECT 
    fa.asset_name,
    fa.asset_code,
    ea.hire_rate_per_day,
    ea.deposit_amount,
    ea.is_hireable,
    ea.is_available,
    ea.created_at as marked_hireable_at
  FROM fixed_assets fa
  LEFT JOIN equipment_assets ea ON fa.id = ea.asset_id
  WHERE fa.business_id = '$BUSINESS_ID'
    AND fa.category = 'equipment'
  ORDER BY ea.created_at DESC NULLS LAST, fa.asset_name;"
fi

echo -e "\n✅ Asset-Hire Endpoint Testing Complete!"
echo "========================================"
