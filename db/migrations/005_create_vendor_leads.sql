-- ============================================================
-- MIGRATION 005 — vendor_leads
-- ============================================================
-- When a vendor fills out the lead form at rogveda.com/vendors/join,
-- a row is created here. This is before any vendor account exists.
--
-- The Admin CRM shows these leads and tracks them through
-- the pipeline: New → Contacted → Under Review → Approved/Rejected.
--
-- Important: this table lives on even after the vendor account is
-- created. It is the historical record of how a vendor was acquired.
-- ============================================================

CREATE TABLE vendor_leads (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The email the vendor submitted on the lead form.
    -- NOT NULL = required field on the form.
    -- No UNIQUE constraint here — the same email CAN appear twice
    -- (the duplicate flag handles this, not a constraint).
    -- Why no UNIQUE? Because if someone submits twice accidentally,
    -- we want both submissions recorded so Admin can see it.
    email VARCHAR(255) NOT NULL,

    -- Did the vendor verify this email via OTP?
    -- The lead is only created AFTER successful OTP verification.
    -- So in practice this is always TRUE for rows in this table.
    -- We store it explicitly because it is part of the audit trail:
    -- "yes, this email was verified at lead creation time."
    email_verified BOOLEAN NOT NULL DEFAULT TRUE,

    -- Where is this lead in the pipeline?
    -- new           = just submitted, no action taken
    -- contacted     = Admin has reached out
    -- under_review  = vetting call done, evaluating
    -- approved      = passed vetting, account will be created
    -- rejected      = not suitable
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN (
            'new',
            'contacted',
            'under_review',
            'approved',
            'rejected'
        )),

    -- Is this a duplicate submission?
    -- If the same email already exists in this table, the second
    -- submission sets is_duplicate = TRUE. Admin resolves manually.
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,

    -- Points to the earlier lead if this is a duplicate.
    -- NULL if this is the original (or not a duplicate).
    duplicate_of UUID REFERENCES vendor_leads(id) ON DELETE SET NULL,

    -- Admin notes from the CRM.
    -- Free text. Admin writes call notes, observations, etc.
    notes TEXT,

    -- When should Admin call this lead back?
    -- Admin can set a reminder timestamp. NULL = no reminder set.
    callback_reminder_at TIMESTAMPTZ,

    -- Once approved and account created, this links to the user.
    -- NULL while the lead is still in pipeline.
    -- Populated by System Admin when they create the vendor account.
    created_vendor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Who last updated this lead's status?
    -- NULL for the initial system-created row.
    -- Populated when an Admin changes the status.
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Admins search leads by email constantly ("has this vendor applied before?")
CREATE INDEX idx_vendor_leads_email ON vendor_leads(email);

-- CRM default view: filter by status
CREATE INDEX idx_vendor_leads_status ON vendor_leads(status);

-- Duplicate detection: find all leads with same email
CREATE INDEX idx_vendor_leads_email_status ON vendor_leads(email, status);

CREATE TRIGGER trg_vendor_leads_updated_at
    BEFORE UPDATE ON vendor_leads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
