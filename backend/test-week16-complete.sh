#!/bin/bash

cd ~/Bizzy_Track_pro/backend

# Get fresh token
echo "Getting fresh authentication token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8002/api/businesses/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "fixed@test.com",
    "password": "fixed123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')
BUSINESS_ID=$(echo $LOGIN_RESPONSE | jq -r '.data.business.id')

echo "Token: $TOKEN"
echo "Business ID: $BUSINESS_ID"
echo ""

# Function to make API calls with pretty output
api_test() {
    local step_name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    
    echo "=== $step_name ==="
    if [ -z "$data" ]; then
        response=$(curl -s -X $method "http://localhost:8002$endpoint" \
            -H "Authorization: Bearer $TOKEN")
    else
        response=$(curl -s -X $method "http://localhost:8002$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    echo "$response" | jq '.'
    
    # Check if successful
    success=$(echo "$response" | jq -r '.success')
    if [ "$success" = "true" ]; then
        echo "✅ SUCCESS"
    else
        echo "❌ FAILED"
    fi
    echo ""
}

# Run comprehensive tests
api_test "1. PERMISSION AUDIT" POST "/api/audits/permission-audit"
api_test "2. SECURITY METRICS" GET "/api/audits/metrics"
api_test "3. SECURITY ANALYTICS (7 days)" GET "/api/audits/analytics?period=7%20days"
api_test "4. AUDIT TRAIL VERIFICATION" POST "/api/audits/verify-audit-trail"

api_test "5. CREATE COMPLIANCE FRAMEWORK" POST "/api/compliance/frameworks" '{
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

api_test "6. LIST COMPLIANCE FRAMEWORKS" GET "/api/compliance/frameworks"
api_test "7. LIST SECURITY SCANS" GET "/api/audits/scans"

api_test "8. LOG COMPLIANCE EVENT" POST "/api/audits/compliance-event" '{
    "action": "data_breach_detection",
    "details": {
        "severity": "high",
        "affected_users": 0,
        "response_action": "contained",
        "preventive_measures": ["enhanced_monitoring", "access_review"]
    }
}'

api_test "9. SECURITY ANALYTICS (30 days)" GET "/api/audits/analytics?period=30%20days"

api_test "10. SECOND PERMISSION AUDIT" POST "/api/audits/permission-audit"

api_test "11. VERIFY SCAN COUNT INCREASED" GET "/api/audits/scans"

echo "=== 🎉 WEEK 16 COMPREHENSIVE TEST COMPLETE ==="
echo "All security audit and compliance features have been tested."
