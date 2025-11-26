#!/bin/bash

echo "🔍 COMPREHENSIVE INVENTORY FRONTEND ANALYSIS"
echo "============================================="

# 1. Check directory structure
echo ""
echo "1. 📁 DIRECTORY STRUCTURE:"
echo "--------------------------"
find src/app/dashboard/management/inventory -type d 2>/dev/null | sort

# 2. Check all inventory pages
echo ""
echo "2. 📄 PAGE FILES:"
echo "-----------------"
find src/app/dashboard/management/inventory -name "*.tsx" -o -name "*.ts" 2>/dev/null | sort

# 3. Check for CRUD operations in hooks
echo ""
echo "3. 🔧 HOOKS IMPLEMENTATION:"
echo "---------------------------"
if [ -f "src/hooks/week7/useInventory.ts" ]; then
  echo "useInventory.ts methods:"
  grep -E "export const|async function" src/hooks/week7/useInventory.ts | grep -v "//" | head -20
fi

# 4. Check store implementation
echo ""
echo "4. 🏪 STORE IMPLEMENTATION:"
echo "---------------------------"
if [ -f "src/store/week7/inventory-store.ts" ]; then
  echo "inventory-store.ts methods:"
  grep -E "export const|set|update|delete" src/store/week7/inventory-store.ts | grep -v "//" | head -20
fi

# 5. Check for missing dynamic routes
echo ""
echo "5. 🔄 DYNAMIC ROUTES:"
echo "---------------------"
echo "Categories dynamic routes:"
find src/app/dashboard/management/inventory/categories -name "\[*\]" -type d 2>/dev/null
echo ""
echo "Items dynamic routes:"
find src/app/dashboard/management/inventory/items -name "\[*\]" -type d 2>/dev/null

# 6. Check for API endpoint usage
echo ""
echo "6. 🌐 API ENDPOINT USAGE:"
echo "-------------------------"
echo "Checking for our new endpoints in frontend code..."
find src -name "*.tsx" -o -name "*.ts" | xargs grep -l "inventory/categories" 2>/dev/null | while read file; do
  echo "File: $file"
  grep -o "inventory/categories[^\"]*" "$file" 2>/dev/null | sort -u
done

