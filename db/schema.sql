-- ============================================================
-- MIGRATION 001 — users
-- ============================================================
-- This is the foundation of the entire platform.
-- Every human who touches Rogveda — patient, vendor, admin,
-- system admin — has exactly one row in this table.
-- We do NOT have separate tables per user type.
-- The `account_type` column tells us who they are.
-- ============================================================

CREATE TABLE users (

    -- PRIMARY KEY
    -- UUID = Universally Unique Identifier.
    -- It looks like: a3f8c2d1-4b5e-7f90-8a1b-2c3d4e5f6789
    -- gen_random_uuid() makes PostgreSQL generate one automatically.
    -- We use UUID (not 1,2,3...) because when this platform grows
    -- and you add read replicas, data exports, or new services —
    -- integer IDs from two sources can collide. UUIDs never collide.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- WHO IS THIS USER?
    -- One column that tells us the user type.
    -- vendor_primary = the main vendor account (all vendors in v1)
    -- vendor_sub     = sub-user under a vendor (Phase 2 only, not built yet)
    -- admin          = internal ops team member
    -- system_admin   = root access, created at platform setup
    -- patient        = buyer on rogveda.com
    -- CHECK constraint = the database itself rejects any other value.
    -- You cannot accidentally store "Vendor" or "VENDOR" — only exact matches.
    account_type VARCHAR(20) NOT NULL
        CHECK (account_type IN (
            'patient',
            'vendor_primary',
            'vendor_sub',
            'admin',
            'system_admin'
        )),

    -- LOGIN ID
    -- 10-digit numeric string for vendors, admins, system admins.
    -- NULL for patients (patients log in via email/social, not a login ID).
    -- UNIQUE means no two users can have the same login ID.
    -- We store it as VARCHAR not INTEGER because:
    --   a) it never needs arithmetic done on it
    --   b) if it starts with 0, an integer would drop the leading zero
    login_id VARCHAR(10) UNIQUE,

    -- EMAIL
    -- Every user has an email. Used for OTPs, notifications, credentials.
    -- UNIQUE = no two accounts share the same email.
    -- NOT NULL = cannot be blank.
    -- 255 is the standard max length for email addresses.
    email VARCHAR(255) NOT NULL UNIQUE,

    -- MOBILE NUMBER
    -- Stored as text, not a number. Reason: +234-801-234-5678
    -- has symbols and spaces. An integer cannot hold those.
    -- 20 chars is enough for any international number with country code.
    -- NULL allowed — not all users provide a mobile.
    mobile_number VARCHAR(20),

    -- PASSWORD HASH
    -- We NEVER store the actual password. Ever.
    -- We store a bcrypt hash of the password.
    -- bcrypt hash always produces a 60-character string.
    -- 255 gives room if we ever change the hashing algorithm.
    -- NULL is allowed for patients who use social login (Gmail/Facebook) —
    -- they never set a password.
    password_hash VARCHAR(255),

    -- ACCOUNT STATUS
    -- inactive   = account created but not yet activated by System Admin
    -- active     = fully operational
    -- suspended  = temporarily blocked (e.g. KYC expired)
    -- deactivated = permanently disabled
    -- DEFAULT 'inactive' = every new account starts inactive.
    -- System Admin must explicitly set it to active.
    -- This is the security gate that prevents vendor from logging in
    -- before the vetting call is done.
    status VARCHAR(20) NOT NULL DEFAULT 'inactive'
        CHECK (status IN ('inactive', 'active', 'suspended', 'deactivated')),

    -- PHASE 2 READINESS: WHO CREATED THIS ACCOUNT?
    -- For vendors and admins: the System Admin who created their account.
    -- For patients: NULL (self-registered).
    -- REFERENCES users(id) = this is a foreign key pointing back to
    -- the same users table. The creator is also a user.
    -- ON DELETE SET NULL = if the creating admin is deleted, this becomes NULL.
    -- We don't lose the vendor record just because the creating admin left.
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- PHASE 2 READINESS: MULTI-USER VENDOR ACCOUNTS
    -- In Phase 2, a vendor_primary can create vendor_sub accounts.
    -- This column will point to the vendor_primary's user ID.
    -- In v1, this is always NULL for every record.
    -- We add it now so Phase 2 requires zero schema changes.
    parent_vendor_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- FAILED LOGIN TRACKING
    -- Counts consecutive wrong password attempts.
    -- After 5: account is locked. Resets to 0 on successful login.
    -- DEFAULT 0 = starts at zero for every new account.
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,

    -- ACCOUNT LOCK TIMESTAMP
    -- When an account is locked after 5 failed attempts,
    -- we store the timestamp here.
    -- NULL = not locked.
    -- We use timestamp-based locking (not a boolean) because
    -- it lets us implement "auto-unlock after X hours" in the future.
    locked_until TIMESTAMPTZ,

    -- FORCE PASSWORD RESET FLAG
    -- TRUE = user must reset password before accessing anything.
    -- Set to TRUE when System Admin creates a vendor/admin account.
    -- Set to FALSE after they successfully reset their password.
    -- DEFAULT TRUE because every account created by System Admin
    -- must reset on first login.
    password_reset_required BOOLEAN NOT NULL DEFAULT TRUE,

    -- WHATSAPP (patient-specific, but on shared table)
    -- NULL for vendors and admins — they don't use WhatsApp OTP.
    -- For patients: their WhatsApp number for OTP delivery.
    whatsapp_number VARCHAR(20),
    -- TRUE once the patient has verified their WhatsApp number.
    -- Gates the first booking — patient cannot book without this.
    whatsapp_verified BOOLEAN NOT NULL DEFAULT FALSE,

    -- TIMESTAMPS
    -- created_at = when this row was first inserted. Never changes.
    -- updated_at = when this row was last changed. Updated on every write.
    -- TIMESTAMPTZ = timestamp WITH time zone.
    -- Always store timestamps in UTC. Always.
    -- If you store without timezone and your server moves regions, your
    -- timestamps become meaningless. UTC is the global standard.
    -- NOW() = PostgreSQL function that returns current time.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- ============================================================
