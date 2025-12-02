#!/bin/bash
echo "Searching for product POS examples..."
grep -r "unitPrice\|SellableItem\|addItem" frontend/src --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" \
  | grep -v "types/sellable-item" \
  | head -20
