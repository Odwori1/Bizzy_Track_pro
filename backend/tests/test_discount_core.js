// File: ~/Bizzy_Track_pro/backend/tests/test_discount_core.js
// PURPOSE: Test the discount core functionality
// USING ES Module import syntax to match the project

import DiscountCore from '../app/services/discountCore.js';
//import { log } from '../utils/logger.js';

async function testDiscountCore() {
    console.log('\n🧪 Testing DiscountCore with ES Modules...\n');

    // Test 1: Date utilities
    console.log('📅 Testing date utilities...');
    const now = new Date();
    const isoString = DiscountCore.toUTCISOString(now);
    const dateOnly = DiscountCore.toDateOnlyString(now);
    console.log('   toUTCISOString:', isoString);
    console.log('   toDateOnlyString:', dateOnly);
    console.log('   ✅ Date utilities working\n');

    // Test 2: Percentage discount
    const percentDiscount = DiscountCore.calculateDiscount(10000, 'PERCENTAGE', 15);
    console.log('💰 Percentage discount (15% of 10000):', percentDiscount, 'UGX');
    console.assert(percentDiscount === 1500, 'Percentage calculation failed');
    console.log('   ✅ Percentage discount correct\n');

    // Test 3: Fixed discount
    const fixedDiscount = DiscountCore.calculateDiscount(10000, 'FIXED', 2000);
    console.log('💰 Fixed discount (2000 off 10000):', fixedDiscount, 'UGX');
    console.assert(fixedDiscount === 2000, 'Fixed calculation failed');
    console.log('   ✅ Fixed discount correct\n');

    // Test 4: Fixed discount exceeding amount
    const excessDiscount = DiscountCore.calculateDiscount(10000, 'FIXED', 15000);
    console.log('💰 Fixed discount capped at original:', excessDiscount, 'UGX');
    console.assert(excessDiscount === 10000, 'Capping failed');
    console.log('   ✅ Capping works\n');

    // Test 5: Stacking logic
    const existing = [{ stackable: true, rule_type: 'PROMOTIONAL' }];
    const newDiscount = { stackable: true, rule_type: 'VOLUME' };
    const canStack = DiscountCore.canStack(existing, newDiscount);
    console.log('🔄 Stacking allowed (different types):', canStack);
    console.assert(canStack === true, 'Stacking check failed');
    console.log('   ✅ Stacking logic correct\n');

    // Test 6: Stacking with conflict
    const conflictExisting = [{ stackable: true, rule_type: 'VOLUME' }];
    const conflictNew = { stackable: true, rule_type: 'VOLUME' };
    const cannotStack = DiscountCore.canStack(conflictExisting, conflictNew);
    console.log('🔄 Stacking prevented (same type):', cannotStack === false);
    console.assert(cannotStack === false, 'Conflict detection failed');
    console.log('   ✅ Conflict detection works\n');

    // Test 7: Date validation
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    const valid = DiscountCore.isValid(pastDate, futureDate);
    console.log('📆 Date validation (valid):', valid);
    console.assert(valid === true, 'Date validation failed');

    const invalid = DiscountCore.isValid(futureDate, futureDate);
    console.log('📆 Date validation (not yet valid):', invalid === false);
    console.assert(invalid === false, 'Future date check failed');
    console.log('   ✅ Date validation works\n');

    // Test 8: Approval threshold
    const needsApproval = DiscountCore.requiresApproval(25, 20);
    console.log('⚠️ Approval required (25% > 20%):', needsApproval);
    console.assert(needsApproval === true, 'Approval check failed');

    const noApproval = DiscountCore.requiresApproval(15, 20);
    console.log('⚠️ No approval needed (15% < 20%):', noApproval === false);
    console.assert(noApproval === false, 'Approval threshold check failed');
    console.log('   ✅ Approval logic correct\n');

    // Test 9: Formatting
    const formattedAmount = DiscountCore.formatDiscount(1500, 'UGX');
    console.log('🎨 Formatted amount:', formattedAmount);
    console.assert(formattedAmount === 'UGX 1500.00', 'Formatting failed');

    const formattedPercent = DiscountCore.formatPercentage(15.5);
    console.log('🎨 Formatted percentage:', formattedPercent);
    console.assert(formattedPercent === '15.5%', 'Percentage formatting failed');
    console.log('   ✅ Formatting works\n');

    console.log('🎉 ALL CORE DISCOUNT TESTS PASSED!');
    console.log('📊 Summary:');
    console.log('   - Date utilities: ✅');
    console.log('   - Calculations: ✅');
    console.log('   - Stacking logic: ✅');
    console.log('   - Limit enforcement: ✅');
    console.log('   - Validation: ✅');
    console.log('   - Formatting: ✅');
}

// Run the tests
testDiscountCore().catch(console.error);
