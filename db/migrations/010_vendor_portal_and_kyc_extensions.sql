-- KYC checklist: track whether expiry/renewal date applies to this document type
ALTER TABLE vendor_kyc_checklists
    ADD COLUMN IF NOT EXISTS has_renewal BOOLEAN NOT NULL DEFAULT FALSE;

-- Plain temp password for resend-credentials flow only (cleared on password change)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS temp_password_plain VARCHAR(6);

-- Admin response when rejecting a vendor deactivation request
ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS deactivation_admin_feedback TEXT;

CREATE TABLE IF NOT EXISTS vendor_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_notifications_vendor_created
    ON vendor_notifications(vendor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_notifications_unread
    ON vendor_notifications(vendor_id)
    WHERE read_at IS NULL;
