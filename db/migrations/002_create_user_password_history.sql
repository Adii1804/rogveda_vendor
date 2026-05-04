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
