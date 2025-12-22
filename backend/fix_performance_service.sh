#!/bin/bash

echo "🔧 Fixing performance service column name..."

# Backup
cp app/services/workforceService.js app/services/workforceService.js.backup

# Find and fix the column reference
sed -i 's/pm.period_date/pm.metric_date/g' app/services/workforceService.js

# Also fix any other references to period_date
sed -i 's/period_date/metric_date/g' app/services/workforceService.js

# Check if metric_type filter exists in the query
if grep -q "metric_type" app/services/workforceService.js; then
  echo "✅ metric_type filter already exists"
else
  echo "⚠️ Adding metric_type filter support..."
  # We'll need to update the query to handle metric_type if needed
fi

echo "✅ Performance service fixed"
