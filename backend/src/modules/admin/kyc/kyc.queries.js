const pool = require('../../../db/pool');
const { getSignedUrl } = require('../../../utils/storage');

const getKycQueue = async ({ vendor_id, page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;
    const conditions = [`d.status = 'under_review'`];
    const params = [];

    if (vendor_id) {
        params.push(vendor_id);
        conditions.push(`d.vendor_id = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const { rows } = await pool.query(
        `SELECT d.id, d.status, d.original_file_name, d.file_size_bytes,
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
         ${where}
         ORDER BY d.uploaded_at ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) FROM vendor_kyc_documents d ${where}`,
        countParams
    );

    // Generate signed URLs for each document so admins can view the file
    const documents = await Promise.all(
        rows.map(async (doc) => {
            if (!doc.storage_path) return { ...doc, signed_url: null };
            try {
                const signed_url = await getSignedUrl(doc.storage_path, 3600);
                return { ...doc, signed_url };
            } catch {
                return { ...doc, signed_url: null };
            }
        })
    );

    return { documents, total: parseInt(countRows[0].count) };
};

const reviewDocument = async (
    documentId,
    action,
    reviewedBy,
    { rejection_reason, renewal_date } = {}
) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: docRows } = await client.query(
            `UPDATE vendor_kyc_documents SET
                status           = $1,
                reviewed_by      = $2,
                reviewed_at      = NOW(),
                rejection_reason = $3,
                renewal_date     = $4,
                updated_at       = NOW()
             WHERE id = $5 AND status = 'under_review'
             RETURNING vendor_id`,
            [action, reviewedBy, rejection_reason || null, renewal_date || null, documentId]
        );

        if (!docRows.length) {
            throw Object.assign(new Error('Document not found or not under review'), {
                statusCode: 404,
            });
        }

        const { vendor_id } = docRows[0];

        // Recalculate vendor KYC status after every review action
        const { rows: mandatoryItems } = await client.query(
            `SELECT c.id
             FROM vendor_kyc_checklists c
             JOIN vendors v ON v.service_category_id = c.service_category_id
             WHERE v.id = $1 AND c.is_mandatory = TRUE AND c.is_active = TRUE`,
            [vendor_id]
        );

        const { rows: approvedDocs } = await client.query(
            `SELECT d.checklist_item_id
             FROM vendor_kyc_documents d
             JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
             WHERE d.vendor_id = $1 AND d.status = 'approved' AND c.is_mandatory = TRUE`,
            [vendor_id]
        );

        const { rows: urRows } = await client.query(
            `SELECT EXISTS (
                SELECT 1 FROM vendor_kyc_documents d
                WHERE d.vendor_id = $1 AND d.status = 'under_review'
            ) AS has_under_review`,
            [vendor_id]
        );

        const approvedIds = new Set(approvedDocs.map((d) => d.checklist_item_id));
        const allApproved = mandatoryItems.every((item) => approvedIds.has(item.id));
        let newKycStatus = 'in_progress';
        if (allApproved) newKycStatus = 'complete';
        else if (urRows[0]?.has_under_review) newKycStatus = 'under_review';

        await client.query(
            `UPDATE vendors SET
                kyc_status       = $1,
                kyc_completed_at = $2,
                updated_at       = NOW()
             WHERE id = $3`,
            [newKycStatus, allApproved ? new Date() : null, vendor_id]
        );

        const { rows: meta } = await client.query(
            `SELECT d.vendor_id, c.document_name, u.email AS vendor_email
             FROM vendor_kyc_documents d
             JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
             JOIN vendors v ON v.id = d.vendor_id
             JOIN users u ON u.id = v.user_id
             WHERE d.id = $1`,
            [documentId]
        );

        await client.query('COMMIT');
        return {
            vendor_kyc_status: newKycStatus,
            vendor_id: meta[0]?.vendor_id,
            vendor_email: meta[0]?.vendor_email,
            document_name: meta[0]?.document_name,
            action,
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { getKycQueue, reviewDocument };
