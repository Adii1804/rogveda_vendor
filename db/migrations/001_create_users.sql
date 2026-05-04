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
