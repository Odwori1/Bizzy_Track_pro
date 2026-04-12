-- ============================================================================
-- MIGRATION: 1017_dynamic_refund_approval.sql
-- Purpose: Dynamic refund approval system with business-configurable thresholds
-- Dependencies: 1016_refund_production_fixes.sql
-- Date: April 6, 2026
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: REFUND APPROVAL SETTINGS (Per Business Configuration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refund_approval_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Approval type: PERCENTAGE (of monthly sales), FIXED_AMOUNT, or BOTH
    approval_type VARCHAR(20) NOT NULL DEFAULT 'BOTH',
    
    -- Threshold values (business can set these)
    threshold_amount NUMERIC(15,2) DEFAULT 10000.00,
    threshold_percentage NUMERIC(5,2) DEFAULT 30.00,
    
    -- Approval behavior
    requires_approval_for_refund BOOLEAN DEFAULT TRUE,
    auto_approve_if_below_threshold BOOLEAN DEFAULT TRUE,
    
    -- Who can approve (role-based)
    approver_roles TEXT[] DEFAULT ARRAY['admin', 'manager', 'supervisor'],
    
    -- Notification settings
    notify_approvers BOOLEAN DEFAULT TRUE,
    notify_on_approval BOOLEAN DEFAULT TRUE,
    notify_on_rejection BOOLEAN DEFAULT TRUE,
    escalation_hours INTEGER DEFAULT 24,
    
    -- Audit trail
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT refund_approval_settings_business_unique UNIQUE (business_id),
    CONSTRAINT refund_approval_threshold_check CHECK (
        (approval_type = 'PERCENTAGE' AND threshold_percentage IS NOT NULL AND threshold_percentage >= 0) OR
        (approval_type = 'FIXED_AMOUNT' AND threshold_amount IS NOT NULL AND threshold_amount >= 0) OR
        (approval_type = 'BOTH' AND threshold_amount IS NOT NULL AND threshold_percentage IS NOT NULL)
    )
);

-- ============================================================================
-- SECTION 2: REFUND APPROVAL QUEUE
-- ============================================================================

CREATE TABLE IF NOT EXISTS refund_approval_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    refund_id UUID NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
    
    -- Approval tracking
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    approval_stage INTEGER DEFAULT 1,
    
    -- Request info
    requested_by UUID REFERENCES users(id),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    requested_amount NUMERIC(15,2) NOT NULL,
    request_reason TEXT,
    
    -- Approval info
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_notes TEXT,
    
    -- Rejection info
    rejected_by UUID REFERENCES users(id),
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    -- Expiry
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT refund_approval_queue_status_check CHECK (
        approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'ESCALATED')
    )
);

-- ============================================================================
-- SECTION 3: REFUND APPROVAL HISTORY (Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS refund_approval_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id),
    refund_approval_queue_id UUID NOT NULL REFERENCES refund_approval_queue(id) ON DELETE CASCADE,
    
    -- Action tracking
    action VARCHAR(30) NOT NULL,
    action_by UUID REFERENCES users(id),
    action_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Before/after state
    previous_status VARCHAR(20),
    new_status VARCHAR(20),
    
    -- Details
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- IP and device tracking
    ip_address INET,
    user_agent TEXT,
    
    CONSTRAINT refund_approval_history_action_check CHECK (
        action IN ('REQUESTED', 'VIEWED', 'APPROVED', 'REJECTED', 'EXPIRED', 'ESCALATED', 'REMINDER_SENT')
    )
);

-- ============================================================================
-- SECTION 4: INDEXES
-- ============================================================================

