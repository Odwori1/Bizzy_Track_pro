const fs = require('fs');

const filePath = 'walletService.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the problematic line
const oldLine = `        SELECT 
          wt.*,
          mw.name as wallet_name,
          mw.wallet_type,
          mw.currency`;
const newLine = `        SELECT 
          wt.*,
          mw.name as wallet_name,
          mw.wallet_type`;

content = content.replace(oldLine, newLine);

fs.writeFileSync(filePath, content);
console.log('✅ Fixed currency column reference in getAllTransactions');
