
#!/bin/bash

echo "=== COMPLETE FRONTEND ANALYSIS ==="
echo ""

# 1. Frontend API layer structure
echo "=== 1. API LAYER ==="
echo "1.1 API files in lib/api/:"
ls -la ~/Bizzy_Track_pro/frontend/src/lib/api/

echo ""
echo "1.2 Main api.ts structure:"
grep -n "class\|async\|export" ~/Bizzy_Track_pro/frontend/src/lib/api.ts | head -30

echo ""
echo "=== 2. HOOKS ==="
echo "2.1 Available hooks:"
ls -la ~/Bizzy_Track_pro/frontend/src/hooks/*.ts | grep -v node_modules

echo ""
echo "2.2 Hook usage analysis:"
echo "useUnifiedEmployees methods:"
grep -n "const\|async\|return" ~/Bizzy_Track_pro/frontend/src/hooks/useUnifiedEmployees.ts | head -20

echo ""
echo "=== 3. STORES ==="
echo "3.1 Available stores:"
ls -la ~/Bizzy_Track_pro/frontend/src/store/*.ts 2>/dev/null | grep -v node_modules || echo "No store files found"

echo ""
echo "=== 4. TYPES ==="
echo "4.1 Type definitions:"
ls -la ~/Bizzy_Track_pro/frontend/src/types/*.ts 2>/dev/null | grep -v node_modules

echo ""
echo "4.2 Workforce types analysis:"
grep -n "interface\|type\|export" ~/Bizzy_Track_pro/frontend/src/types/workforce.ts | head -30

echo ""
echo "4.3 Unified employees types:"
if [ -f ~/Bizzy_Track_pro/frontend/src/types/unifiedEmployees.ts ]; then
  grep -n "interface\|type\|export" ~/Bizzy_Track_pro/frontend/src/types/unifiedEmployees.ts | head -20
else
  echo "No unifiedEmployees.ts found"
fi

echo ""
echo "=== 5. PAGES USING UNIFIED SYSTEM ==="
echo "5.1 Files using useUnifiedEmployees:"
grep -r "useUnifiedEmployees" ~/Bizzy_Track_pro/frontend/src --include="*.tsx" --include="*.ts" | grep -v node_modules

echo ""
echo "5.2 Files using workforce store/hooks:"
grep -r "useWorkforce\|workforceStore" ~/Bizzy_Track_pro/frontend/src --include="*.tsx" --include="*.ts" | grep -v node_modules | head -10

