
#!/bin/bash

echo "=== COMPLETE BACKEND API INVENTORY ==="
echo ""

# 1. List all route files
echo "=== 1. ROUTE FILES ==="
find ~/Bizzy_Track_pro/backend/app/routes -name "*.js" -type f | sort

echo ""
echo "=== 2. CONTROLLER FILES ==="
find ~/Bizzy_Track_pro/backend/app/controllers -name "*.js" -type f | sort

echo ""
echo "=== 3. SERVICE FILES ==="
find ~/Bizzy_Track_pro/backend/app/services -name "*.js" -type f | sort

echo ""
echo "=== 4. API ENDPOINT ANALYSIS ==="

# Check main app.js for registered routes
echo "4.1 Registered routes in app.js:"
grep -n "app.use.*routes" ~/Bizzy_Track_pro/backend/app/index.js || \
grep -n "router\|route" ~/Bizzy_Track_pro/backend/app/index.js | head -20

# Analyze specific route files
echo ""
echo "4.2 Unified Employee Routes:"
cat ~/Bizzy_Track_pro/backend/app/routes/unifiedEmployeeRoutes.js | grep -E "(router\.(get|post|put|delete)|/\*)" | head -20

echo ""
echo "4.3 Workforce Routes:"
cat ~/Bizzy_Track_pro/backend/app/routes/workforceRoutes.js | grep -E "(router\.(get|post|put|delete)|/\*)" | head -30

echo ""
echo "4.4 Staff Routes (Week 9 system):"
find ~/Bizzy_Track_pro/backend -name "*staff*route*.js" -type f | head -5
if [ -f ~/Bizzy_Track_pro/backend/app/routes/staffRoutes.js ]; then
  cat ~/Bizzy_Track_pro/backend/app/routes/staffRoutes.js | grep -E "(router\.(get|post|put|delete)|/\*)" | head -20
fi

echo ""
echo "=== 5. SERVICE LAYER ANALYSIS ==="
echo "5.1 Unified Employee Service methods:"
grep -n "static async\|async " ~/Bizzy_Track_pro/backend/app/services/unifiedEmployeeService.js | head -20

echo ""
echo "5.2 Workforce Service methods:"
grep -n "static async\|async " ~/Bizzy_Track_pro/backend/app/services/workforceService.js | head -20

