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
