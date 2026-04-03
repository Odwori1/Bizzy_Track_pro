import { getClient } from '../app/utils/database.js';

const businessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';

async function resetTestWallets() {
  console.log('========================================');
  console.log('RESETTING TEST BUSINESS WALLETS');
  console.log('========================================\n');
  
  const client = await getClient();
  
  try {
    // Check current balances
    console.log('Current wallet balances:');
    const beforeResult = await client.query(`
      SELECT 
          w.id,
          w.wallet_type,
          w.current_balance,
          ca.account_code,
          ca.account_name
      FROM money_wallets w
      JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
      WHERE w.business_id = $1
        AND w.is_active = true
    `, [businessId]);
    
    for (const wallet of beforeResult.rows) {
      console.log(`  ${wallet.wallet_type}: ${wallet.current_balance} (${wallet.account_code} ${wallet.account_name})`);
    }
    
    // Reset to positive balances
    console.log('\n🔄 Resetting wallets to positive balances...');
    await client.query(`
      UPDATE money_wallets
      SET current_balance = 1000000.00,
          updated_at = NOW()
      WHERE business_id = $1
        AND is_active = true
    `, [businessId]);
    
    // Verify new balances
    console.log('\n✅ New wallet balances:');
    const afterResult = await client.query(`
      SELECT 
          w.wallet_type,
          w.current_balance,
          ca.account_code
      FROM money_wallets w
      JOIN chart_of_accounts ca ON w.gl_account_id = ca.id
      WHERE w.business_id = $1
        AND w.is_active = true
    `, [businessId]);
    
    for (const wallet of afterResult.rows) {
      console.log(`  ${wallet.wallet_type}: ${wallet.current_balance} (${wallet.account_code})`);
    }
    
    console.log('\n========================================');
    console.log('✅ WALLETS RESET SUCCESSFULLY!');
    console.log('========================================');
    
  } catch (error) {
    console.error('❌ Error resetting wallets:', error.message);
  } finally {
    client.release();
  }
}

resetTestWallets();