-- INDEXES ON users
-- ============================================================
-- An index is like a book's index — instead of reading every page
-- to find "auth", you go to the index, find the page number, go there.
-- Without indexes, every query scans every row. With millions of users,
-- that becomes catastrophically slow.

-- We query users by email constantly (login, OTP sending, notifications).
-- This index makes that lookup instant instead of scanning all rows.
-- UNIQUE already creates an index on email, but we name it explicitly
-- for clarity in query plans.
CREATE INDEX idx_users_email ON users(email);

-- Vendors and admins log in with login_id. Needs to be fast.
CREATE INDEX idx_users_login_id ON users(login_id);

-- We frequently filter users by type (e.g. "get all vendors").
CREATE INDEX idx_users_account_type ON users(account_type);

-- We filter by status constantly (e.g. "is this account active?").
CREATE INDEX idx_users_status ON users(status);

-- ============================================================
-- TRIGGER: auto-update updated_at on every row change
-- ============================================================
-- Without this, you'd have to remember to set updated_at in every
-- single UPDATE query. If you forget once, the timestamp is wrong.
-- This trigger fires automatically on every UPDATE to any row.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
-- ============================================================
-- MIGRATION 002 — user_password_history
-- ============================================================
-- The PRD says: last 3 passwords cannot be reused.
-- When a vendor changes their password, we check this table.
-- If the new password matches any of the last 3 hashes → reject.
--
-- Why a separate table and not columns on users?
-- Because "last 3 passwords" means a list of variable length.
-- You cannot store a list cleanly in a single row's columns.
-- A separate table with one row per password per user is clean,
-- queryable, and easy to expand (if you later want last 5, just
-- change the query — no schema change needed).
-- ============================================================