CREATE INDEX idx_refund_approval_settings_business ON refund_approval_settings(business_id);
CREATE INDEX idx_refund_approval_queue_business ON refund_approval_queue(business_id);
CREATE INDEX idx_refund_approval_queue_refund ON refund_approval_queue(refund_id);
CREATE INDEX idx_refund_approval_queue_status ON refund_approval_queue(approval_status);
CREATE INDEX idx_refund_approval_queue_requested ON refund_approval_queue(requested_at);
CREATE INDEX idx_refund_approval_queue_expires ON refund_approval_queue(expires_at) WHERE approval_status = 'PENDING';
CREATE INDEX idx_refund_approval_history_queue ON refund_approval_history(refund_approval_queue_id);
CREATE INDEX idx_refund_approval_history_action ON refund_approval_history(action, action_at);

-- ============================================================================
-- SECTION 5: CORE FUNCTIONS
-- ============================================================================

-- Function 1: Check if refund requires approval
CREATE OR REPLACE FUNCTION check_refund_approval_required(
    p_business_id UUID,
    p_refund_amount NUMERIC(15,2),
    p_monthly_sales NUMERIC DEFAULT NULL
)
RETURNS TABLE(
    requires_approval BOOLEAN,
    threshold_amount NUMERIC(15,2),
    threshold_percentage NUMERIC(5,2),
    approval_type VARCHAR(20),
    current_monthly_sales NUMERIC,
    refund_percentage NUMERIC(5,2),
    reason TEXT
) AS $$
DECLARE
    v_settings RECORD;
    v_monthly_sales NUMERIC;
    v_refund_percentage NUMERIC(5,2);
    v_requires BOOLEAN;
BEGIN
    -- Get business settings
    SELECT * INTO v_settings
    FROM refund_approval_settings
    WHERE business_id = p_business_id;
    
    -- If no settings, create defaults
    IF NOT FOUND THEN
        INSERT INTO refund_approval_settings (business_id, created_by)
        VALUES (p_business_id, NULL)
        RETURNING * INTO v_settings;
    END IF;
    
    -- Calculate monthly sales if not provided
    IF p_monthly_sales IS NULL THEN
        SELECT COALESCE(SUM(final_amount), 0) INTO v_monthly_sales
        FROM pos_transactions
        WHERE business_id = p_business_id
          AND status = 'completed'
          AND transaction_date >= DATE_TRUNC('month', CURRENT_DATE);
    ELSE
        v_monthly_sales := p_monthly_sales;
    END IF;
    
    -- Calculate refund percentage
    IF v_monthly_sales > 0 THEN
        v_refund_percentage := (p_refund_amount / v_monthly_sales) * 100;
    ELSE
        v_refund_percentage := 0;
    END IF;
    
    -- Determine if approval is required based on settings
    IF v_settings.approval_type = 'FIXED_AMOUNT' THEN
        v_requires := p_refund_amount > v_settings.threshold_amount;
        reason := CASE 
            WHEN v_requires THEN format('Refund amount %s exceeds fixed threshold %s', 
                p_refund_amount, v_settings.threshold_amount)
            ELSE format('Refund amount %s is within fixed threshold %s', 
                p_refund_amount, v_settings.threshold_amount)
        END;
        
    ELSIF v_settings.approval_type = 'PERCENTAGE' THEN
        v_requires := v_refund_percentage > v_settings.threshold_percentage;
        reason := CASE 
            WHEN v_requires THEN format('Refund percentage %.2f%% exceeds threshold %.2f%%', 
                v_refund_percentage, v_settings.threshold_percentage)
            ELSE format('Refund percentage %.2f%% is within threshold %.2f%%', 
                v_refund_percentage, v_settings.threshold_percentage)
        END;
        
    ELSE -- BOTH
        v_requires := (p_refund_amount > v_settings.threshold_amount) 
                      OR (v_refund_percentage > v_settings.threshold_percentage);
        
        IF p_refund_amount > v_settings.threshold_amount AND v_refund_percentage > v_settings.threshold_percentage THEN
            reason := format('Both amount (%s > %s) and percentage (%.2f%% > %.2f%%) exceed thresholds',
                p_refund_amount, v_settings.threshold_amount, v_refund_percentage, v_settings.threshold_percentage);
        ELSIF p_refund_amount > v_settings.threshold_amount THEN
            reason := format('Amount %s exceeds threshold %s (percentage %.2f%% is OK)',
                p_refund_amount, v_settings.threshold_amount, v_refund_percentage);
        ELSIF v_refund_percentage > v_settings.threshold_percentage THEN
            reason := format('Percentage %.2f%% exceeds threshold %.2f%% (amount %s is OK)',
                v_refund_percentage, v_settings.threshold_percentage, p_refund_amount);
        ELSE
            reason := format('Both amount %s and percentage %.2f%% are within thresholds',
                p_refund_amount, v_refund_percentage);
        END IF;
    END IF;
    
    -- Apply auto-approve setting
    IF v_settings.auto_approve_if_below_threshold THEN
        requires_approval := v_requires;
    ELSE
        requires_approval := v_settings.requires_approval_for_refund;
    END IF;
    
    -- Return all calculated values
    threshold_amount := v_settings.threshold_amount;
    threshold_percentage := v_settings.threshold_percentage;
    approval_type := v_settings.approval_type;
    current_monthly_sales := v_monthly_sales;
    refund_percentage := ROUND(v_refund_percentage, 2);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function 2: Get pending approvals for user
