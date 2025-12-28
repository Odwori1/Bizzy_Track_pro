#!/bin/bash

echo "🔐 GENERATE FRESH AUTH TOKEN"
echo "============================"

# Login credentials
EMAIL="fixed@test.com"
PASSWORD="fixed123"

# Make login request
echo "Logging in as $EMAIL..."
RESPONSE=$(curl -s -X POST "http://localhost:8002/api/businesses/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

echo "Raw response: $RESPONSE"

# Extract token - try multiple possible JSON formats
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# If that didn't work, try other possible JSON structures
if [ -z "$TOKEN" ]; then
    TOKEN=$(echo $RESPONSE | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
    TOKEN=$(echo $RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
    TOKEN=$(echo $RESPONSE | grep -o '"authToken":"[^"]*"' | cut -d'"' -f4)
fi

if [ -n "$TOKEN" ]; then
    echo "✅ Token generated successfully"
    echo "TOKEN=\"$TOKEN\""
    echo ""
    echo "Export command:"
    echo "export TOKEN=\"$TOKEN\""
    
    # Save to file for other scripts
    echo "TOKEN=\"$TOKEN\"" > current_token.txt
    echo "Token saved to current_token.txt"
    
    # Also save the full response for debugging
    echo "$RESPONSE" > login_response.json
    echo "Full response saved to login_response.json"
    
    # Test the token
    echo ""
    echo "🔍 Testing token validity..."
    TEST_RESPONSE=$(curl -s -X GET "http://localhost:8002/api/auth/me" \
      -H "Authorization: Bearer $TOKEN")
    echo "Auth test response: $TEST_RESPONSE"
else
    echo "❌ Login failed - could not extract token"
    echo "Full response: $RESPONSE"
    
    # Check for error message
    ERROR_MSG=$(echo $RESPONSE | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$ERROR_MSG" ]; then
        echo "Error message: $ERROR_MSG"
    fi
fi
