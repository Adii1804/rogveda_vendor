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
