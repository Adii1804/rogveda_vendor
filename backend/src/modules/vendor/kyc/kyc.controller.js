const { randomUUID: uuidv4 } = require('crypto');
const pool = require('../../../db/pool');
const { ok, created, error } = require('../../../utils/response');
const { uploadKycDocument, getSignedUrl } = require('../../../utils/storage');

// GET /vendor/kyc/checklist — what documents does this vendor need to upload?
const getChecklist = async (req, res) => {
    const { rows: vendor } = await pool.query(
        `SELECT v.id, v.service_category_id, v.kyc_status FROM vendors v WHERE v.user_id = $1`,
        [req.user.user_id]
    );
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    const { rows: checklist } = await pool.query(
        `SELECT c.id, c.document_name, c.instructions, c.is_mandatory, c.has_renewal, c.display_order,
                d.id as document_id, d.status as document_status,
                d.original_file_name, d.uploaded_at, d.rejection_reason, d.renewal_date
         FROM vendor_kyc_checklists c
         LEFT JOIN vendor_kyc_documents d
             ON d.checklist_item_id = c.id AND d.vendor_id = $1
         WHERE c.service_category_id = $2 AND c.is_active = TRUE
         ORDER BY c.display_order ASC`,
        [vendor[0].id, vendor[0].service_category_id]
    );

    const mapped = checklist.map((row) => ({
        ...row,
        description: row.instructions,
    }));

    return ok(res, {
        kyc_status: vendor[0].kyc_status,
        checklist: mapped,
    });
};

const uploadDocumentByItem = async (req, res) => {
    req.body = { ...(req.body || {}), checklist_item_id: req.params.item_id };
    return uploadDocument(req, res);
};

// POST /vendor/kyc/documents — upload one document
const uploadDocument = async (req, res) => {
    if (!req.file) return error(res, 'File is required');

    const { checklist_item_id } = req.body;
    if (!checklist_item_id) return error(res, 'checklist_item_id is required');

    const { rows: vendor } = await pool.query(
        `SELECT v.id, v.service_category_id FROM vendors v WHERE v.user_id = $1`,
        [req.user.user_id]
    );
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    // Verify checklist item belongs to this vendor's category
    const { rows: checklistItem } = await pool.query(
        `SELECT id FROM vendor_kyc_checklists
         WHERE id = $1 AND service_category_id = $2 AND is_active = TRUE`,
        [checklist_item_id, vendor[0].service_category_id]
    );
    if (!checklistItem.length) return error(res, 'Invalid checklist item for your vendor category');

    // Check if document already exists (update flow — re-upload after rejection)
    const { rows: existing } = await pool.query(
        `SELECT id, status FROM vendor_kyc_documents WHERE vendor_id = $1 AND checklist_item_id = $2`,
        [vendor[0].id, checklist_item_id]
    );

    if (existing.length && existing[0].status === 'approved') {
        return error(res, 'This document is already approved and cannot be replaced');
    }
    if (existing.length && existing[0].status === 'under_review') {
        return error(res, 'This document is currently under review and cannot be replaced');
    }

    const documentId = existing.length ? existing[0].id : uuidv4();
    const storagePath = await uploadKycDocument({
        vendorId: vendor[0].id,
        documentId,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
    });

    let docRow;
    if (existing.length) {
        // Re-upload: reset status back to uploaded
        const { rows } = await pool.query(
            `UPDATE vendor_kyc_documents SET
                original_file_name = $1, storage_path = $2, file_size_bytes = $3,
                mime_type = $4, status = 'uploaded', rejection_reason = NULL,
                reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
             WHERE id = $5 RETURNING *`,
            [req.file.originalname, storagePath, req.file.size, req.file.mimetype, documentId]
        );
        docRow = rows[0];
    } else {
        const { rows } = await pool.query(
            `INSERT INTO vendor_kyc_documents
                (id, vendor_id, checklist_item_id, original_file_name, storage_path, file_size_bytes, mime_type, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploaded')
             RETURNING *`,
            [
                documentId,
                vendor[0].id,
                checklist_item_id,
                req.file.originalname,
                storagePath,
                req.file.size,
                req.file.mimetype,
            ]
        );
        docRow = rows[0];
    }

    // Update vendor kyc_status to in_progress once they start uploading
    await pool.query(
        `UPDATE vendors SET kyc_status = 'in_progress', updated_at = NOW()
         WHERE id = $1 AND kyc_status = 'pending'`,
        [vendor[0].id]
    );

    return created(res, { document: docRow });
};

// GET /vendor/kyc/documents — my uploaded documents with signed URLs
const getDocuments = async (req, res) => {
    const { rows: vendor } = await pool.query(`SELECT id FROM vendors WHERE user_id = $1`, [
        req.user.user_id,
    ]);
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    const { rows } = await pool.query(
        `SELECT d.*, c.document_name, c.is_mandatory
         FROM vendor_kyc_documents d
         JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
         WHERE d.vendor_id = $1
         ORDER BY c.display_order`,
        [vendor[0].id]
    );

    // Generate signed URLs for each document
    const documents = await Promise.all(
        rows.map(async (doc) => {
            try {
                const signed_url = await getSignedUrl(doc.storage_path);
                return { ...doc, signed_url };
            } catch {
                return { ...doc, signed_url: null };
            }
        })
    );

    return ok(res, { documents });
};

// POST /vendor/kyc/submit — submit all uploaded docs for review
const submitKyc = async (req, res) => {
    const { rows: vendor } = await pool.query(
        `SELECT v.id, v.service_category_id, v.kyc_status FROM vendors v WHERE v.user_id = $1`,
        [req.user.user_id]
    );
    if (!vendor.length) return error(res, 'Vendor profile not found', 404);

    if (vendor[0].kyc_status === 'complete') {
        return error(res, 'KYC is already complete');
    }

    const { rows: pendingUpload } = await pool.query(
        `SELECT 1 FROM vendor_kyc_documents WHERE vendor_id = $1 AND status = 'uploaded' LIMIT 1`,
        [vendor[0].id]
    );
    if (vendor[0].kyc_status === 'under_review' && !pendingUpload.length) {
        return error(res, 'KYC is already under review');
    }

    // Check all mandatory items have been uploaded
    const { rows: missing } = await pool.query(
        `SELECT c.document_name FROM vendor_kyc_checklists c
         WHERE c.service_category_id = $1 AND c.is_mandatory = TRUE AND c.is_active = TRUE
           AND NOT EXISTS (
               SELECT 1 FROM vendor_kyc_documents d
               WHERE d.checklist_item_id = c.id AND d.vendor_id = $2
                 AND d.status IN ('uploaded', 'under_review', 'approved')
           )`,
        [vendor[0].service_category_id, vendor[0].id]
    );

    if (missing.length) {
        return error(
            res,
            `Please upload all mandatory documents before submitting: ${missing.map((m) => m.document_name).join(', ')}`
        );
    }

    // Move all 'uploaded' documents to 'under_review'
    await pool.query(
        `UPDATE vendor_kyc_documents SET status = 'under_review', updated_at = NOW()
         WHERE vendor_id = $1 AND status = 'uploaded'`,
        [vendor[0].id]
    );

    await pool.query(
        `UPDATE vendors SET kyc_status = 'under_review', updated_at = NOW() WHERE id = $1`,
        [vendor[0].id]
    );

    return ok(res, {
        message: 'KYC documents submitted for review. You will be notified once reviewed.',
    });
};

module.exports = { getChecklist, uploadDocument, uploadDocumentByItem, getDocuments, submitKyc };
