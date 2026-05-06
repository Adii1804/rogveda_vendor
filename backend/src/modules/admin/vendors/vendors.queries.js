const db = require('../../../db/index');
const {
    users,
    vendors,
    vendorLeads,
    userPasswordHistory,
    serviceCategories,
} = require('../../../db/schema');
const { eq, and, sql } = require('drizzle-orm');
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
    return await db.transaction(async (tx) => {
        // PRD: account starts Inactive — System Admin must explicitly activate
        const [user] = await tx
            .insert(users)
            .values({
                accountType: 'vendor_primary',
                loginId,
                email,
                mobileNumber: mobileNumber || null,
                passwordHash,
                status: 'inactive',
                passwordResetRequired: true,
                createdBy,
            })
            .returning({ id: users.id, email: users.email, loginId: users.loginId });

        const [vendorRow] = await tx
            .insert(vendors)
            .values({
                userId: user.id,
                serviceCategoryId,
                facilityName: facilityName || null,
            })
            .returning({ id: vendors.id });

        // Store initial password in history so it cannot be reused
        await tx.insert(userPasswordHistory).values({
            userId: user.id,
            passwordHash,
        });

        // Also store in vendors.contact_mobile
        if (mobileNumber) {
            await tx
                .update(vendors)
                .set({ contactMobile: mobileNumber })
                .where(eq(vendors.userId, user.id));
        }

        // NOTE: created_vendor_user_id update removed — column is being dropped
        if (leadId) {
            await tx
                .update(vendorLeads)
                .set({ status: 'approved', updatedAt: new Date() })
                .where(eq(vendorLeads.id, leadId));
        }

        return { user, vendorId: vendorRow.id };
    });
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

    // Build dynamic WHERE conditions as SQL chunks
    const conditions = [];
    if (kyc_status)           conditions.push(sql`v.kyc_status = ${kyc_status}`);
    if (profile_status)       conditions.push(sql`v.profile_status = ${profile_status}`);
    if (service_category_id)  conditions.push(sql`v.service_category_id = ${service_category_id}`);
    if (search) {
        const pattern = `%${search}%`;
        conditions.push(sql`(u.email ILIKE ${pattern} OR v.facility_name ILIKE ${pattern})`);
    }

    const whereClause =
        conditions.length > 0
            ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
            : sql``;

    const result = await db.execute(
        sql`SELECT v.id, v.kyc_status, v.profile_status, v.facility_name,
                   v.city, v.created_at,
                   u.email, u.login_id, u.status AS account_status,
                   sc.name AS category_name
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            JOIN service_categories sc ON sc.id = v.service_category_id
            ${whereClause}
            ORDER BY v.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`
    );

    const countResult = await db.execute(
        sql`SELECT COUNT(*)
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            JOIN service_categories sc ON sc.id = v.service_category_id
            ${whereClause}`
    );

    return {
        vendors: result.rows,
        total: parseInt(countResult.rows[0].count),
    };
};

const getVendorById = async (id) => {
    const result = await db.execute(
        sql`SELECT v.*,
                   u.email, u.login_id, u.status AS account_status, u.created_at AS account_created_at,
                   sc.name AS category_name, sc.slug AS category_slug,
                   approver.email AS profile_approved_by_email
            FROM vendors v
            JOIN users u ON u.id = v.user_id
            JOIN service_categories sc ON sc.id = v.service_category_id
            LEFT JOIN users approver ON approver.id = v.profile_approved_by
            WHERE v.id = ${id}`
    );

    if (!result.rows.length) return null;

    const docsResult = await db.execute(
        sql`SELECT d.*,
                   c.document_name, c.is_mandatory, c.display_order,
                   reviewer.email AS reviewed_by_email
            FROM vendor_kyc_documents d
            JOIN vendor_kyc_checklists c ON c.id = d.checklist_item_id
            LEFT JOIN users reviewer ON reviewer.id = d.reviewed_by
            WHERE d.vendor_id = ${id}
            ORDER BY c.display_order`
    );

    const vendor = result.rows[0];

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
        docsResult.rows.map(async (doc) => {
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
