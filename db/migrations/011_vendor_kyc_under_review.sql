ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_kyc_status_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_kyc_status_check CHECK (
    kyc_status IN ('pending', 'in_progress', 'under_review', 'complete')
);
