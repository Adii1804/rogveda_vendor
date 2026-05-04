const pool = require('../../../db/pool');
const { getSignedUrl } = require('../../../utils/storage');

const createVendorAccount = async ({
    email,
    loginId,
    mobileNumber,
    passwordHash,
    serviceCategoryId,
    facilityName,
    createdBy,
    leadId,
}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // PRD: account starts Inactive — System Admin must explicitly activate
        const { rows: userRows } = await client.query(
            `INSERT INTO users (account_type, login_id, email, mobile_number, password_hash, status, password_reset_required, created_by)
             VALUES ('vendor_primary', $1, $2, $3, $4, 'inactive', TRUE, $5)
             RETURNING id, email, login_id`,
            [loginId, email, mobileNumber || null, passwordHash, createdBy]
        );
        const user = userRows[0];

        const { rows: vendorRows } = await client.query(
            `INSERT INTO vendors (user_id, service_category_id, facility_name)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [user.id, serviceCategoryId, facilityName || null]
        );

        // Store initial password in history so it cannot be reused
        await client.query(
            `INSERT INTO user_password_history (user_id, password_hash) VALUES ($1, $2)`,
            [user.id, passwordHash]
        );

        // Also store in vendors.contact_mobile
        if (mobileNumber) {
            await client.query(`UPDATE vendors SET contact_mobile = $1 WHERE user_id = $2`, [
                mobileNumber,
                user.id,
            ]);
        }

        if (leadId) {
            await client.query(
                `UPDATE vendor_leads
                 SET created_vendor_user_id = $1, status = 'approved', updated_at = NOW()
                 WHERE id = $2`,
                [user.id, leadId]
            );
        }

        await client.query('COMMIT');
        return { user, vendorId: vendorRows[0].id };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const getVendors = async ({
    kyc_status,
    profile_status,
    service_category_id,
    search,
    page = 1,
    limit = 20,
}) => {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];

    if (kyc_status) {
        params.push(kyc_status);
        conditions.push(`v.kyc_status = $${params.length}`);
    }
    if (profile_status) {
        params.push(profile_status);
        conditions.push(`v.profile_status = $${params.length}`);
    }
    if (service_category_id) {
        params.push(service_category_id);
        conditions.push(`v.service_category_id = $${params.length}`);
    }
    if (search) {
        params.push(`%${search}%`);
        conditions.push(
            `(u.email ILIKE $${params.length} OR v.facility_name ILIKE $${params.length})`
        );
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await pool.query(
        `SELECT v.id, v.kyc_status, v.profile_status, v.facility_name,
                v.city, v.created_at,
                u.email, u.login_id, u.status AS account_status,
                sc.name AS category_name
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         JOIN service_categories sc ON sc.id = v.service_category_id
         ${where}
         ORDER BY v.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    const countParams = params.slice(0, params.length - 2);
    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         JOIN service_categories sc ON sc.id = v.service_category_id
         ${where}`,
        countParams
    );

    return { vendors: rows, total: parseInt(countRows[0].count) };
};

const getVendorById = async (id) => {
    const { rows } = await pool.query(
        `SELECT v.*,
                u.email, u.login_id, u.status AS account_status, u.created_at AS account_created_at,
                sc.name AS category_name, sc.slug AS category_slug,
                approver.email AS profile_approved_by_email
         FROM vendors v
         JOIN users u ON u.id = v.user_id
         JOIN service_categories sc ON sc.id = v.service_category_id
         LEFT JOIN users approver ON approver.id = v.profile_approved_by
         WHERE v.id = $1`,
        [id]
    );

    if (!rows.length) return null;

    const { rows: docs } = await pool.query(
        `SELECT d.*,
                c.document_name, c.is_mandatory, c.display_order,
                reviewer.email AS reviewed_by_email
         FROM vendor_kyc_documents d
         JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
         LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
         WHERE d.vendor_id = $1
         ORDER BY c.display_order`,
        [id]
    );

    const vendor = rows[0];

    // Generate signed URLs for facility photos
    let facility_photo_previews = [];
    if (vendor.facility_photo_urls?.length) {
        facility_photo_previews = await Promise.all(
            vendor.facility_photo_urls.map((path) =>
                getSignedUrl(path, 3600).catch(() => null)
            )
        );
        facility_photo_previews = facility_photo_previews.filter(Boolean);
    }

    // Generate signed URLs for KYC documents
    const docsWithUrls = await Promise.all(
        docs.map(async (doc) => {
            let signed_url = null;
            if (doc.storage_path) {
                signed_url = await getSignedUrl(doc.storage_path, 3600).catch(() => null);
            }
            return { ...doc, signed_url };
        })
    );

    return { ...vendor, facility_photo_previews, kyc_documents: docsWithUrls };
};

module.exports = { createVendorAccount, getVendors, getVendorById };
