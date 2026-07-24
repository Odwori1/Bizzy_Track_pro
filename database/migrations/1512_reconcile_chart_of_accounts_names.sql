-- =============================================================================
-- Migration 1512: Reconcile chart_of_accounts labels to canonical names
-- =============================================================================
-- Context: Frontend integration audit (July 2026) traced why account_code
-- 1400, 1410, 2300, 3200, 5300, 5400, 5700 (and others) showed different
-- account_name values across different businesses. Root cause: the account-
-- creation function was rewritten at least five times over the product's
-- life, and each rewrite only changed labels for FUTURE businesses via
-- CREATE OR REPLACE — no rewrite ever touched already-existing rows, since
-- every version uses ON CONFLICT (business_id, account_code) DO NOTHING.
--
-- Full traced lineage (all confirmed against migration file contents):
--   071  (one-time backfill, self-dropping function) — oldest surviving
--        labels: 1400=Fixed Assets, 1410=Accumulated Depreciation,
--        2300=Interest Payable, 5600=Depreciation Expense,
--        5700=Interest Expense
--   083 -> 087 -> 087v2 -> 102 — "middle" generation: 1400=Prepaid Expenses,
--        2300=Accrued Expenses, 3200=Owner's Drawings, 5700=Other Expenses
--   099 / 099b (transitional window) — a small group of businesses that
--        registered in this narrow window got duplicate-meaning codes:
--        5300=Rent Expense (duplicating 5203), 5400=Utilities Expense
--        (duplicating 5202) — cleaned up in 102 for accounts created after it
--   1019 (Jun 5, 2026) — bolted 4160 Restock Fee Revenue onto every business
--        that already existed at the time
--   1040 (tax GL integration) — bolted 2125 Input VAT Receivable onto every
--        business that already existed at the time
--   1020 (canonical, matches what 1510 preserved and what is live today) —
--        the current 69-account version all NEW businesses receive
--
-- No financial data is affected by this migration: journal_entries and
-- journal_entry_lines reference chart_of_accounts by account_id (a stable
-- UUID), never by account_name. This migration only updates the display
-- label on existing rows to match the current canonical name for that
-- account_code — it does not touch account_id, account_type, balances, or
-- any transaction history.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Canonical code -> name mapping, taken directly from the live
--    ensure_business_has_complete_accounts() function (preserved in 1510),
--    which is what every new business receives today.
-- -----------------------------------------------------------------------------

CREATE TEMP TABLE canonical_account_names (
    account_code VARCHAR(20) PRIMARY KEY,
    canonical_name VARCHAR(255) NOT NULL
) ON COMMIT DROP;

INSERT INTO canonical_account_names (account_code, canonical_name) VALUES
    ('1000', 'Assets'),
    ('1110', 'Cash'),
    ('1115', 'Credit Notes Receivable'),
    ('1120', 'Bank Account'),
    ('1130', 'Mobile Money'),
    ('1200', 'Accounts Receivable'),
    ('1300', 'Inventory'),
    ('1400', 'Prepaid Expenses'),
    ('1410', 'Land'),
    ('1420', 'Buildings'),
    ('1430', 'Vehicles'),
    ('1440', 'Equipment'),
    ('1450', 'Furniture and Fixtures'),
    ('1460', 'Computers and Software'),
    ('1470', 'Leasehold Improvements'),
    ('1480', 'Other Fixed Assets'),
    ('1490', 'Accumulated Depreciation - Buildings'),
    ('1491', 'Accumulated Depreciation - Vehicles'),
    ('1492', 'Accumulated Depreciation - Equipment'),
    ('1493', 'Accumulated Depreciation - Furniture'),
    ('1494', 'Accumulated Depreciation - Computers'),
    ('1495', 'Accumulated Depreciation - Other Assets'),
    ('1496', 'Gain on Disposal of Assets'),
    ('1497', 'Loss on Disposal of Assets'),
    ('1500', 'Equipment'),
    ('1600', 'Furniture and Fixtures'),
    ('1700', 'Accumulated Depreciation'),
    ('1800', 'Other Assets'),
    ('2000', 'Liabilities'),
    ('2100', 'Accounts Payable'),
    ('2120', 'Sales Tax Payable'),
    ('2125', 'Input VAT Receivable'),
    ('2130', 'WHT Payable'),
    ('2150', 'Refund Liability'),
    ('2200', 'Loans Payable'),
    ('2210', 'Short-term Loans'),
    ('2220', 'Long-term Loans'),
    ('2300', 'Accrued Expenses'),
    ('2400', 'Unearned Revenue'),
    ('2500', 'Other Liabilities'),
    ('3000', 'Equity'),
    ('3100', 'Owner''s Capital'),
    ('3200', 'Owner''s Drawings'),
    ('3300', 'Retained Earnings'),
    ('3400', 'Current Earnings'),
    ('4000', 'Revenue'),
    ('4100', 'Sales Revenue'),
    ('4110', 'Sales Discounts'),
    ('4111', 'Volume Discounts'),
    ('4112', 'Early Payment Discounts'),
    ('4113', 'Promotional Discounts'),
    ('4150', 'Sales Returns & Allowances'),
    ('4160', 'Restock Fee Revenue'),
    ('4200', 'Service Revenue'),
    ('4300', 'Discounts Given'),
    ('4400', 'Other Revenue'),
    ('5000', 'Expenses'),
    ('5100', 'Cost of Goods Sold'),
    ('5200', 'Rent Expense'),
    ('5201', 'Office Supplies Expense'),
    ('5202', 'Utilities Expense'),
    ('5203', 'Rent Expense'),
    ('5204', 'Marketing Expense'),
    ('5205', 'Travel Expense'),
    ('5206', 'Salaries and Wages'),
    ('5209', 'Miscellaneous Expense'),
    ('5300', 'Insurance Expense'),
    ('5400', 'Repairs and Maintenance'),
    ('5500', 'Advertising Expense'),
    ('5600', 'Depreciation Expense'),
    ('5700', 'Other Expenses');

