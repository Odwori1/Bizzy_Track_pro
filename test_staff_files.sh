#!/bin/bash

echo "🧪 STAFF SYSTEM FILE CHECK"
echo "=========================="
echo ""

echo "📁 COMPONENTS:"
echo "--------------"
components_dir="frontend/src/components/staff"
if [ -d "$components_dir" ]; then
  ls -la "$components_dir/" | grep -E "\.tsx$" | while read line; do
    echo "  ${line}"
  done
else
  echo "  ❌ Components directory not found: $components_dir"
fi

echo ""
echo "📄 PAGES:"
echo "---------"
pages_dir="frontend/src/app/dashboard/management/staff"
if [ -d "$pages_dir" ]; then
  find "$pages_dir" -name "page.tsx" | while read page; do
    rel_path=${page#$pages_dir/}
    echo "  ✅ $rel_path"
  done
else
  echo "  ❌ Pages directory not found: $pages_dir"
fi

echo ""
echo "🔧 UTILITIES:"
echo "-------------"
utils=(
  "frontend/src/lib/rolePermissions.ts"
  "frontend/src/lib/currency.ts"
  "frontend/src/lib/date-format.ts"
  "frontend/src/lib/date-utils.ts"
  "frontend/src/lib/api/staff.ts"
  "frontend/src/hooks/useStaff.ts"
  "frontend/src/config/navigation.ts"
)

for util in "${utils[@]}"; do
  if [ -f "$util" ]; then
    echo "  ✅ $(basename "$util")"
  else
    echo "  ❌ $(basename "$util") - NOT FOUND"
  fi
done

echo ""
echo "📊 SUMMARY:"
echo "-----------"
echo "Run this command to start testing:"
echo "  cd ~/Bizzy_Track_pro/frontend && npm run dev"
echo ""
echo "Then open: http://localhost:3003/dashboard/management/staff"
echo "Login with: fixed@test.com / fixed123"
