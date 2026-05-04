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
