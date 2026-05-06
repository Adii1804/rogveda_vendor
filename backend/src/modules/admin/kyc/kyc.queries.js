const db = require('../../../db/index');
const {
    vendorKycDocuments,
    vendorKycChecklists,
    vendors,
    users,
} = require('../../../db/schema');
const { eq, and, sql } = require('drizzle-orm');
const { getSignedUrl } = require('../../../utils/storage');

const getKycQueue = async ({ vendor_id, page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;

    // Always filter by under_review; optionally filter by vendor_id
    const conditions = [sql`d.status = 'under_review'`];
    if (vendor_id) conditions.push(sql`d.vendor_id = ${vendor_id}`);

    const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

    const result = await db.execute(
        sql`SELECT d.id, d.status, d.original_file_name, d.file_size_bytes,
                   d.mime_type, d.uploaded_at, d.updated_at, d.vendor_id,
                   d.storage_path, d.rejection_reason,
                   c.document_name, c.is_mandatory, c.has_renewal,
                   v.facility_name AS vendor_name,
                   u.email AS vendor_email, u.login_id AS vendor_login_id,
                   sc.name AS service_category
            FROM vendor_kyc_documents d
            JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
            JOIN vendors v ON v.id = d.vendor_id
            JOIN users u ON u.id = v.user_id
            JOIN service_categories sc ON sc.id = v.service_category_id
            ${whereClause}
            ORDER BY d.uploaded_at ASC
            LIMIT ${limit} OFFSET ${offset}`
    );

    const countResult = await db.execute(
        sql`SELECT COUNT(*) FROM vendor_kyc_documents d ${whereClause}`
    );

    // Generate signed URLs for each document so admins can view the file
    const documents = await Promise.all(
        result.rows.map(async (doc) => {
            if (!doc.storage_path) return { ...doc, signed_url: null };
            try {
                const signed_url = await getSignedUrl(doc.storage_path, 3600);
                return { ...doc, signed_url };
            } catch {
                return { ...doc, signed_url: null };
            }
        })
    );

    return { documents, total: parseInt(countResult.rows[0].count) };
};

const reviewDocument = async (
    documentId,
    action,
    reviewedBy,
    { rejection_reason, renewal_date } = {}
) => {
    return await db.transaction(async (tx) => {
        const docResult = await tx
            .update(vendorKycDocuments)
            .set({
                status: action,
                reviewedBy,
                reviewedAt: new Date(),
                rejectionReason: rejection_reason || null,
                renewalDate: renewal_date || null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(vendorKycDocuments.id, documentId),
                    eq(vendorKycDocuments.status, 'under_review')
                )
            )
            .returning({ vendorId: vendorKycDocuments.vendorId });

        if (!docResult.length) {
            throw Object.assign(new Error('Document not found or not under review'), {
                statusCode: 404,
            });
        }

        const { vendorId } = docResult[0];

        // Recalculate vendor KYC status after every review action
        const mandatoryItems = await tx.execute(
            sql`SELECT c.id
                FROM vendor_kyc_checklists c
                JOIN vendors v ON v.service_category_id = c.service_category_id
                WHERE v.id = ${vendorId} AND c.is_mandatory = TRUE AND c.is_active = TRUE`
        );

        const approvedDocs = await tx.execute(
            sql`SELECT d.checklist_item_id
                FROM vendor_kyc_documents d
                JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
                WHERE d.vendor_id = ${vendorId} AND d.status = 'approved' AND c.is_mandatory = TRUE`
        );

        const urResult = await tx.execute(
            sql`SELECT EXISTS (
                    SELECT 1 FROM vendor_kyc_documents d
                    WHERE d.vendor_id = ${vendorId} AND d.status = 'under_review'
                ) AS has_under_review`
        );

        const approvedIds = new Set(approvedDocs.rows.map((d) => d.checklist_item_id));
        const allApproved = mandatoryItems.rows.every((item) => approvedIds.has(item.id));
        let newKycStatus = 'in_progress';
        if (allApproved) newKycStatus = 'complete';
        else if (urResult.rows[0]?.has_under_review) newKycStatus = 'under_review';

        await tx
            .update(vendors)
            .set({
                kycStatus: newKycStatus,
                kycCompletedAt: allApproved ? new Date() : null,
                updatedAt: new Date(),
            })
            .where(eq(vendors.id, vendorId));

        const metaResult = await tx.execute(
            sql`SELECT d.vendor_id, c.document_name, u.email AS vendor_email
                FROM vendor_kyc_documents d
                JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
                JOIN vendors v ON v.id = d.vendor_id
                JOIN users u ON u.id = v.user_id
                WHERE d.id = ${documentId}`
        );

        return {
            vendor_kyc_status: newKycStatus,
            vendor_id: metaResult.rows[0]?.vendor_id,
            vendor_email: metaResult.rows[0]?.vendor_email,
            document_name: metaResult.rows[0]?.document_name,
            action,
        };
    });
};

module.exports = { getKycQueue, reviewDocument };
