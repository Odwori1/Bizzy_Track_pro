: ~/Bizzy_Track_pro/backend/docs/discount-accounting.md
markdown
# Discount Accounting System - Complete Architecture Guide
**Last Updated:** March 15, 2026  
**Version:** 1.0 (Production Ready)  
**Tests Passing:** 129/129 ✅

## Table of Contents
1. [System Overview](#system-overview)
2. [Database Schema](#database-schema)
3. [Service Layer Architecture](#service-layer-architecture)
4. [Business Rules & Logic](#business-rules--logic)
5. [Integration Points](#integration-points)
6. [Key Patterns & Conventions](#key-patterns--conventions)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## System Overview

The Discount Accounting System handles the complete lifecycle of discounts:
- **Creation** - Promotional codes, volume tiers, early payment terms
- **Evaluation** - Rule discovery, stacking logic, conflict detection
- **Approval** - Threshold-based workflow with manager overrides
- **Allocation** - Pro-rata distribution across line items
- **Accounting** - Journal entries, tax impact, reconciliation
- **Analytics** - Usage metrics, ROI, customer behavior
- **Integration** - POS and invoice systems

### Key Business Benefits
- ✅ Prevent discount stacking that erodes margins
- ✅ Automatic approval workflow for large discounts
- ✅ Complete audit trail for all discount activities
- ✅ Real-time analytics on discount effectiveness
- ✅ Seamless integration with POS and invoicing

---

## Database Schema

### Core Discount Tables

#### 1. `promotional_discounts` - Customer-facing promo codes
```sql
CREATE TABLE promotional_discounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    promo_code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value DECIMAL(15,2) NOT NULL,
    min_purchase DECIMAL(15,2),
    max_uses INTEGER,
    times_used INTEGER DEFAULT 0,
    per_customer_limit INTEGER,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_promotional_business_id ON promotional_discounts(business_id);
CREATE INDEX idx_promotional_promo_code ON promotional_discounts(promo_code);
CREATE INDEX idx_promotional_valid_dates ON promotional_discounts(valid_from, valid_to);
2. early_payment_terms - Accounting terms (2/10, n/30)
sql
CREATE TABLE early_payment_terms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    term_name VARCHAR(50) NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL,
    discount_days INTEGER NOT NULL,
    net_days INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_early_payment_business_id ON early_payment_terms(business_id);
3. volume_discount_tiers - Quantity/amount-based discounts
sql
CREATE TABLE volume_discount_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    tier_name VARCHAR(50) NOT NULL,
    min_quantity INTEGER,
    min_amount DECIMAL(15,2),
    discount_percentage DECIMAL(5,2) NOT NULL,
    applies_to VARCHAR(20) DEFAULT 'ALL',
    target_category_id UUID REFERENCES inventory_categories(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (min_quantity IS NOT NULL OR min_amount IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_volume_tiers_business_id ON volume_discount_tiers(business_id);
Allocation Tables
4. discount_allocations - Links discounts to transactions
sql
CREATE TABLE discount_allocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    discount_rule_id UUID,
    promotional_discount_id UUID REFERENCES promotional_discounts(id),
    invoice_id UUID REFERENCES invoices(id),
    pos_transaction_id UUID REFERENCES pos_transactions(id),
    journal_entry_id UUID,
    allocation_number VARCHAR(50) UNIQUE NOT NULL,
    total_discount_amount DECIMAL(15,2) NOT NULL,
    allocation_method VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    applied_at TIMESTAMPTZ,
    void_reason TEXT,
    voided_by UUID REFERENCES users(id),
    voided_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (status IN ('PENDING', 'APPLIED', 'VOID')),
    CHECK (allocation_method IN ('PRO_RATA_AMOUNT', 'PRO_RATA_QUANTITY', 'MANUAL'))
);

-- Critical Indexes
CREATE INDEX idx_discount_allocations_business_id ON discount_allocations(business_id);
CREATE INDEX idx_discount_allocations_invoice_id ON discount_allocations(invoice_id);
CREATE INDEX idx_discount_allocations_transaction_id ON discount_allocations(pos_transaction_id);
CREATE INDEX idx_discount_allocations_status ON discount_allocations(status);
5. discount_allocation_lines - Line-item level allocations
sql
CREATE TABLE discount_allocation_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    allocation_id UUID NOT NULL REFERENCES discount_allocations(id),
    pos_transaction_item_id UUID REFERENCES pos_transaction_items(id),
    invoice_line_item_id UUID REFERENCES invoice_line_items(id),
    line_amount DECIMAL(15,2) NOT NULL,
    discount_amount DECIMAL(15,2) NOT NULL,
    allocation_weight DECIMAL(10,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (pos_transaction_item_id IS NOT NULL OR invoice_line_item_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_discount_lines_allocation_id ON discount_allocation_lines(allocation_id);
Configuration & Analytics
6. discount_settings - Business-specific configuration
sql
CREATE TABLE discount_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL UNIQUE REFERENCES businesses(id),
    approval_threshold NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    auto_approve_up_to NUMERIC(5,2) NOT NULL DEFAULT 0,
    require_approval_for_stacked BOOLEAN DEFAULT false,
    max_discount_per_transaction NUMERIC(5,2),
    default_allocation_method VARCHAR(20) DEFAULT 'PRO_RATA_AMOUNT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);
7. discount_analytics - Usage tracking
sql
CREATE TABLE discount_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    analysis_date DATE NOT NULL,
    discount_rule_id UUID,
    promotional_discount_id UUID REFERENCES promotional_discounts(id),
    times_used INTEGER DEFAULT 0,
    total_discount_amount DECIMAL(15,2) DEFAULT 0,
    total_invoice_amount DECIMAL(15,2) DEFAULT 0,
    unique_customers INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(business_id, analysis_date, discount_rule_id, promotional_discount_id)
);
Enhanced Transaction Tables
8. pos_transactions additions
sql
ALTER TABLE pos_transactions
ADD COLUMN requires_approval BOOLEAN DEFAULT false,
ADD COLUMN approval_id UUID REFERENCES discount_approvals(id),
ADD COLUMN total_discount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN discount_breakdown JSONB;
9. invoices additions
sql
ALTER TABLE invoices
ADD COLUMN requires_approval BOOLEAN DEFAULT false,
ADD COLUMN approval_id UUID REFERENCES discount_approvals(id),
ADD COLUMN total_discount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN discount_breakdown JSONB;
10. invoice_line_items additions
sql
ALTER TABLE invoice_line_items
ADD COLUMN original_unit_price DECIMAL(15,2),
ADD COLUMN discount_rule_id UUID,
ADD COLUMN discount_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN discount_percentage DECIMAL(5,2),
ADD COLUMN discount_approval_id UUID REFERENCES discount_approvals(id);
Chart of Accounts (4 new accounts per business)
Account Code	Account Name	Type	Description
4110	Sales Discounts	revenue (contra)	All sales discounts
4111	Volume Discounts	revenue (contra)	Quantity-based discounts
4112	Early Payment Discounts	revenue (contra)	2/10, n/30 style discounts
4113	Promotional Discounts	revenue (contra)	Campaign and promo codes
Database Functions
1. Generate Allocation Number
sql
CREATE OR REPLACE FUNCTION generate_discount_allocation_number(p_business_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year VARCHAR(4);
    v_month VARCHAR(2);
    v_sequence INTEGER;
    v_result VARCHAR(50);
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::VARCHAR;
    v_month := LPAD(EXTRACT(MONTH FROM CURRENT_DATE)::VARCHAR, 2, '0');
    
    SELECT COALESCE(MAX(SUBSTRING(allocation_number FROM '[0-9]+$')::INTEGER), 0) + 1
    INTO v_sequence
    FROM discount_allocations
    WHERE business_id = p_business_id
      AND allocation_number LIKE 'DA-' || v_year || '-' || v_month || '-%';
    
    v_result := 'DA-' || v_year || '-' || v_month || '-' || LPAD(v_sequence::VARCHAR, 4, '0');
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;
2. Get Discount Account Code
sql
CREATE OR REPLACE FUNCTION get_discount_account_code(p_rule_type VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN CASE UPPER(p_rule_type)
        WHEN 'VOLUME' THEN '4111'
        WHEN 'EARLY_PAYMENT' THEN '4112'
        WHEN 'PROMOTIONAL' THEN '4113'
        WHEN 'PROMO' THEN '4113'
        ELSE '4110'
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
Service Layer Architecture
Service Hierarchy
text
┌─────────────────┐
│  discountCore   │  ← Foundation: calculations, dates, validation
└────────┬────────┘
         ↓
┌─────────────────┐
│  discountRules  │  ← Rule discovery, filtering, prioritization
└────────┬────────┘
         ↓
┌─────────────────────────────────────┐
│       discountRuleEngine            │  ← Master orchestrator
└──────┬──────────────┬───────────────┘
       ↓              ↓
┌──────────────┐ ┌──────────────┐
│   POS/Invoice│ │   Approval   │
│  Integration │ │   Workflow   │
└──────────────┘ └──────────────┘
       ↓              ↓
┌─────────────────────────────────────┐
│        discountAllocation           │  ← Links discounts to transactions
└────────────────┬────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│      discountAccounting             │  ← Journal entries, reconciliation
└────────────────┬────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│      discountAnalytics              │  ← Usage metrics, ROI, recommendations
└─────────────────────────────────────┘
Service Files and Responsibilities
Service File	Methods	Key Responsibilities
discountCore.js	16	Date handling, calculations, validation
discountRules.js	10	Rule discovery, filtering, prioritization
promotionalDiscountService.js	12	Promo code CRUD, validation, stats
earlyPaymentService.js	14	Payment terms, eligibility, journal entries
volumeDiscountService.js	13	Tier management, calculations, bulk ops
discountAllocationService.js	20	Pro-rata allocation, voiding, reporting
discountAccountingService.js	15	Journal entries, reconciliation
discountAnalyticsService.js	22	Usage metrics, ROI, recommendations
discountRuleEngine.js	18	Master orchestrator, approval workflow
discountSettingsService.js	6	Business configuration, dynamic thresholds
Key Patterns in Services
1. All Methods are Static - NO Constructors
javascript
export class ServiceName {
    static async methodName(params) {
        const client = await getClient();
        try {
            await client.query('BEGIN');
            // ... logic with proper error handling
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
2. Date Handling - Use DiscountCore Methods
javascript
// Use DiscountCore for ALL date operations
const today = DiscountCore.toDateOnlyString(new Date());
const isoString = DiscountCore.toUTCISOString(inputDate);
const { startDate, endDate } = DiscountCore.getDateRange('month');
3. User Object Structure (from auth middleware)
javascript
req.user = {
    userId: decoded.userId,        // Also available as req.user.id
    businessId: decoded.businessId, // Also available as req.user.business_id
    email: decoded.email,
    role: decoded.role,
    timezone: decoded.timezone
};

// ALWAYS handle both formats:
const businessId = req.user.businessId || req.user.business_id;
const userId = req.user.userId || req.user.id;
4. Response Format
javascript
// Success
{
    success: true,
    data: { ... },
    message: "Optional success message"
}

// Error
{
    success: false,
    message: "Error description",
    details: "Detailed error (optional)"
}
Business Rules & Logic
1. Discount Stacking Priority
Discounts are applied in this order (highest priority first):

EARLY_PAYMENT - Time-sensitive payment discounts

VOLUME - Quantity or amount-based discounts

CATEGORY - Category-specific discounts

PROMOTIONAL - Promo codes and campaigns

PRICING_RULE - Automatic pricing rules

javascript
// From discountRules.js
static sortByType(discounts) {
    const priority = {
        'EARLY_PAYMENT': 1,
        'VOLUME': 2,
        'CATEGORY': 3,
        'PROMOTIONAL': 4,
        'PRICING_RULE': 5
    };
    
    return [...discounts].sort((a, b) => 
        (priority[a.rule_type] || 99) - (priority[b.rule_type] || 99)
    );
}
2. Stacking Conflict Rules
Cannot stack two discounts of the same type

Non-stackable discounts prevent any other discounts

Maximum total discount cannot exceed original amount

javascript
// From discountCore.js
static canStack(existingDiscounts, newDiscount) {
    // Check if new discount is stackable
    if (newDiscount?.stackable === false) return false;
    
    // Check if any existing discount is non-stackable
    if (existingDiscounts.some(d => d?.stackable === false)) return false;
    
    // Check for conflicting rule types
    const conflictTypes = ['VOLUME', 'PROMOTIONAL', 'EARLY_PAYMENT'];
    for (const type of conflictTypes) {
        const existingOfType = existingDiscounts.filter(d => d?.rule_type === type);
        if (existingOfType.length > 0 && newDiscount?.rule_type === type) {
            return false;
        }
    }
    
    return true;
}
3. Approval Threshold Logic
Discounts above approval_threshold require approval

Threshold is configurable per business in discount_settings

Stacked discounts are evaluated on total percentage

javascript
// From discountCore.js
static requiresApproval(discountPercentage, threshold) {
    if (!discountPercentage || discountPercentage <= 0) return false;
    if (!threshold || threshold <= 0) return false;
    return discountPercentage >= threshold;
}
4. Allocation Methods
PRO_RATA_AMOUNT - Based on line item amounts
javascript
// Example: $60 discount across 3 items
// Item A: $300 → $22.50 discount
// Item B: $400 → $30.00 discount
// Item C: $100 → $7.50 discount
PRO_RATA_QUANTITY - Equal per unit
javascript
// Example: $60 discount across 4 units
// Item A: 1 unit → $15 discount
// Item B: 2 units → $30 discount
// Item C: 1 unit → $15 discount
MANUAL - Custom weights
javascript
// Example: $60 discount with weights [0.5, 0.3, 0.2]
// Item A: $300 → $30 discount
// Item B: $400 → $18 discount
// Item C: $100 → $12 discount
5. Void Handling
Allocations can be voided with a reason

Voided allocations have complete audit trail

Cannot void an allocation that's already voided

javascript
// Void allocation with reason
static async voidAllocation(allocationId, reason, userId, businessId) {
    // Update status to VOID
    // Set void_reason, voided_by, voided_at
    // Log audit trail
}
Integration Points
1. POS Integration
File: posDiscountController.js

Endpoints:

POST /api/pos/transactions-with-discount - Create with discount

POST /api/pos/transactions/:id/apply-discount - Apply to existing

GET /api/pos/transactions/:id/discount-status - Check status

Flow:

text
1. POS transaction data received with promo_code
2. DiscountRuleEngine.calculateFinalPrice() evaluates discounts
3. If discount > threshold → approval workflow triggered
4. If approved/pre-approved → transaction created
5. DiscountAllocationService creates allocation
6. DiscountAccountingService creates journal entries
7. Analytics updated
2. Invoice Integration
File: invoiceDiscountController.js

Endpoints:

POST /api/invoices/with-discount - Create with discount

POST /api/invoices/:id/record-payment-with-discount - Early payment

GET /api/invoices/:id/discount-status - Check status

Early Payment Flow:

text
1. Invoice created with payment_terms_id
2. Customer pays early
3. EarlyPaymentService.calculateEarlyPaymentDiscount()
4. If eligible → discount applied
5. Journal entry created for early payment discount
3. Accounting Integration
File: discountAccountingService.js

Journal Entry Structure:

javascript
// Single discount journal entry
{
    reference_number: "JE-2026-03-00015",
    date: "2026-03-15",
    description: "Discount applied - PROMOTIONAL - WELCOME10",
    lines: [
        { account_code: "4113", amount: 50000, type: "debit" },  // Discount account
        { account_code: "4100", amount: 50000, type: "credit" }  // Revenue account
    ]
}

// Bulk discount journal entry (multiple discounts)
{
    reference_number: "JE-2026-03-00016",
    description: "Multiple discounts applied - 3 discounts",
    total_discount: 65000,
    accounts: ["4111", "4112", "4113"]  // All discount accounts used
}
4. Analytics Integration
File: discountAnalyticsService.js

Key Metrics:

Usage metrics (total uses, unique customers)

Financial impact (revenue erosion, margin impact)

Customer behavior (sensitivity analysis, CLV)

Promotion ROI (cost per acquisition, lift)

Key Patterns & Conventions
1. Test File Pattern
All test files follow this structure:

javascript
async function testSomething() {
    const tests = [];
    
    // Test 1
    try {
        // ... test logic
        tests.push({
            name: 'Test name',
            expected: 'Expected result',
            actual: 'Actual result',
            passed: true/false,
            details: { ... }
        });
    } catch (error) {
        tests.push({
            name: 'Test name',
            expected: 'Success',
            actual: `Error: ${error.message}`,
            passed: false
        });
    }
    
    // ... more tests
    
    // Print results with ✅/❌
    console.log('\n📊 TEST RESULTS:');
    tests.forEach((test, index) => {
        console.log(`${index + 1}. ${test.name}`);
        console.log(`   Result: ${test.passed ? '✅ PASS' : '❌ FAIL'}`);
    });
    
    console.log(`\n📈 SUMMARY: ${passed}/${tests.length} tests passed`);
}
2. Audit Logging Pattern
javascript
await auditLogger.logAction({
    businessId,
    userId,
    action: 'discount_allocation.voided',
    resourceType: 'discount_allocations',
    resourceId: allocation.id,
    oldValues: { status: 'APPLIED' },
    newValues: { 
        status: 'VOID', 
        reason: reason,
        voided_by: userId 
    }
});
3. Error Handling Pattern
javascript
try {
    const result = await someService.method();
    return res.json({ success: true, data: result });
} catch (error) {
    log.error('Error in method:', error);
    return res.status(500).json({
        success: false,
        message: 'Failed to perform operation',
        details: error.message
    });
}
4. Database Transaction Pattern
javascript
const client = await getClient();
try {
    await client.query('BEGIN');
    
    // ... database operations
    
    await client.query('COMMIT');
    return result;
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
}
Troubleshooting Guide
Common Issues and Solutions
1. Allocation Creation Fails
Error: invalid input syntax for type uuid
Cause: Using string IDs instead of proper UUIDs
Solution: Always generate UUIDs with:

javascript
const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};
2. Discount Not Applying
Check:

Is the promo code active? (is_active = true)

Is current date between valid_from and valid_to?

Does transaction meet min_purchase requirement?

Has customer exceeded per_customer_limit?

Has promotion reached max_uses?

3. Approval Not Triggering
Check:

discount_settings table has approval_threshold set

Discount percentage >= threshold

For fixed discounts, percentage = (discount_amount / transaction_amount) * 100

4. Journal Entry Duplicate Error
Error: duplicate key value violates unique constraint
Cause: Attempting to create multiple journal entries for same transaction
Solution: Check if journal entry already exists before creating

5. Test Interference
Symptoms: Tests pass individually but fail when run together
Cause: Test data not properly cleaned up
Solution: Run tests in order: core → rules → types → allocation → accounting → analytics → engine → integration

Quick Reference
Important IDs Used in Tests
javascript
const testBusinessId = 'ac7de9dd-7cc8-41c9-94f7-611a4ade5256';
const testUserId = 'b21278f7-6c12-44f4-95a3-16d20103480a';
const testCustomerId = 'ac0d2540-2e6b-4efe-b890-72c013fdc597';
const testServiceId = 'a7885ecb-ee2e-4702-ac3f-c5e131ea8410';
Key Promo Codes
WELCOME10 - 10% off, active

TEST15 - 15% off, active

TEST16 - 15% off, active (triggers approval at 20%)

FIXED20K - UGX 20,000 fixed discount

Volume Tiers
Bronze: 5+ items → 5% off

Silver: 10+ items → 10% off

Gold: 20+ items → 15% off

Early Payment Terms
2/10, n/30 - 2% off if paid in 10 days, net 30

1/15, n/45 - 1% off if paid in 15 days, net 45

Conclusion
The Discount Accounting System is now 100% complete and production-ready with 129/129 tests passing. It handles the complete discount lifecycle from creation through allocation to accounting and analytics.

For API documentation, see discount-api.md
For usage examples, see discount-examples.md
