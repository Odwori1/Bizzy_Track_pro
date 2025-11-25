#!/bin/bash
sed -i 's/mw.wallet_type, mw.currency/mw.wallet_type/g' walletService.js
echo "✅ Removed currency column reference from getAllTransactions method"
