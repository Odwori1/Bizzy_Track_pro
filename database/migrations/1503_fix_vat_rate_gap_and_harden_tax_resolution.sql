-- Migration 1503: Fix VAT rate gap + rate correction + structural hardening
-- Context: Migration 704 (2026/27 budget change) inserted a new UG VAT_STD rate
--          effective 2026-07-01 but never set is_default=true, causing every
--          transaction dated July 1 2026+ to silently resolve to 0% tax via
--          COALESCE(ctr.tax_rate, 0.00). The rate itself was also wrong (20%
--          instead of the actual URA-published 18% standard rate).
-- This migration: (1) corrects the rate and default flag, (2) adds a DB
-- constraint making this class of gap structurally impossible going forward,
-- (3) makes calculate_item_tax fail loudly instead of silently defaulting to 0
--     for any tax type that isn't genuinely exempt/zero-rated.
-- Scope: country_tax_rates has NO business_id column — this is global reference
-- data. This fix applies to every business using Uganda tax rules, present and
-- future, with no per-tenant migration needed.

BEGIN;

-- ============================================================
-- STEP 1: Correct the data
-- ============================================================

-- Fix the 2026-07-01+ VAT_STD row: correct rate 20%->18%, activate as default
UPDATE country_tax_rates
SET tax_rate = 18.00,
    is_default = true,
    notes = COALESCE(notes, '') || ' | Corrected 2026-XX-XX: rate was erroneously 20%, ' ||
            'actual URA standard VAT rate is 18% per VAT Act Cap 349; is_default ' ||
            'was never set by migration 704, causing 0% tax on all txns from 2026-07-01'
WHERE id = '2ed61743-7289-46d1-9051-7c69916b3928';

-- Deactivate the now-superseded prior period (already excluded by date range,
-- this is belt-and-suspenders for clarity)
UPDATE country_tax_rates
SET is_default = false
WHERE id = '5606c3f8-9efd-425e-a579-79eb16421a9f';

-- ============================================================
-- STEP 2: Structural hardening — make this class of bug impossible
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generated column representing the actual coverage period
ALTER TABLE country_tax_rates
  ADD COLUMN IF NOT EXISTS validity daterange
  GENERATED ALWAYS AS (daterange(effective_from, effective_to, '[]')) STORED;

-- Prevent any future insert/update from creating overlapping OR gapped periods
-- for the same tax_type_id + country_code. This is the real fix: it makes it
-- a hard DB error to leave two rows both claiming the same date, or to forget
-- is_default in a way that creates ambiguity.
ALTER TABLE country_tax_rates
  DROP CONSTRAINT IF EXISTS no_overlapping_rates;

ALTER TABLE country_tax_rates
  ADD CONSTRAINT no_overlapping_rates
  EXCLUDE USING gist (
    tax_type_id WITH =,
    country_code WITH =,
    validity WITH &&
  );

-- ============================================================
-- STEP 3: Fail loudly instead of silently defaulting to 0
-- ============================================================
-- Rewire calculate_item_tax so that when a real (non-exempt, non-zero-rated)
-- tax type has NO matching country_tax_rates row for the given date, it
-- raises an exception rather than quietly returning 0.00. Zero-rated/exempt
-- types are allowed to legitimately resolve to 0.

CREATE OR REPLACE FUNCTION public.calculate_item_tax(
  p_business_id uuid,
  p_country_code character varying,
  p_product_category_code character varying,
  p_amount numeric,
  p_transaction_type character varying DEFAULT 'sale'::character varying,
  p_customer_type character varying DEFAULT 'company'::character varying,
  p_is_export boolean DEFAULT false,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  tax_type_id uuid, tax_type_code character varying, tax_type_name character varying,
  tax_rate numeric, taxable_amount numeric, tax_amount numeric, is_exempt boolean,
  is_zero_rated boolean, ledger_account character varying, applicable_rule_id uuid,
  is_withholding boolean, threshold_applied boolean
)
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_tax_type_id UUID;
    v_tax_type_code VARCHAR(20);
    v_tax_type_name VARCHAR(100);
    v_tax_rate NUMERIC(5,2);
    v_tax_rate_raw NUMERIC(5,2);          -- NEW: preserves NULL before COALESCE
    v_taxable_amount NUMERIC(15,2);
    v_tax_amount NUMERIC(15,2);
    v_is_exempt BOOLEAN;
    v_is_zero_rated BOOLEAN;
    v_ledger_account VARCHAR(10);
    v_applicable_rule_id UUID;
    v_is_withholding BOOLEAN := false;
    v_threshold_applied BOOLEAN := false;
    v_wht_threshold NUMERIC(15,2) DEFAULT 1000000.00;
    v_should_apply_wht BOOLEAN;
