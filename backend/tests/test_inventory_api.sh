#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkMzAzYTY0Yi02ZjUzLTQ1MDUtYmJlZi0xZTY0ODgyZjQ2YjQiLCJidXNpbmVzc0lkIjoiNjI1MzFkMjAtOWRkNy00ZGQ4LTgzNWYtYjI5MThjODdhYTIwIiwiZW1haWwiOiJibGFja0Btb3MuY29tIiwicm9sZSI6Im93bmVyIiwidGltZXpvbmUiOiJBZnJpY2EvTmFpcm9iaSIsImlhdCI6MTc2NzMzOTk0NSwiZXhwIjoxNzY3OTQ0NzQ1fQ.Ds843SAyLwo5odrhonvu9ahoIvwwRtE_BNjKFkIt13g"

echo "=== Testing Inventory Creation API ==="

# Create a new inventory item via API
curl -X POST http://localhost:8002/api/inventory/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test Product",
    "sku": "API-TEST-001",
    "category_id": "c4a4fb98-393e-4f0d-99d7-cb37cbcfdb76",
    "cost_price": 50000,
    "selling_price": 75000,
    "current_stock": 20,
    "min_stock_level": 5,
    "unit_of_measure": "pcs",
    "description": "Testing API inventory creation"
  }' | jq '.'

echo ""
echo "=== Checking Database After API Call ==="

# Check what was actually inserted
psql -U postgres -p 5434 -d bizzytrack_pro
SELECT 
    'Before API Call' as time,
    COUNT(*) as inventory_items_count 
FROM inventory_items 
WHERE business_id = '62531d20-9dd7-4dd8-835f-b2918c87aa20'
UNION ALL
SELECT 
    'After API Call' as time,
    COUNT(*) as inventory_items_count 
FROM inventory_items 
WHERE business_id = '62531d20-9dd7-4dd8-835f-b2918c87aa20'
AND name = 'API Test Product';