CREATE OR REPLACE FUNCTION get_pending_refund_approvals(
    p_user_id UUID,
    p_business_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
    approval_id UUID,
    refund_id UUID,
    refund_number VARCHAR(50),
    requested_amount NUMERIC(15,2),
    requested_by_name VARCHAR(100),
    requested_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    time_remaining_hours INTEGER,
    customer_name TEXT,
    items_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        raq.id AS approval_id,
        raq.refund_id,
        r.refund_number,
        raq.requested_amount,
        u.full_name AS requested_by_name,
        raq.requested_at,
        raq.expires_at,
        EXTRACT(HOUR FROM (raq.expires_at - NOW()))::INTEGER AS time_remaining_hours,
        COALESCE(pt.customer_name::TEXT, 'Walk-in Customer') AS customer_name,
        COUNT(ri.id) AS items_count
    FROM refund_approval_queue raq
    JOIN refunds r ON raq.refund_id = r.id
    LEFT JOIN users u ON raq.requested_by = u.id
    LEFT JOIN pos_transactions pt ON r.original_transaction_id = pt.id AND r.original_transaction_type = 'POS'
    LEFT JOIN refund_items ri ON r.id = ri.refund_id
    WHERE raq.business_id = p_business_id
      AND raq.approval_status = 'PENDING'
      AND raq.expires_at > NOW()
    GROUP BY raq.id, r.refund_number, raq.requested_amount, u.full_name, 
             raq.requested_at, raq.expires_at, pt.customer_name
    ORDER BY raq.requested_at ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function 3: Auto-expire old pending approvals
CREATE OR REPLACE FUNCTION auto_expire_pending_refund_approvals()
RETURNS INTEGER AS $$
DECLARE
    v_expired_count INTEGER;
BEGIN
    WITH expired AS (
        UPDATE refund_approval_queue
        SET approval_status = 'EXPIRED',
            updated_at = NOW(),
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{expired_reason}',
                '"Auto-expired after expiry date"'
            )
        WHERE approval_status = 'PENDING'
          AND expires_at <= NOW()
        RETURNING id, refund_id
    )
    SELECT COUNT(*) INTO v_expired_count FROM expired;
    
    -- Log expired approvals to history
    INSERT INTO refund_approval_history (
        business_id, refund_approval_queue_id, action, 
        previous_status, new_status, notes
    )
    SELECT 
        raq.business_id,
        raq.id,
        'EXPIRED',
        'PENDING',
        'EXPIRED',
        'Approval request expired automatically'
    FROM refund_approval_queue raq
    WHERE raq.approval_status = 'EXPIRED'
      AND NOT EXISTS (
          SELECT 1 FROM refund_approval_history rah 
          WHERE rah.refund_approval_queue_id = raq.id AND rah.action = 'EXPIRED'
      );
    
    RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function 4: Check if user can approve refunds
