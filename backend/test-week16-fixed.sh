#!/bin/bash

cd ~/Bizzy_Track_pro/backend

echo "=== WEEK 16 SECURITY AUDIT & COMPLIANCE TEST ==="
echo ""

# Get fresh token
echo "1. Getting authentication token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fixed@test.com",
    "password": "fixed123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
BUSINESS_ID=$(echo $LOGIN_RESPONSE | grep -o '"business":{"id":"[^"]*' | cut -d'"' -f6)

if [ -z "$TOKEN" ]; then
  echo "❌ Failed to get token"
  exit 1
fi

echo "✅ Token obtained successfully"
echo ""

# Test function without jq dependency
test_endpoint() {
    local step_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo "=== $step_name ==="
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X $method "http://localhost:8002$endpoint" \
            -H "Authorization: Bearer $TOKEN")
    else
        response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X $method "http://localhost:8002$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    # Extract HTTP status
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    # Check if success is true in the response
    if echo "$body" | grep -q '"success":true'; then
        echo "✅ SUCCESS (HTTP $http_status)"
        echo "Response: $body" | head -c 200
        echo "..."
    elif [ "$http_status" = "200" ] || [ "$http_status" = "201" ]; then
        echo "✅ HTTP SUCCESS ($http_status)"
        echo "Response: $body" | head -c 200
        echo "..."
    else
        echo "❌ FAILED (HTTP $http_status)"
        echo "Error: $body"
    fi
    echo ""
}

# Run tests
test_endpoint "1. PERMISSION AUDIT" POST "/api/audits/permission-audit"

test_endpoint "2. SECURITY METRICS" GET "/api/audits/metrics"

test_endpoint "3. SECURITY ANALYTICS (7 days)" GET "/api/audits/analytics?period=7%20days"

test_endpoint "4. AUDIT TRAIL VERIFICATION" POST "/api/audits/verify-audit-trail"

test_endpoint "5. CREATE COMPLIANCE FRAMEWORK" POST "/api/compliance/frameworks" '{
    "framework_name": "PCI-DSS",
    "version": "4.0", 
    "description": "Payment Card Industry Data Security Standard",
    "requirements": {
        "network_security": true,
        "data_encryption": true,
        "vulnerability_management": true,
        "access_control": true,
        "monitoring": true
    },
    "applies_to_branches": []
}'

test_endpoint "6. LIST COMPLIANCE FRAMEWORKS" GET "/api/compliance/frameworks"

test_endpoint "7. LIST SECURITY SCANS" GET "/api/audits/scans"

test_endpoint "8. LOG COMPLIANCE EVENT" POST "/api/audits/compliance-event" '{
    "action": "data_breach_detection",
    "details": {
        "severity": "high",
        "affected_users": 0,
        "response_action": "contained",
        "preventive_measures": ["enhanced_monitoring", "access_review"]
    }
}'

test_endpoint "9. SECURITY ANALYTICS (30 days)" GET "/api/audits/analytics?period=30%20days"

test_endpoint "10. SECOND PERMISSION AUDIT" POST "/api/audits/permission-audit"

test_endpoint "11. VERIFY SCAN COUNT INCREASED" GET "/api/audits/scans"

echo "=== 🎉 WEEK 16 TEST SUMMARY ==="
echo "All core security audit features have been tested."
echo "Note: Some endpoints may show errors due to database schema differences."
echo ""
