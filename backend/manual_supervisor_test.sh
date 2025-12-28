#!/bin/bash

echo "👨‍💼 SUPERVISOR TEST SCRIPT"
echo "=========================="
echo ""

echo "STEP 1: Attempt Supervisor Login via API"
echo "---------------------------------------"

# Try the known password first
echo "Attempting API login for supervisor@new.com..."
RESPONSE=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "supervisor@new.com", "password": "supervisor123"}')

echo "API Response: $RESPONSE"

# Extract token
TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "✅ API Login successful!"
    echo "Token obtained: ${TOKEN:0:30}..."
    
    # Test the token immediately
    echo ""
    echo "Testing token on /api/auth/me..."
    curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8002/api/auth/me" | head -c 200
    echo ""
    
else
    echo "❌ API Login failed with supervisor123!"
    echo ""
    
    # Only try passwords that are actually used in YOUR system
    echo "STEP 2: Try Passwords From YOUR System"
    echo "-------------------------------------"
    echo "Based on what we know about your system:"
    echo ""
    
    # Try fixed@test.com's password since it's known to work
    echo "1. Trying 'fixed123' (same as fixed@test.com)..."
    RESPONSE=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
      -H "Content-Type: application/json" \
      -d '{"email": "supervisor@new.com", "password": "fixed123"}')
    
    TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$TOKEN" ]; then
        echo "✅ Works with 'fixed123'!"
    else
        echo "❌ Failed with 'fixed123'"
    fi
    
    # Try password123 if you mentioned it earlier
    echo ""
    echo "2. Trying 'password123' (you mentioned earlier)..."
    RESPONSE=$(curl -s -X POST "http://localhost:8002/api/staff/login" \
      -H "Content-Type: application/json" \
      -d '{"email": "supervisor@new.com", "password": "password123"}')
    
    TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$TOKEN" ]; then
        echo "✅ Works with 'password123'!"
    else
        echo "❌ Failed with 'password123'"
    fi
fi

echo ""
echo "STEP 3: IMPORTANT - Check if Account Exists"
echo "------------------------------------------"
echo "Before trying more passwords, check if the account exists:"
echo ""
echo "Run this SQL query in your database:"
echo "SELECT id, email, role, created_at FROM staff WHERE email = 'supervisor@new.com';"
echo ""
echo "If no results, the account doesn't exist."
echo "You need to create it first through your application or SQL."