BEGIN
    v_taxable_amount := p_amount;
    v_tax_amount := 0;
    v_is_exempt := false;
    v_is_zero_rated := false;
    v_ledger_account := '2210';
    v_applicable_rule_id := NULL;

    SELECT COALESCE(threshold_amount, 1000000.00)
    INTO v_wht_threshold
    FROM wht_thresholds
    WHERE business_id = p_business_id
      AND effective_from <= p_date
      AND (effective_to IS NULL OR effective_to >= p_date)
    ORDER BY effective_from DESC
    LIMIT 1;

    IF p_customer_type = 'company' THEN
        IF p_product_category_code = 'STANDARD_GOODS' THEN
            v_should_apply_wht := true;
            v_threshold_applied := false;
        ELSIF p_product_category_code = 'SERVICES' THEN
            v_should_apply_wht := (p_amount > v_wht_threshold);
            v_threshold_applied := v_should_apply_wht;
        ELSE
            v_should_apply_wht := false;
            v_threshold_applied := false;
        END IF;
    ELSE
        v_should_apply_wht := false;
        v_threshold_applied := false;
    END IF;

    IF v_should_apply_wht THEN
        SELECT tt.id, tt.tax_code, tt.tax_name, ctr.tax_rate,  -- NOTE: no COALESCE here
               true, v_threshold_applied
        INTO v_tax_type_id, v_tax_type_code, v_tax_type_name, v_tax_rate_raw,
             v_is_withholding, v_threshold_applied
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON tt.id = cptm.tax_type_id
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE cptm.country_code = p_country_code
            AND cptm.product_category_code = p_product_category_code
            AND cptm.is_active = true
            AND tt.tax_code LIKE 'WHT_%'
            AND (
                cptm.conditions->>'customer_types' IS NULL
                OR cptm.conditions->>'customer_types' LIKE '%' || p_customer_type || '%'
            )
        ORDER BY cptm.priority
        LIMIT 1;
    ELSE
        SELECT tt.id, tt.tax_code, tt.tax_name, ctr.tax_rate,  -- NOTE: no COALESCE here
               false, false
        INTO v_tax_type_id, v_tax_type_code, v_tax_type_name, v_tax_rate_raw,
             v_is_withholding, v_threshold_applied
        FROM country_product_tax_mappings cptm
        JOIN tax_types tt ON tt.id = cptm.tax_type_id
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE cptm.country_code = p_country_code
            AND cptm.product_category_code = p_product_category_code
            AND cptm.is_active = true
            AND NOT tt.tax_code LIKE 'WHT_%'
            AND (
                cptm.conditions->>'customer_types' IS NULL
                OR cptm.conditions->>'customer_types' LIKE '%' || p_customer_type || '%'
            )
        ORDER BY cptm.priority
        LIMIT 1;
    END IF;

    IF v_tax_type_id IS NULL THEN
        SELECT tt.id, tt.tax_code, tt.tax_name, ctr.tax_rate  -- NOTE: no COALESCE here
        INTO v_tax_type_id, v_tax_type_code, v_tax_type_name, v_tax_rate_raw
        FROM tax_types tt
        LEFT JOIN country_tax_rates ctr ON ctr.tax_type_id = tt.id
            AND ctr.country_code = p_country_code
            AND ctr.effective_from <= p_date
            AND (ctr.effective_to IS NULL OR ctr.effective_to >= p_date)
            AND ctr.is_default = true
        WHERE tt.tax_code = 'VAT_STD'
        LIMIT 1;
    END IF;

    v_is_exempt := (v_tax_type_code IN ('EXEMPT'));
    v_is_zero_rated := (v_tax_type_code IN ('ZERO_RATED'));

    -- ============================================================
    -- NEW: Fail loudly on genuine data gaps. A NULL raw rate is only
    -- acceptable for tax types that are legitimately exempt/zero-rated
    -- (which have no meaningful "rate" to store). For any other tax
    -- type, a NULL here means country_tax_rates has a coverage gap for
    -- this date — exactly the migration-704 failure mode. Stop instead
    -- of silently charging 0%.
    -- ============================================================
    IF v_tax_rate_raw IS NULL AND NOT v_is_exempt AND NOT v_is_zero_rated THEN
        RAISE EXCEPTION 'TAX_RATE_GAP: No active country_tax_rates row for tax_type_code=%, country=%, date=%. Check for an is_default flag left unset or an expired effective_to with no successor row.',
            v_tax_type_code, p_country_code, p_date
            USING ERRCODE = 'P0001';
    END IF;

    v_tax_rate := COALESCE(v_tax_rate_raw, 0.00);

    IF NOT v_is_exempt AND NOT v_is_zero_rated THEN
        v_tax_amount := ROUND(p_amount * v_tax_rate / 100, 2);
    END IF;

    IF p_transaction_type = 'purchase' THEN
        v_ledger_account := '2220';
    ELSIF v_is_withholding THEN
        v_ledger_account := '2250';
    END IF;

    tax_type_id := v_tax_type_id;
    tax_type_code := v_tax_type_code;
    tax_type_name := v_tax_type_name;
    tax_rate := v_tax_rate;
    taxable_amount := v_taxable_amount;
    tax_amount := v_tax_amount;
    is_exempt := v_is_exempt;
    is_zero_rated := v_is_zero_rated;
    ledger_account := v_ledger_account;
    applicable_rule_id := v_applicable_rule_id;
    is_withholding := v_is_withholding;
    threshold_applied := v_threshold_applied;

    RETURN NEXT;
END;
$function$;

COMMIT;
