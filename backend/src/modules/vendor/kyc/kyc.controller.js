const { randomUUID: uuidv4 } = require('crypto');
const db = require('../../../db/index');
const { vendors, vendorKycChecklists, vendorKycDocuments } = require('../../../db/schema');
const { eq, and, sql } = require('drizzle-orm');
const { ok, created, error } = require('../../../utils/response');
const { uploadKycDocument, getSignedUrl } = require('../../../utils/storage');

// GET /vendor/kyc/checklist — what documents does this vendor need to upload?
const getChecklist = async (req, res) => {
    const vendorRows = await db
        .select({
            id: vendors.id,
            serviceCategoryId: vendors.serviceCategoryId,
            kycStatus: vendors.kycStatus,
        })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const vendor = vendorRows[0];

    const checklist = await db.execute(
        sql`SELECT c.id, c.document_name, c.instructions, c.is_mandatory, c.has_renewal, c.display_order,
                   d.id as document_id, d.status as document_status,
                   d.original_file_name, d.uploaded_at, d.rejection_reason, d.renewal_date
            FROM vendor_kyc_checklists c
            LEFT JOIN vendor_kyc_documents d
                ON d.checklist_item_id = c.id AND d.vendor_id = ${vendor.id}
            WHERE c.service_category_id = ${vendor.serviceCategoryId} AND c.is_active = TRUE
            ORDER BY c.display_order ASC`
    );

    const mapped = checklist.rows.map((row) => ({
        ...row,
        description: row.instructions,
    }));

    return ok(res, {
        kyc_status: vendor.kycStatus,
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

    const vendorRows = await db
        .select({ id: vendors.id, serviceCategoryId: vendors.serviceCategoryId })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const vendor = vendorRows[0];

    // Verify checklist item belongs to this vendor's category
    const checklistItem = await db
        .select({ id: vendorKycChecklists.id })
        .from(vendorKycChecklists)
        .where(
            and(
                eq(vendorKycChecklists.id, checklist_item_id),
                eq(vendorKycChecklists.serviceCategoryId, vendor.serviceCategoryId),
                eq(vendorKycChecklists.isActive, true)
            )
        );
    if (!checklistItem.length) return error(res, 'Invalid checklist item for your vendor category');

    // Check if document already exists (update flow — re-upload after rejection)
    const existing = await db
        .select({ id: vendorKycDocuments.id, status: vendorKycDocuments.status })
        .from(vendorKycDocuments)
        .where(
            and(
                eq(vendorKycDocuments.vendorId, vendor.id),
                eq(vendorKycDocuments.checklistItemId, checklist_item_id)
            )
        );

    if (existing.length && existing[0].status === 'approved') {
        return error(res, 'This document is already approved and cannot be replaced');
    }
    if (existing.length && existing[0].status === 'under_review') {
        return error(res, 'This document is currently under review and cannot be replaced');
    }

    const documentId = existing.length ? existing[0].id : uuidv4();
    const storagePath = await uploadKycDocument({
        vendorId: vendor.id,
        documentId,
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
    });

    let docRow;
    if (existing.length) {
        // Re-upload: reset status back to uploaded
        const rows = await db
            .update(vendorKycDocuments)
            .set({
                originalFileName: req.file.originalname,
                storagePath,
                fileSizeBytes: req.file.size,
                mimeType: req.file.mimetype,
                status: 'uploaded',
                rejectionReason: null,
                reviewedBy: null,
                reviewedAt: null,
                updatedAt: new Date(),
            })
            .where(eq(vendorKycDocuments.id, documentId))
            .returning();
        docRow = rows[0];
    } else {
        const rows = await db
            .insert(vendorKycDocuments)
            .values({
                id: documentId,
                vendorId: vendor.id,
                checklistItemId: checklist_item_id,
                originalFileName: req.file.originalname,
                storagePath,
                fileSizeBytes: req.file.size,
                mimeType: req.file.mimetype,
                status: 'uploaded',
            })
            .returning();
        docRow = rows[0];
    }

    // Update vendor kyc_status to in_progress once they start uploading
    await db
        .update(vendors)
        .set({ kycStatus: 'in_progress', updatedAt: new Date() })
        .where(and(eq(vendors.id, vendor.id), eq(vendors.kycStatus, 'pending')));

    return created(res, { document: docRow });
};

// GET /vendor/kyc/documents — my uploaded documents with signed URLs
const getDocuments = async (req, res) => {
    const vendorRows = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const result = await db.execute(
        sql`SELECT d.*, c.document_name, c.is_mandatory
            FROM vendor_kyc_documents d
            JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
            WHERE d.vendor_id = ${vendorRows[0].id}
            ORDER BY c.display_order`
    );

    // Generate signed URLs for each document
    const documents = await Promise.all(
        result.rows.map(async (doc) => {
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
    const vendorRows = await db
        .select({
            id: vendors.id,
            serviceCategoryId: vendors.serviceCategoryId,
            kycStatus: vendors.kycStatus,
        })
        .from(vendors)
        .where(eq(vendors.userId, req.user.user_id));
    if (!vendorRows.length) return error(res, 'Vendor profile not found', 404);

    const vendor = vendorRows[0];

    if (vendor.kycStatus === 'complete') {
        return error(res, 'KYC is already complete');
    }

    const pendingUpload = await db
        .select({ id: vendorKycDocuments.id })
        .from(vendorKycDocuments)
        .where(
            and(eq(vendorKycDocuments.vendorId, vendor.id), eq(vendorKycDocuments.status, 'uploaded'))
        )
        .limit(1);

    if (vendor.kycStatus === 'under_review' && !pendingUpload.length) {
        return error(res, 'KYC is already under review');
    }

    // Check all mandatory items have been uploaded
    const missingResult = await db.execute(
        sql`SELECT c.document_name FROM vendor_kyc_checklists c
            WHERE c.service_category_id = ${vendor.serviceCategoryId} AND c.is_mandatory = TRUE AND c.is_active = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM vendor_kyc_documents d
                  WHERE d.checklist_item_id = c.id AND d.vendor_id = ${vendor.id}
                    AND d.status IN ('uploaded', 'under_review', 'approved')
              )`
    );

    if (missingResult.rows.length) {
        return error(
            res,
            `Please upload all mandatory documents before submitting: ${missingResult.rows.map((m) => m.document_name).join(', ')}`
        );
    }

    // Move all 'uploaded' documents to 'under_review'
    await db
        .update(vendorKycDocuments)
        .set({ status: 'under_review', updatedAt: new Date() })
        .where(
            and(eq(vendorKycDocuments.vendorId, vendor.id), eq(vendorKycDocuments.status, 'uploaded'))
        );

    await db
        .update(vendors)
        .set({ kycStatus: 'under_review', updatedAt: new Date() })
        .where(eq(vendors.id, vendor.id));

    return ok(res, {
        message: 'KYC documents submitted for review. You will be notified once reviewed.',
    });
};

module.exports = { getChecklist, uploadDocument, uploadDocumentByItem, getDocuments, submitKyc };