-- -----------------------------------------------------------------------------
-- 2. Pre-update snapshot: how many rows will change, broken down by code.
--    Logged via RAISE NOTICE so it's visible in the migration run output,
--    same pattern as prior migrations in this codebase.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_mismatch_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_mismatch_count
    FROM chart_of_accounts ca
    JOIN canonical_account_names c ON c.account_code = ca.account_code
    WHERE ca.account_name != c.canonical_name;

    RAISE NOTICE 'Reconciliation: % account rows across all businesses will be renamed to canonical labels', v_mismatch_count;
END $$;

-- -----------------------------------------------------------------------------
-- 3. The actual reconciliation: rename every drifted row to the canonical
--    label for its account_code. Only account_name changes — account_id,
--    account_type, is_active, parent_account_id, and all balances are
--    untouched.
-- -----------------------------------------------------------------------------

UPDATE chart_of_accounts ca
SET account_name = c.canonical_name,
    updated_at = NOW()
FROM canonical_account_names c
WHERE ca.account_code = c.account_code
  AND ca.account_name != c.canonical_name;

-- -----------------------------------------------------------------------------
-- 4. Backfill safety net: ensure 2125 and 4160 exist for every business that
--    somehow still lacks them (e.g. an edge-case business created in a gap
--    between backfill migrations). Matches the same conditional pattern
--    used in the original 1019/1040 migrations.
-- -----------------------------------------------------------------------------

INSERT INTO chart_of_accounts (id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at)
SELECT gen_random_uuid(), b.id, '2125', 'Input VAT Receivable', 'asset', true, NOW(), NOW()
FROM businesses b
WHERE EXISTS (SELECT 1 FROM chart_of_accounts ca WHERE ca.business_id = b.id AND ca.account_code = '4100')
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ca WHERE ca.business_id = b.id AND ca.account_code = '2125')
ON CONFLICT (business_id, account_code) DO NOTHING;

INSERT INTO chart_of_accounts (id, business_id, account_code, account_name, account_type, is_active, created_at, updated_at)
SELECT gen_random_uuid(), b.id, '4160', 'Restock Fee Revenue', 'revenue', true, NOW(), NOW()
FROM businesses b
WHERE EXISTS (SELECT 1 FROM chart_of_accounts ca WHERE ca.business_id = b.id AND ca.account_code = '4100')
  AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ca WHERE ca.business_id = b.id AND ca.account_code = '4160')
ON CONFLICT (business_id, account_code) DO NOTHING;

COMMIT;

-- =============================================================================
-- Verification queries (run manually after migration):
--
-- 1. Confirm zero remaining mismatches anywhere:
--    SELECT ca.business_id, ca.account_code, ca.account_name
--    FROM chart_of_accounts ca
--    JOIN (VALUES
--        ('1400','Prepaid Expenses'), ('1410','Land'), ('2300','Accrued Expenses'),
--        ('3200','Owner''s Drawings'), ('5300','Insurance Expense'),
--        ('5400','Repairs and Maintenance'), ('5700','Other Expenses')
--    ) AS c(account_code, canonical_name) ON c.account_code = ca.account_code
--    WHERE ca.account_name != c.canonical_name;
--    -- Expected: 0 rows
--
-- 2. Confirm every business now has an identical set of names for a sample
--    of previously-drifted codes:
--    SELECT account_code, account_name, COUNT(DISTINCT business_id)
--    FROM chart_of_accounts
--    WHERE account_code IN ('1400','1410','2300','3200','5300','5400','5700','2125','4160')
--    GROUP BY account_code, account_name
--    ORDER BY account_code;
--    -- Expected: exactly ONE row per account_code now (was multiple before)
--
-- 3. Spot-check a specific historically-drifted business (Nairobi Studio)
--    now matches canonical labels:
--    SELECT account_code, account_name FROM chart_of_accounts
--    WHERE business_id = 'a8c2e397-9310-4538-9aad-74ca3ce9079f'
--    ORDER BY account_code;
-- =============================================================================