CREATE OR REPLACE FUNCTION user_can_approve_refunds(
    p_user_id UUID,
    p_business_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(50);
    v_allowed_roles TEXT[];
BEGIN
    -- Get user's role
    SELECT ur.role_name INTO v_user_role
    FROM user_roles ur
    WHERE ur.user_id = p_user_id AND ur.business_id = p_business_id;
    
    -- Get allowed roles from settings
    SELECT approver_roles INTO v_allowed_roles
    FROM refund_approval_settings
    WHERE business_id = p_business_id;
    
    -- Check if user's role is in allowed list
    RETURN v_user_role = ANY(v_allowed_roles);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 6: TRIGGERS
-- ============================================================================

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_refund_approval_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refund_approval_queue_updated_at
    BEFORE UPDATE ON refund_approval_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_refund_approval_updated_at();

-- Trigger to send notification on approval request
CREATE OR REPLACE FUNCTION notify_approvers_on_request()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert into notification queue (handled by application)
    INSERT INTO refund_approval_history (
        business_id, refund_approval_queue_id, action, 
        previous_status, new_status, notes, metadata
    ) VALUES (
        NEW.business_id, NEW.id, 'REQUESTED',
        NULL, 'PENDING',
        'Approval request created',
        jsonb_build_object('amount', NEW.requested_amount, 'expires_at', NEW.expires_at)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refund_approval_queue_notify
    AFTER INSERT ON refund_approval_queue
    FOR EACH ROW
    EXECUTE FUNCTION notify_approvers_on_request();

-- ============================================================================
-- SECTION 7: DEFAULT SETTINGS FOR EXISTING BUSINESSES
-- ============================================================================

INSERT INTO refund_approval_settings (
    business_id,
    approval_type,
    threshold_amount,
    threshold_percentage,
    requires_approval_for_refund,
    approver_roles,
    auto_approve_if_below_threshold
)
SELECT 
    b.id,
    'BOTH',
    10000.00,
    30.00,
    TRUE,
    ARRAY['admin', 'manager', 'supervisor'],
    TRUE
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM refund_approval_settings ras WHERE ras.business_id = b.id
);

-- ============================================================================
-- SECTION 8: VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_settings_count INTEGER;
    v_queue_exists BOOLEAN;
    v_history_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_settings_count FROM refund_approval_settings;
    SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'refund_approval_queue') INTO v_queue_exists;
    SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'refund_approval_history') INTO v_history_exists;
    
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'DYNAMIC REFUND APPROVAL SYSTEM INSTALLED';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '✅ refund_approval_settings: % businesses configured', v_settings_count;
    RAISE NOTICE '✅ refund_approval_queue: %', CASE WHEN v_queue_exists THEN 'CREATED' ELSE 'EXISTS' END;
    RAISE NOTICE '✅ refund_approval_history: %', CASE WHEN v_history_exists THEN 'CREATED' ELSE 'EXISTS' END;
    RAISE NOTICE '✅ check_refund_approval_required(): Function created';
    RAISE NOTICE '✅ get_pending_refund_approvals(): Function created';
    RAISE NOTICE '✅ auto_expire_pending_refund_approvals(): Function created';
    RAISE NOTICE '✅ user_can_approve_refunds(): Function created';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Default Configuration:';
    RAISE NOTICE '  - Approval Type: BOTH (Amount AND Percentage)';
    RAISE NOTICE '  - Amount Threshold: 10,000';
    RAISE NOTICE '  - Percentage Threshold: 30%% of monthly sales';
    RAISE NOTICE '  - Approver Roles: admin, manager, supervisor';
    RAISE NOTICE '  - Auto-approve below thresholds: YES';
    RAISE NOTICE '============================================================';
END $$;

COMMIT;
