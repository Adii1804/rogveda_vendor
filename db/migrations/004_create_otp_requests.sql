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
