-- ============================================================
-- MIGRATION 007 — vendors
-- ============================================================
-- Every vendor has one row in `users` (for login/auth)
-- AND one row in this table (for vendor-specific data).
--
-- Why split across two tables?
-- The `users` table is shared — patients and admins are also in it.
-- Vendor-specific things (KYC status, profile, category) do NOT
-- belong on the shared users table. We keep concerns separate.
--
-- Think of it this way:
--   users     = identity ("who are you? can you log in?")
--   vendors   = business profile ("what is your facility?")
-- ============================================================

CREATE TABLE vendors (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The user account that belongs to this vendor.
    -- UNIQUE = one vendor profile per user account. Always.
    -- ON DELETE CASCADE = if the user is deleted, vendor record goes too.
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

    -- What type of vendor is this?
    -- Hospital, Hotel & Stay, Transport, Diagnostics, Forex, SIM etc.
    -- This determines which KYC checklist they see.
    -- REFERENCES service_categories(id) = must be a valid category.
    service_category_id UUID NOT NULL REFERENCES service_categories(id),

    -- ─── KYC STATUS ────────────────────────────────────────────────
    -- Where is this vendor in the KYC process?
    --
    -- pending     = account created, vendor hasn't uploaded docs yet
    -- in_progress = vendor has uploaded some/all docs, Admin reviewing
    -- complete    = all mandatory docs approved, vendor can set up profile
    --
    -- This is a derived status — it should reflect the state of their
    -- kyc_documents rows. We store it here so we don't have to
    -- aggregate kyc_documents on every request to check if KYC is done.
    kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (kyc_status IN ('pending', 'in_progress', 'complete')),

    kyc_completed_at TIMESTAMPTZ,

    -- ─── PROFILE FIELDS ────────────────────────────────────────────
    -- These are NULL until the vendor fills them in after KYC is done.
    -- All profile fields are nullable at DB level because the vendor
    -- fills them progressively. Mandatory field enforcement happens
    -- in the application layer (Node.js), not the DB.
    -- Why? Because the vendor can save a draft with partial data.
    -- The DB should allow that. Node.js rejects incomplete submissions.

    facility_name   VARCHAR(255),
    city            VARCHAR(100),
    full_address    TEXT,

    -- Max 1000 characters — enforced in Node.js, not the DB.
    -- The DB stores whatever Node.js sends it after validation.
    description     TEXT,

    contact_email   VARCHAR(255),
    contact_mobile  VARCHAR(20),
    website_url     VARCHAR(500),

    -- Facility photos are stored as files in S3/Supabase Storage.
    -- Here we store their URLs as a JSON array.
    -- Example: ["https://cdn.../photo1.jpg", "https://cdn.../photo2.jpg"]
    -- JSONB = binary JSON — PostgreSQL can index and query inside it.
    -- DEFAULT '[]' = starts as an empty array, not NULL.
    -- Max 10 photos — enforced in Node.js.
    facility_photo_urls JSONB NOT NULL DEFAULT '[]',

    -- ─── PROFILE STATUS ────────────────────────────────────────────
    -- draft        = vendor saving profile, not submitted yet
    -- under_review = submitted to Admin for approval
    -- approved     = Admin approved, profile can show on marketplace
    --                (IF at least one Live listing also exists)
    -- rejected     = Admin rejected, vendor must edit and resubmit
    profile_status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (profile_status IN (
            'draft',
            'under_review',
            'approved',
            'rejected'
        )),

    profile_submitted_at    TIMESTAMPTZ,
    profile_approved_at     TIMESTAMPTZ,

    -- Which Admin approved this profile?
    -- NULL until approved.
    -- REFERENCES users(id) = must be a valid admin user.
    -- ON DELETE SET NULL = if the reviewing admin is deleted,
    -- we don't lose the vendor's approved profile.
    profile_approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Why was the profile rejected? Admin must provide this.
    -- NULL when not rejected.
    profile_rejection_reason TEXT,

    -- ─── DEACTIVATION REQUEST ──────────────────────────────────────
    -- Vendors cannot delete their own account.
    -- They can REQUEST deactivation. System Admin acts on it.
    -- These fields track that request.
    deactivation_requested      BOOLEAN NOT NULL DEFAULT FALSE,
    deactivation_reason         TEXT,
    deactivation_requested_at   TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Find a vendor by their user_id — used on every authenticated request
-- ("who is the vendor behind this JWT?")
CREATE INDEX idx_vendors_user_id ON vendors(user_id);

-- Filter vendors by KYC status in Admin dashboard
CREATE INDEX idx_vendors_kyc_status ON vendors(kyc_status);

-- Filter vendors by profile status in Admin dashboard
CREATE INDEX idx_vendors_profile_status ON vendors(profile_status);

-- Filter vendors by category
CREATE INDEX idx_vendors_category ON vendors(service_category_id);

CREATE TRIGGER trg_vendors_updated_at
    BEFORE UPDATE ON vendors
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
