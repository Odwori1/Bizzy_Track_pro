// Quick analysis of POS patterns
console.log("Analyzing POS patterns from known working examples...");

// Common patterns we should look for:
const patterns = [
  "posEngine.addItem",
  "useUniversalCartStore",
  "addItem",
  "unitPrice",
  "type: 'product'",
  "sourceModule: 'inventory'"
];

console.log("\nKey insights from product workflow:");
console.log("1. Products use type: 'product'");
console.log("2. Products use sourceModule: 'inventory'");
console.log("3. Metadata includes product_id, sku, stock_quantity");
console.log("4. Items have business_id field");
console.log("\nOur equipment hire should match this pattern but with:");
console.log("- type: 'equipment_hire' (we have this)");
console.log("- sourceModule: 'hire' (we have this)");
console.log("- Proper metadata structure");