CREATE TABLE user_password_history (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which user this password belongs to.
    -- NOT NULL = every history entry must have an owner.
    -- ON DELETE CASCADE = if the user is deleted, their history is deleted too.
    -- No orphaned history rows.
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The bcrypt hash of the old password.
    -- We never store plaintext. When checking "is this password reused?"
    -- we run bcrypt.compare(newPassword, oldHash) for each of the last 3.
    password_hash VARCHAR(255) NOT NULL,

    -- When this password was set.
    -- We use this to ORDER BY created_at DESC LIMIT 3
    -- to get the last 3 passwords.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- We always query this table as:
-- SELECT * FROM user_password_history
-- WHERE user_id = $1
-- ORDER BY created_at DESC
-- LIMIT 3
-- This composite index makes that query fast.
CREATE INDEX idx_password_history_user_created
    ON user_password_history(user_id, created_at DESC);
-- ============================================================
-- MIGRATION 003 — sessions
-- ============================================================
-- JWTs are stateless by design — the server does not store them.
-- So why do we have a sessions table?
--
-- Because the PRD requires two things that stateless JWTs cannot do:
--   1. "Account deactivation: session invalidated on next API call"
--   2. "Permission changes take effect instantly on next API call"
--
-- If we relied purely on the JWT, a deactivated vendor could keep
-- using their token until it expires (up to 30 days). That is a
-- serious security hole.
--
-- Solution: every JWT has an ID (jti claim) stored here.
-- On every API call, we check: does this session exist? Is it revoked?
-- If yes to revoked, or no to exist → 401 Unauthorized. Instantly.
--
-- This table is also how we enforce the 30-day session for vendors.
-- ============================================================

CREATE TABLE sessions (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which user owns this session.
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The JWT's unique ID (jti claim).
    -- When we create a JWT, we embed this ID inside it.
    -- On every request, we extract the jti, look it up here,
    -- and check if it has been revoked.
    -- UNIQUE = one session row per token (tokens are never shared).
    jti VARCHAR(255) NOT NULL UNIQUE,

    -- When this session expires.
    -- For vendors: 30 days from creation.
    -- For admins: 8 hours from creation.
    -- After this time, even a non-revoked token is rejected.
    expires_at TIMESTAMPTZ NOT NULL,

    -- IP address of the user when they logged in.
    -- Useful for security auditing: "was this login from Nigeria
    -- when the account has always logged in from Delhi?"
    -- VARCHAR(45) handles both IPv4 (15 chars) and IPv6 (39 chars).
    ip_address VARCHAR(45),

    -- Device/browser info (User-Agent header).
    -- Useful for showing "active sessions" to the user:
    -- "Chrome on Windows • Last active 2 hours ago"
    user_agent TEXT,

    -- When this session was intentionally killed.
    -- NULL = session is still active.
    -- NOT NULL = session has been revoked (logout, deactivation,
    --            forced logout by System Admin, account lock).
    -- We do NOT delete session rows — we mark them revoked.
    -- This gives us a full audit trail of login history.
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Every API request extracts the jti from the token and looks it up.
-- This is the hottest query on the entire platform.
-- The index on jti makes it a constant-time lookup.
CREATE INDEX idx_sessions_jti ON sessions(jti);

-- We also query by user_id when revoking ALL sessions for a user
-- (e.g. "deactivate account → kill all their sessions").
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Cleanup queries filter by expires_at to remove old sessions.
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
-- ============================================================
-- MIGRATION 004 — otp_requests
-- ============================================================
-- OTPs (One-Time Passwords) are used in three places during
-- vendor onboarding:
--
--   1. vendor_lead_verification  → vendor submits email on lead form,
--                                  gets OTP to verify it's their email
--   2. account_unlock            → vendor enters wrong password 5 times,
--                                  gets OTP to unlock their account
--   3. password_reset            → vendor forgot password, gets OTP
--
-- (WhatsApp OTP and booking OTPs are patient-side — not needed yet.)
--
-- Security rules from PRD:
--   - OTP is 6 digits
--   - Expires in 10 minutes
--   - Generating a new OTP invalidates the previous one
--   - We store a HASH of the OTP, not the plaintext
-- ============================================================

CREATE TABLE otp_requests (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who is this OTP for?
    -- This is the email address the OTP was sent to.
    -- NOT a foreign key to users — lead form OTPs are sent before
    -- a user account even exists.
    identifier VARCHAR(255) NOT NULL,

    -- What is this OTP for?
    -- vendor_lead_verification = email verification on lead form
    -- account_unlock           = unlock after 5 failed logins
    -- password_reset           = forgot password flow
    -- (more types will be added when patient module is built)
    otp_type VARCHAR(30) NOT NULL
        CHECK (otp_type IN (
            'vendor_lead_verification',
            'account_unlock',
            'password_reset'
        )),

    -- The bcrypt hash of the 6-digit OTP.
    -- WHY hash an OTP? If your database is ever breached, the attacker
    -- cannot read the OTPs and use them to take over accounts.
    -- When verifying, we run: bcrypt.compare(submittedOTP, storedHash)
    otp_hash VARCHAR(255) NOT NULL,

    -- When this OTP stops being valid.
    -- Set to: NOW() + INTERVAL '10 minutes' at creation time.
    -- The verification endpoint checks: expires_at > NOW()
    -- If not, the OTP is rejected even if the code is correct.
    expires_at TIMESTAMPTZ NOT NULL,

    -- When this OTP was successfully used.
    -- NULL = not yet used.
    -- NOT NULL = already consumed, cannot be used again.
    -- This prevents replay attacks: copy the OTP, use it twice.
    used_at TIMESTAMPTZ,

    -- When we send a new OTP (because the old one expired or
    -- the user requested again), the previous OTP row is marked
    -- here so we know it was superseded.
    -- NULL = this is the current valid OTP for this identifier+type.
    -- NOT NULL = a newer OTP was generated; this one is dead.
    superseded_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- We query by identifier + otp_type to find the latest valid OTP.
-- Example: "find current active OTP for this email for account_unlock"
CREATE INDEX idx_otp_identifier_type
    ON otp_requests(identifier, otp_type);

-- Cleanup job queries by expires_at to delete old OTP rows.
CREATE INDEX idx_otp_expires_at ON otp_requests(expires_at);
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
-- ============================================================
-- MIGRATION 006 — service_categories
-- ============================================================
-- Rogveda serves vendors across multiple categories:
-- Hospital, Hotel & Stay, Transport, Diagnostics, Forex, SIM, etc.
--
-- This table is needed NOW (in onboarding) because:
--   - The KYC checklist is PER CATEGORY (different docs for a
--     hospital vs a cab company vs a forex dealer)
--   - When System Admin creates a vendor account, they assign a category
--   - That category determines which KYC checklist the vendor sees
--
-- This table is also used later by:
--   - Listings (each listing belongs to a category)
--   - Search (category tabs on the patient search interface)
--   - Workflow templates (default template per category)
-- ============================================================

CREATE TABLE service_categories (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Display name. What users see: "Hotel & Stay", "Transport" etc.
    -- UNIQUE = no two categories can have the same name.
    name VARCHAR(100) NOT NULL UNIQUE,

    -- URL-friendly version of the name.
    -- "Hotel & Stay" → "hotel-stay"
    -- Used in API routes and frontend URLs.
    -- UNIQUE = no two categories share a slug.
    slug VARCHAR(100) NOT NULL UNIQUE,

    -- Optional longer description of this category.
    -- Used in the admin portal when configuring categories.
    description TEXT,

    -- Can new listings be created under this category?
    -- TRUE = active, vendors can use it
    -- FALSE = hidden from vendor listing form
    --         (existing listings in this category are NOT affected)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Controls the order categories appear in dropdowns and search tabs.
    -- Smaller number = appears first.
    -- Default 0 = all equal until explicitly ordered.
    display_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

CREATE TRIGGER trg_service_categories_updated_at
    BEFORE UPDATE ON service_categories
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED DATA — default categories at platform launch
-- ============================================================
-- These match exactly what is defined in the PRDs.
-- We insert them as part of this migration so every fresh
-- database (dev, staging, production) has them from day one.

INSERT INTO service_categories (name, slug, description, display_order) VALUES
    ('Medical',           'medical',           'Surgical procedures, treatments, consultations', 1),
    ('Hotel & Stay',      'hotel-stay',        'Accommodation for medical tourists',             2),
    ('Transport',         'transport',         'Airport transfers, local transport',             3),
    ('Diagnostics',       'diagnostics',       'Tests, scans, lab work',                         4),
    ('Forex',             'forex',             'Currency exchange services',                     5),
    ('SIM & Connectivity','sim-connectivity',  'Local SIM cards and data plans',                 6);
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
-- ============================================================
-- MIGRATION 008 — vendor_kyc_checklists
-- ============================================================
-- This table defines WHAT documents each vendor category must provide.
--
-- A Hospital vendor sees:  GST Certificate, Medical Registration, etc.
-- A Transport vendor sees: Vehicle Registration, Driver License, etc.
-- A Forex vendor sees:     RBI License, GST Certificate, etc.
--
-- System Admin configures this checklist per category.
-- Changes apply to NEW KYC submissions only — existing approved
-- KYC is never affected.
--
-- This table has NO vendor-specific data.
-- It is a configuration table: "for category X, require document Y."
-- The actual uploaded documents are in vendor_kyc_documents.
-- ============================================================

CREATE TABLE vendor_kyc_checklists (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which vendor category does this checklist item apply to?
    -- ON DELETE RESTRICT = you cannot delete a service category
    -- if it has KYC checklist items. Prevents accidental data loss.
    service_category_id UUID NOT NULL
        REFERENCES service_categories(id) ON DELETE RESTRICT,

    -- The name of the document.
    -- Example: "GST Certificate", "Medical Registration Certificate",
    --          "Director ID Proof", "Signed NDA"
    document_name VARCHAR(255) NOT NULL,

    -- Instructions shown to the vendor when uploading this document.
    -- Example: "Upload a clear scan of your GST certificate.
    --           Must be valid and show your business name."
    -- NULL = no special instructions.
    instructions TEXT,

    -- Is this document required for KYC to be marked complete?
    -- TRUE  = mandatory — KYC cannot complete without this approved
    -- FALSE = optional — vendor can skip it
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,

    -- Can new vendors still be asked for this document?
    -- TRUE  = shown on KYC form for new vendors in this category
    -- FALSE = hidden from new KYC forms (existing approvals unaffected)
    -- System Admin uses this to retire outdated document requirements.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Order in which documents appear on the KYC form.
    -- Smaller number appears first.
    display_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A category cannot have two checklist items with the same name.
    -- Example: you cannot have "GST Certificate" twice for Medical.
    -- This prevents duplicate requirements for the same category.
    UNIQUE (service_category_id, document_name)

);

-- The main query pattern: "give me all active checklist items for category X"
-- Used when building the KYC upload screen for a new vendor.
CREATE INDEX idx_kyc_checklists_category_active
    ON vendor_kyc_checklists(service_category_id, is_active);

CREATE TRIGGER trg_kyc_checklists_updated_at
    BEFORE UPDATE ON vendor_kyc_checklists
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED DATA — starter KYC checklists per category
-- ============================================================
-- These are sensible defaults to get the platform running.
-- System Admin can add/modify/deactivate items from the dashboard.
-- We reference service_categories by slug to avoid hardcoding UUIDs.

INSERT INTO vendor_kyc_checklists
    (service_category_id, document_name, instructions, is_mandatory, display_order)
SELECT
    sc.id,
    items.document_name,
    items.instructions,
    items.is_mandatory,
    items.display_order
FROM service_categories sc
CROSS JOIN (VALUES
    -- Medical
    ('medical', 'GST Certificate',
     'Upload your valid GST registration certificate showing your business name.',
     TRUE, 1),
    ('medical', 'Medical Registration Certificate',
     'Upload your hospital/clinic registration with the relevant medical authority.',
     TRUE, 2),
    ('medical', 'Director / Owner ID Proof',
     'Government-issued photo ID of the primary director or owner.',
     TRUE, 3),
    ('medical', 'Facility Accreditation Certificate',
     'NABH, JCI, or equivalent accreditation document if applicable.',
     FALSE, 4),

    -- Hotel & Stay
    ('hotel-stay', 'GST Certificate',
     'Upload your valid GST registration certificate.',
     TRUE, 1),
    ('hotel-stay', 'Hotel Registration / License',
     'Upload your local municipal or tourism board hotel registration.',
     TRUE, 2),
    ('hotel-stay', 'Owner / Director ID Proof',
     'Government-issued photo ID of the primary owner or director.',
     TRUE, 3),

    -- Transport
    ('transport', 'GST Certificate',
     'Upload your valid GST registration certificate.',
     TRUE, 1),
    ('transport', 'Vehicle Registration Certificate',
     'Upload registration documents for your primary vehicle(s).',
     TRUE, 2),
    ('transport', 'Commercial Vehicle Permit',
     'Upload your commercial vehicle permit issued by the RTO.',
     TRUE, 3),
    ('transport', 'Owner / Driver ID Proof',
     'Government-issued photo ID of the owner or primary driver.',
     TRUE, 4),

    -- Diagnostics
    ('diagnostics', 'GST Certificate',
     'Upload your valid GST registration certificate.',
     TRUE, 1),
    ('diagnostics', 'Lab Registration Certificate',
     'Upload your NABL or equivalent lab registration document.',
     TRUE, 2),
    ('diagnostics', 'Director / Owner ID Proof',
     'Government-issued photo ID of the primary director or owner.',
     TRUE, 3),

    -- Forex
    ('forex', 'RBI Authorised Dealer License',
     'Upload your RBI-issued money changer / authorised dealer license.',
     TRUE, 1),
    ('forex', 'GST Certificate',
     'Upload your valid GST registration certificate.',
     TRUE, 2),
    ('forex', 'Director / Owner ID Proof',
     'Government-issued photo ID.',
     TRUE, 3),

    -- SIM & Connectivity
    ('sim-connectivity', 'GST Certificate',
     'Upload your valid GST registration certificate.',
     TRUE, 1),
    ('sim-connectivity', 'Telecom Reseller Agreement',
     'Upload your agreement with the telecom operator.',
     TRUE, 2),
    ('sim-connectivity', 'Owner ID Proof',
     'Government-issued photo ID of the owner.',
     TRUE, 3)

) AS items(slug, document_name, instructions, is_mandatory, display_order)
WHERE sc.slug = items.slug;
-- ============================================================
-- MIGRATION 009 — vendor_kyc_documents
-- ============================================================
-- This is where the actual uploaded documents live.
-- Each row = one document uploaded by one vendor.
--
-- The lifecycle of a row:
--   1. Vendor uploads file → row created, status = 'uploaded'
--   2. Vendor submits checklist → status = 'under_review'
--   3. Admin approves → status = 'approved', renewal_date set
--      OR Admin rejects → status = 'rejected', rejection_reason set
--   4. If rejected: vendor re-uploads → same row updated,
--      status resets to 'uploaded', file replaced
--   5. If renewal_date passes: status = 'expired'
--
-- Note on re-uploads: when a vendor re-uploads a rejected doc,
-- we UPDATE the existing row (new file, status reset).
-- We do NOT insert a new row. The audit_log (built later) captures
-- what changed and when. This keeps the query simple:
-- "one row per vendor per checklist item = current state of that doc."
-- ============================================================

CREATE TABLE vendor_kyc_documents (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which vendor submitted this document?
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,

    -- Which checklist item does this document satisfy?
    -- Example: "GST Certificate" for Medical category
    checklist_item_id UUID NOT NULL
        REFERENCES vendor_kyc_checklists(id) ON DELETE RESTRICT,

    -- ─── FILE INFORMATION ──────────────────────────────────────────
    -- The original filename as uploaded by the vendor.
    -- We store this for display: "You uploaded: gst_certificate.pdf"
    original_file_name VARCHAR(500) NOT NULL,

    -- The path/key in storage where the file is saved.
    -- For Supabase Storage: "kyc-documents/vendor-uuid/doc-uuid.pdf"
    -- For S3: "kyc-documents/vendor-uuid/doc-uuid.pdf"
    -- We store the storage path, NOT the full URL.
    -- Full URLs are generated on-demand (pre-signed URLs that expire).
    -- Storing a path instead of a URL = if your storage URL changes,
    -- you don't need to update millions of rows.
    storage_path VARCHAR(1000) NOT NULL,

    -- File size in bytes.
    -- Used to display "2.3 MB" in the UI.
    -- Also used for abuse monitoring.
    -- NULL if not captured at upload time.
    file_size_bytes BIGINT,

    -- File type: 'pdf', 'jpg', 'png' etc.
    -- Used to show the right icon and handle previews correctly.
    mime_type VARCHAR(100),

    -- ─── DOCUMENT STATUS ───────────────────────────────────────────
    -- uploaded     = file saved, not yet submitted for review
    -- under_review = vendor submitted checklist, Admin reviewing
    -- approved     = Admin approved this specific document
    -- rejected     = Admin rejected with a reason
    -- expired      = renewal_date has passed, doc needs re-upload
    status VARCHAR(20) NOT NULL DEFAULT 'uploaded'
        CHECK (status IN (
            'uploaded',
            'under_review',
            'approved',
            'rejected',
            'expired'
        )),

    -- ─── ADMIN REVIEW ──────────────────────────────────────────────
    -- Which Admin reviewed this document?
    -- NULL until reviewed.
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,

    -- Why was it rejected? Admin must provide this on rejection.
    -- NULL when not rejected.
    rejection_reason TEXT,

    -- ─── DOCUMENT EXPIRY ───────────────────────────────────────────
    -- When does this document need to be renewed?
    -- Admin enters this when approving a document.
    -- NULL = document does not expire (e.g. a one-time registration)
    -- NOT NULL = expiry tracking is active for this document.
    --
    -- We use DATE (not TIMESTAMPTZ) because document expiry is
    -- always a date ("expires 31 March 2027"), never a specific time.
    renewal_date DATE,

    -- ─── TIMESTAMPS ────────────────────────────────────────────────
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- ─── CONSTRAINT ────────────────────────────────────────────────
    -- One row per vendor per checklist item.
    -- A vendor cannot have two rows for the same document type.
    -- When they re-upload, we UPDATE this row — not INSERT a new one.
    UNIQUE (vendor_id, checklist_item_id)

);

-- Primary query: "show all documents for vendor X"
-- Used to render the KYC upload screen.
CREATE INDEX idx_kyc_docs_vendor_id
    ON vendor_kyc_documents(vendor_id);

-- Admin review queue: "show all documents with status under_review"
-- across all vendors, sorted by upload time.
CREATE INDEX idx_kyc_docs_status
    ON vendor_kyc_documents(status);

-- Expiry tracking: scheduled job runs daily, finds documents
-- where renewal_date is approaching and sends notifications.
CREATE INDEX idx_kyc_docs_renewal_date
    ON vendor_kyc_documents(renewal_date)
    WHERE renewal_date IS NOT NULL;

-- Composite: "all under_review docs for vendor X"
-- Used in the vendor's own KYC status screen.
CREATE INDEX idx_kyc_docs_vendor_status
    ON vendor_kyc_documents(vendor_id, status);

CREATE TRIGGER trg_kyc_docs_updated_at
    BEFORE UPDATE ON vendor_kyc_documents
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
