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
